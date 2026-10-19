import { z } from 'zod';
import { createHash } from 'node:crypto';
import { inputSchema, supplierSchema } from './domain.js';
import { CaptureError } from './capture.js';
import type { Store } from './store.js';
export const sourcingRequestSchema = z
  .object({
    expectedCapturedAt: z.iso.datetime(),
    suppliers: z.array(supplierSchema).min(1).max(3),
  })
  .strict();
export function startCapturedSourcing(store: Store, id: string, raw: unknown) {
  const body = sourcingRequestSchema.parse(raw);
  const parent = store.get(id);
  if (!parent) throw new CaptureError('NOT_FOUND', 404);
  const capture = parent.capturedParts;
  if (
    parent.state !== 'completed' ||
    parent.input.mode !== 'live' ||
    parent.sourceCapture ||
    !capture
  )
    throw new CaptureError('CAPTURE_REQUIRED');
  if (capture.capturedAt !== body.expectedCapturedAt) throw new CaptureError('STALE_CAPTURE');
  if (
    !capture.lines.length ||
    capture.lines.length !== parent.input.lines.length ||
    capture.lines.some(
      (l) => !l.partNumber || !l.manufacturer || l.componentSelection !== 'explicit',
    )
  )
    throw new CaptureError('CAPTURE_INCOMPLETE');
  const suppliers = (['johnstone', 'partstown', 'grainger'] as const).filter((s) =>
    body.suppliers.includes(s),
  );
  const input = inputSchema.parse({
    mode: 'live',
    stopAfter: 'sourcing',
    model: capture.model,
    origin: parent.input.origin,
    suppliers,
    allowAlternatives: false,
    lines: capture.lines.map((l) => ({
      name: l.description,
      partNumber: l.partNumber,
      manufacturer: l.manufacturer,
      quantity: l.quantity,
    })),
  });
  const key =
    'capture-sourcing:' +
    createHash('sha256')
      .update(JSON.stringify({ id, signature: capture.requestSignature, suppliers }))
      .digest('hex');
  return store.create(input, key, {
    capturedParts: structuredClone(capture),
    sourceCapture: {
      jobId: id,
      capturedAt: capture.capturedAt,
      guideSha256: capture.guideSha256,
      modelBasis: capture.modelBasis,
      phase: 'exact',
    },
    guide: parent.guide,
    parts: parent.parts,
  });
}
