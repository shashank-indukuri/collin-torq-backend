import { z } from 'zod';
import { createHash } from 'node:crypto';
import { originSchema, resolveLocation, distanceMiles, type GeoResolution } from './geocoding.js';
import { compareOffers } from './comparison-policy.js';
import { CaptureError } from './capture.js';
import type { Store, Job } from './store.js';
export const comparisonRequestSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime(),
    origin: originSchema.optional(),
    requestId: z.uuid().optional(),
  })
  .strict();
export type Comparison = {
  status: 'ready' | 'needs_verification';
  expiresAt: string;
  origin: GeoResolution;
  lines: {
    name: string;
    quantity: number;
    rankings: ReturnType<typeof compareOffers>;
    supplierCoverage: { supplier: string; status: string; code?: string }[];
  }[];
  warnings: string[];
};
export function startComparison(store: Store, id: string, raw: unknown) {
  const body = comparisonRequestSchema.parse(raw),
    parent = store.get(id);
  if (!parent) throw new CaptureError('NOT_FOUND', 404);
  if (parent.updatedAt !== body.expectedUpdatedAt) throw new CaptureError('STALE_REQUEST');
  if (
    parent.input.mode !== 'live' ||
    ['queued', 'running', 'failed', 'cancelled'].includes(parent.state) ||
    parent.comparisonOf ||
    !parent.results.length
  )
    throw new CaptureError('SOURCING_RESULTS_REQUIRED');
  const origin = body.origin ?? parent.input.origin;
  if (!origin) throw new CaptureError('ORIGIN_REQUIRED', 400);
  const input = {
    ...structuredClone(parent.input),
    stopAfter: 'comparison' as const,
    origin,
    allowAlternatives: false,
  };
  const key =
    'comparison:' +
    createHash('sha256')
      .update(
        JSON.stringify({
          id,
          updatedAt: body.expectedUpdatedAt,
          origin,
          requestId: body.requestId,
        }),
      )
      .digest('hex');
  return store.create(input, key, {
    sourceCapture: parent.sourceCapture,
    capturedParts: parent.capturedParts,
    guide: parent.guide,
    parts: parent.parts,
    comparisonOf: { jobId: id, updatedAt: parent.updatedAt },
  });
}
export async function buildComparison(
  job: Job,
  store?: Store,
  active = () => true,
): Promise<Comparison> {
  const origin = job.input.origin
    ? await resolveLocation(job.input.origin)
    : {
        status: 'needs_address' as const,
        address: '',
        point: null,
        basis: null,
        sourceUrl: null,
        observedAt: new Date().toISOString(),
        warnings: ['Provide an origin address or coordinates.'],
      };
  const pending = job.results.flatMap((line) =>
    line.offers.flatMap((offer) =>
      (offer.commercial?.branches ?? []).map((branch) => ({ offer, branch })),
    ),
  );
  const resolveBranch = async ({ offer, branch }: (typeof pending)[number]) => {
    if (!active()) return;
    const cached = store?.getBranch(offer.supplier, branch.id);
    const age = cached?.location ? Date.now() - Date.parse(cached.location.observedAt) : Infinity;
    if (
      cached?.address === branch.address &&
      age >= 0 &&
      age < 30 * 86400000 &&
      cached.location?.status === 'resolved'
    )
      branch.location = cached.location;
    else if (
      branch.address &&
      ((branch.pickupReady === true && branch.stockQuantity !== null && branch.stockQuantity > 0) ||
        offer.supplier === 'johnstone')
    )
      branch.location = await resolveLocation({ address: branch.address });
    if (branch.location?.point && origin.point)
      branch.distanceMiles = distanceMiles(origin.point, branch.location.point);
    if (active())
      store?.saveBranch({
        supplier: offer.supplier,
        id: branch.id,
        name: branch.name,
        address: branch.address,
        sourceUrl: branch.evidence.url,
        observedAt: branch.evidence.observedAt,
        location: branch.location,
      });
  };
  // HTTP geocoding can run concurrently; browser operations remain serialized.
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (active() && index < pending.length) await resolveBranch(pending[index++]!);
    }),
  );
  const lines = job.results.map((line, i) => ({
    name: line.name,
    quantity: line.quantity,
    rankings: compareOffers(line.offers, job.input.lines[i]!, origin),
    supplierCoverage: (line.attempts ?? []).map((a) => ({
      supplier: a.supplier,
      status: a.status,
      code: a.code,
    })),
  }));
  const ready =
    lines.length > 0 &&
    lines.every(
      (l) =>
        l.supplierCoverage.length === new Set(job.input.suppliers).size &&
        l.supplierCoverage.every((s) => s.status !== 'error') &&
        l.rankings.cheapest.winners.length &&
        l.rankings.closest.winners.length &&
        l.rankings.fastestShipping.winners.length,
    );
  const times = job.results
    .flatMap((l) => l.offers.map((o) => Date.parse(o.commercial?.evidence.observedAt ?? '')))
    .filter(Number.isFinite);
  const expiresAt = new Date(
    (times.length ? Math.min(...times) : Date.now()) + 15 * 60 * 1000,
  ).toISOString();
  return {
    status: ready ? 'ready' : 'needs_verification',
    expiresAt,
    origin,
    lines,
    warnings: [
      'Separate refreshed exact-number comparison; the source job and unapproved alternative candidates are unchanged.',
      'Each winner is limited to observed suppliers and evidence freshness. Missing categories are not zero-price, zero-stock or no-shipping conclusions.',
      ...(job.capturedParts?.modelBasis === 'test_model'
        ? ['Test equipment model only; installed model and compatibility remain unconfirmed.']
        : []),
    ],
  };
}

export function comparisonView(job: Job, now = Date.now()): Job {
  if (
    !job.comparison ||
    ['queued', 'running', 'cancelled'].includes(job.state) ||
    Date.parse(job.comparison.expiresAt) > now
  )
    return job;
  const view = structuredClone(job);
  view.state = 'needs_input';
  view.message = 'Step 6 observations expired. Refresh the comparison before using any winner.';
  view.comparison!.status = 'needs_verification';
  for (const line of view.comparison!.lines) {
    line.rankings.cheapest.winners = [];
    line.rankings.closest.winners = [];
    line.rankings.fastestShipping.winners = [];
    line.rankings.excluded.push({
      supplier: 'all',
      reasons: ['Commercial evidence expired; refresh required.'],
    });
  }
  return view;
}
