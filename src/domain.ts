import {source1YorkIdentity,source1YorkEvidence} from './identity.js';
import { z } from 'zod';
import {originSchema} from './geocoding.js';
export const suppliers = ['johnstone', 'partstown', 'grainger'] as const;
export const supplierSchema = z.enum(suppliers);
export const inputSchema = z.object({
  mode: z.enum(['fixture', 'live']).default('fixture'),
  stopAfter: z.enum(['guide', 'parts', 'capture', 'sourcing','comparison']).default('sourcing'),
  model: z.string().min(1).max(120).optional(),
  origin: originSchema.optional(),
  suppliers: z.array(supplierSchema).min(1).max(3).default([...suppliers]),
  lines: z.array(z.object({ name: z.string().min(1).max(150), partNumber: z.string().max(100).optional(),
    manufacturer: z.string().max(100).optional(), quantity: z.number().int().positive().max(10000).default(1) })).min(1).max(10),
  allowAlternatives: z.boolean().default(false),
  simulateRecovery: z.boolean().default(false),
}).strict();
export type SearchInput = z.infer<typeof inputSchema>;
export const offerSchema = z.object({
  manufacturer: z.string(), partNumber: z.string(), supplierSku: z.string().nullable(), description: z.string(),
  price: z.number().nonnegative().nullable(), currency: z.enum(['USD']).nullable(),
  unit: z.string().nullable(), packSize: z.number().int().positive().nullable(),
  branch: z.string().nullable(), stockQuantity: z.number().nonnegative().nullable(),
  stockText: z.string(), pickupReady: z.boolean().nullable(),
  shippingText: z.string().nullable(), condition: z.string().nullable(),
});
export type RawOffer = z.infer<typeof offerSchema>;
export type Offer = RawOffer & { agent?:import('./sourcing-agent.js').AgentTrace; commercial?:import('./comparison-policy.js').CommercialObservation; identityEvidence?:{basis:'oem_service_brand';requestedManufacturer:string;sourceUrl:string}; access?:'public_catalog'|'authenticated'; priceBasis?:'public_displayed'|'account_unverified'; seller?:string|null; supplier: typeof suppliers[number]; match: 'exact' | 'alternative' | 'unverified';
  observedAt: string; sourceUrl: string; evidence: string; synthetic: boolean; eligible: boolean; total: number | null; reason: string };
export type QueryInspection={kind:'inspected_query_results';queryUrl:string;returnedCount:number;products:{manufacturer:string;partNumber:string;sourceUrl:string;evidence:{url:string;screenshot:string;observedAt:string}}[]};
export const normalizePart = (value: string) => value.toUpperCase().replace(/[\s-]/g, '');
export function assess(raw: RawOffer, requested: SearchInput['lines'][number], supplier: Offer['supplier'], evidence: {url: string; screenshot: string; observedAt: string}, synthetic: boolean, alternate = false): Offer {
  const serviceBrand=!synthetic&&!alternate&&source1YorkIdentity(supplier,raw.manufacturer,raw.partNumber,requested.manufacturer,requested.partNumber);
  const exact = Boolean(requested.partNumber) && normalizePart(raw.partNumber) === normalizePart(requested.partNumber!)
    && Boolean(requested.manufacturer) && (raw.manufacturer.trim().toLowerCase() === requested.manufacturer!.trim().toLowerCase()||serviceBrand);
  const unit = raw.unit?.toLowerCase();
  const unitsKnown = (unit === 'each' && raw.packSize === 1)
    || (['pack','box','case'].includes(unit ?? '') && raw.packSize !== null);
  const costComparable = exact && raw.price !== null && raw.currency === 'USD' && unitsKnown && raw.condition?.toLowerCase() === 'new';
  // Until shipping inventory/arrival is implemented, only sufficient verified pickup stock is sourceable.
  const eligible = costComparable && raw.pickupReady === true && raw.stockQuantity !== null && raw.stockQuantity >= requested.quantity;
  return { ...raw, ...(serviceBrand?{identityEvidence:{basis:'oem_service_brand' as const,requestedManufacturer:requested.manufacturer!,sourceUrl:source1YorkEvidence}}:{}), supplier, match: exact ? 'exact' : alternate ? 'alternative' : 'unverified',
    observedAt: evidence.observedAt, sourceUrl: evidence.url, evidence: evidence.screenshot, synthetic,
    eligible, total: costComparable ? Math.ceil(requested.quantity / raw.packSize!) * raw.price! : null,
    reason: !exact ? 'Compatibility requires verification; excluded from ranking' : !costComparable ? 'Price, purchase unit, pack size, currency or condition is unverified' : !eligible ? 'Material cost known; sufficient ready-to-pick-up stock is unverified' : 'Exact manufacturer and part number; comparable cost and sufficient pickup stock',
  };
}
export function rank(offers: Offer[], quantity: number) {
  const eligible = offers.filter(o => o.eligible);
  const cheapest = [...eligible].sort((a,b) => a.total! - b.total!)[0] ?? null;
  const pickup = eligible.filter(o => o.pickupReady === true && o.stockQuantity !== null && o.stockQuantity >= quantity);
  return { cheapest, pickup, closest: null, fastestShipping: null,
    limitations: ['Closest requires verified branch coordinates and origin.', 'Shipping arrival must be verified before ranking fastest.', 'Cost excludes tax and shipping.'] };
}
