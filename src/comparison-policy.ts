import { normalizePart, type Offer } from './domain.js';
import { distanceMiles, type GeoResolution } from './geocoding.js';
import { source1YorkIdentity } from './identity.js';
export type Evidence = { url: string; screenshot: string; observedAt: string };
export type CommercialObservation = {
  status: 'observed' | 'unavailable';
  manufacturer: string;
  partNumber: string;
  requestedQuantity: number;
  price: {
    amount: number | null;
    currency: 'USD' | null;
    unit: 'each' | 'pack' | null;
    packSize: number | null;
    condition: 'new' | 'refurbished' | null;
    basis: 'public_displayed' | 'account_unverified';
    text: string;
  };
  shipping: {
    quantity: number | null;
    quantityBasis: 'each' | 'unknown';
    arrivalDate: string | null;
    destinationZip: string | null;
    quantityConfirmed: boolean;
    text: string;
  };
  branches: {
    id: string;
    name: string;
    address: string;
    stockQuantity: number | null;
    quantityBasis: 'each' | 'unknown';
    pickupReady: boolean | null;
    /** Where the address came from when the product page did not print it. */
    addressSource?: { url: string; observedAt: string };
    phone?: string | null;
    location?: GeoResolution;
    distanceMiles?: number;
    evidence: Evidence;
  }[];
  evidence: Evidence;
  issues: string[];
};
export type ComparisonChoice = {
  supplier: Offer['supplier'];
  partNumber: string;
  sourceUrl: string;
  materialSubtotal: number | null;
  branchId?: string;
  distanceMiles?: number;
  arrivalDate?: string;
  evidence: Evidence;
  /** What the page did not state; shown to the tech next to the winner. */
  caveats: string[];
};
export type StockedBranch = {
  supplier: Offer['supplier'];
  branchId: string;
  name: string;
  address: string | null;
  /** 'page' when the product page printed it; otherwise the store list URL. */
  addressSource: 'page' | { url: string; observedAt: string } | null;
  phone: string | null;
  stockQuantity: number;
  distanceMiles?: number;
  evidence: Evidence;
  caveats: string[];
};
export function compareOffers(
  offers: Offer[],
  requested: { manufacturer?: string; partNumber?: string; quantity: number },
  origin: GeoResolution,
  now = Date.now(),
) {
  const cheapest: ComparisonChoice[] = [],
    closest: ComparisonChoice[] = [],
    shipping: ComparisonChoice[] = [],
    stocked: StockedBranch[] = [],
    excluded: { supplier: string; reasons: string[] }[] = [];
  const fresh = (e: Evidence) => {
    const age = now - Date.parse(e.observedAt);
    return Boolean(e.screenshot) && age >= -60000 && age <= 15 * 60 * 1000;
  };
  const originZip = origin.address.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1];
  for (const offer of offers) {
    const o = offer.commercial;
    const reasons: string[] = [];
    if (
      offer.synthetic ||
      offer.match !== 'exact' ||
      !requested.partNumber ||
      normalizePart(offer.partNumber) !== normalizePart(requested.partNumber)
    )
      reasons.push('Exact non-synthetic identity required; unapproved alternatives are excluded.');
    if (
      !requested.manufacturer ||
      (offer.manufacturer.trim().toLowerCase() !== requested.manufacturer.trim().toLowerCase() &&
        !source1YorkIdentity(
          offer.supplier,
          offer.manufacturer,
          offer.partNumber,
          requested.manufacturer,
          requested.partNumber,
        ))
    )
      reasons.push('Requested manufacturer does not match the verified identity.');
    if (
      !o ||
      o.status !== 'observed' ||
      !fresh(o.evidence) ||
      o.requestedQuantity !== requested.quantity ||
      normalizePart(o.partNumber) !== normalizePart(offer.partNumber) ||
      o.manufacturer.trim().toLowerCase() !== offer.manufacturer.trim().toLowerCase() ||
      o.evidence.url !== offer.sourceUrl
    )
      reasons.push('Fresh product-bound commercial evidence is missing or mismatched.');
    const specConflicts =
      o?.issues.filter((issue) => issue.startsWith('Requested specification conflict:')) ?? [];
    if (specConflicts.length) {
      excluded.push({ supplier: offer.supplier, reasons: specConflicts });
      continue;
    }
    if (reasons.length) {
      excluded.push({ supplier: offer.supplier, reasons });
      continue;
    }
    const observed = o!;
    const p = observed.price;
    const caveats: string[] = [];
    // Unit: a stated pack size is honored. An unstated unit is read as the
    // price of one unit and said so; a pack with no stated size cannot be costed.
    const pack =
      p.unit === 'each'
        ? 1
        : p.unit === 'pack'
          ? Number.isInteger(p.packSize) && p.packSize! > 0
            ? p.packSize!
            : null
          : 1;
    if (p.unit === null) caveats.push('Purchase unit not stated; price read as one unit.');
    if (p.unit === 'each' && p.packSize !== null && p.packSize !== 1)
      caveats.push('Pack size conflicts with each pricing.');
    if (p.currency === null)
      caveats.push('Currency not stated on the page; US supplier pricing assumed.');
    if (p.condition === null) caveats.push('Condition not stated on the page.');
    const cents = p.amount === null ? null : Math.round(p.amount * 100),
      totalCents =
        pack !== null && cents !== null ? Math.ceil(requested.quantity / pack) * cents : NaN;
    const total =
      pack !== null &&
      !(p.unit === 'each' && p.packSize !== null && p.packSize !== 1) &&
      cents !== null &&
      Number.isSafeInteger(cents) &&
      Number.isSafeInteger(totalCents) &&
      cents >= 0 &&
      p.condition !== 'refurbished'
        ? totalCents / 100
        : null;
    const required =
      pack !== null ? Math.ceil(requested.quantity / pack) * pack : requested.quantity;
    const stockedBranches = observed.branches.filter(
      (b) =>
        fresh(b.evidence) &&
        Number.isSafeInteger(b.stockQuantity) &&
        b.stockQuantity !== null &&
        b.stockQuantity >= required,
    );
    const shipQuantity =
      observed.shipping.quantityBasis === 'each' &&
      Number.isSafeInteger(observed.shipping.quantity) &&
      observed.shipping.quantity !== null &&
      observed.shipping.quantity >= required;
    if (!shipQuantity && !stockedBranches.length)
      caveats.push('Stock for the requested quantity was not shown.');
    const choice: ComparisonChoice = {
      supplier: offer.supplier,
      partNumber: offer.partNumber,
      sourceUrl: offer.sourceUrl,
      materialSubtotal: total,
      evidence: observed.evidence,
      caveats,
    };
    if (total !== null) cheapest.push(choice);
    else
      reasons.push(
        'Cheapest needs a readable price for new or unstated condition and a known pack size; tax/freight are excluded.',
      );
    for (const branch of stockedBranches) {
      const branchCaveats = [
        ...(branch.quantityBasis === 'each' ? [] : ['Stock count unit not stated.']),
        ...(branch.pickupReady === true
          ? []
          : branch.pickupReady === false
            ? ['Supplier lists a later pickup time; call to confirm.']
            : ['Pickup readiness not stated; call the store to confirm.']),
      ];
      const located =
        origin.status === 'resolved' &&
        origin.point &&
        branch.location?.status === 'resolved' &&
        branch.location.point
          ? distanceMiles(origin.point, branch.location.point)
          : undefined;
      stocked.push({
        supplier: offer.supplier,
        branchId: branch.id,
        name: branch.name,
        address: branch.address || null,
        addressSource: branch.address ? (branch.addressSource ?? 'page') : null,
        phone: branch.phone ?? null,
        stockQuantity: branch.stockQuantity!,
        ...(located !== undefined ? { distanceMiles: located } : {}),
        evidence: branch.evidence,
        caveats: [
          ...branchCaveats,
          ...(branch.address && located === undefined
            ? ['Distance unavailable; the address could not be located.']
            : []),
          ...(!branch.address
            ? ['Store address not captured.']
            : branch.addressSource
              ? [
                  `Address from the supplier's store list (${branch.addressSource.observedAt.slice(0, 10)}).`,
                ]
              : []),
        ],
      });
      if (located !== undefined)
        closest.push({
          ...choice,
          branchId: branch.id,
          distanceMiles: located,
          evidence: branch.evidence,
          caveats: branchCaveats,
        });
    }
    if (!stockedBranches.some((b) => b.location?.point) || !origin.point)
      reasons.push('Closest needs a store showing stock, a resolved store address and an origin.');
    const arrival = observed.shipping.arrivalDate;
    if (
      arrival &&
      /^\d{4}-\d{2}-\d{2}$/.test(arrival) &&
      Number.isFinite(Date.parse(arrival)) &&
      new Date(arrival).toISOString().slice(0, 10) === arrival &&
      arrival >= new Date(now).toISOString().slice(0, 10) &&
      observed.shipping.quantityConfirmed &&
      originZip &&
      observed.shipping.destinationZip === originZip
    )
      shipping.push({ ...choice, arrivalDate: arrival });
    else
      reasons.push(
        'Fastest needs a future arrival date for the requested quantity and destination ZIP; dispatch text is insufficient.',
      );
    if (reasons.length) excluded.push({ supplier: offer.supplier, reasons });
  }
  const winners = (options: ComparisonChoice[], value: (o: ComparisonChoice) => number) => {
    const sorted = [...options].sort(
      (a, b) =>
        value(a) - value(b) ||
        a.supplier.localeCompare(b.supplier) ||
        (a.branchId ?? '').localeCompare(b.branchId ?? ''),
    );
    return sorted.length ? sorted.filter((o) => value(o) === value(sorted[0]!)) : [];
  };
  return {
    evaluatedAt: new Date(now).toISOString(),
    cheapest: {
      basis: 'material_subtotal_excludes_tax_freight',
      winners: winners(cheapest, (o) => o.materialSubtotal!),
      /** Every costed exact offer, lowest first, for a side-by-side price list. */
      options: [...cheapest].sort(
        (a, b) => a.materialSubtotal! - b.materialSubtotal! || a.supplier.localeCompare(b.supplier),
      ),
    },
    closest: {
      basis:
        origin.basis === 'census_zcta_reference'
          ? 'approximate_straight_line_from_zip_area'
          : 'straight_line_miles',
      winners: winners(closest, (o) => o.distanceMiles!),
    },
    fastestShipping: {
      basis: 'supplier_estimated_arrival_date',
      winners: winners(shipping, (o) => Date.parse(o.arrivalDate!)),
    },
    // Every store showing enough stock, nearest first when located, so a tech
    // can call ahead even when no address was captured for ranking.
    stockedBranches: [...stocked].sort(
      (a, b) =>
        (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity) ||
        b.stockQuantity - a.stockQuantity ||
        a.supplier.localeCompare(b.supplier) ||
        a.branchId.localeCompare(b.branchId),
    ),
    excluded,
    limitations: [
      "Cheapest ranks listed prices; check each winner's caveats for unstated unit, currency, condition or stock.",
      'Winners are limited to verified observations; incomplete supplier coverage can hide a better option.',
      'Product identity does not confirm installed-equipment compatibility.',
      'Shipping dates are supplier estimates; distance is not driving time.',
      'Price and inventory evidence expires for ranking after 15 minutes.',
    ],
  };
}
