import { createHash } from 'node:crypto';
import { z } from 'zod';
import { extractPartsForGuide } from './parts.js';
import type { GuideResolver } from './guides.js';
import type { Job, Store } from './store.js';
export const captureRequestSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime(),
    expectedGuideSha256: z.string().regex(/^[a-f0-9]{64}$/),
    modelBasis: z.enum(['test_model', 'user_confirmed_model']),
    selections: z
      .array(
        z
          .object({
            lineIndex: z.number().int().min(0).max(9),
            candidateIndex: z.number().int().min(0).max(99),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
type CaptureRequest = z.infer<typeof captureRequestSchema>;
export type CapturedParts = {
  status: 'captured';
  model: string;
  modelBasis: CaptureRequest['modelBasis'];
  capturedAt: string;
  guideSha256: string;
  requestSignature: string;
  currentSupersessionsVerified: false;
  installedCompatibilityVerified: false;
  alternativeSpecificationsVerified: false;
  warnings: string[];
  lines: {
    lineIndex: number;
    requestedName: string;
    quantity: number;
    manufacturer: string;
    partNumber: string;
    description: string;
    specifications: import('./parts.js').PartCandidate['specifications'];
    evidence: import('./parts.js').PartCandidate['evidence'];
    componentSelection: 'explicit';
  }[];
};
export class CaptureError extends Error {
  constructor(
    public code: string,
    public statusCode = 409,
  ) {
    super(code);
  }
}
function signature(body: CaptureRequest) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sha256: body.expectedGuideSha256,
        modelBasis: body.modelBasis,
        selections: [...body.selections].sort((a, b) => a.lineIndex - b.lineIndex),
      }),
    )
    .digest('hex');
}
export async function captureParts(
  store: Store,
  guides: Pick<GuideResolver, 'resolve' | 'pages'>,
  id: string,
  raw: unknown,
): Promise<Job> {
  const body = captureRequestSchema.parse(raw);
  const job = store.get(id);
  if (!job) throw new CaptureError('NOT_FOUND', 404);
  const requestSignature = signature(body);
  if (job.capturedParts) {
    if (job.capturedParts.requestSignature === requestSignature) return job;
    throw new CaptureError('CAPTURE_ALREADY_FINALIZED');
  }
  if (
    job.input.mode !== 'live' ||
    !['parts', 'capture'].includes(job.input.stopAfter) ||
    !['completed', 'needs_input'].includes(job.state) ||
    !job.parts ||
    !job.guide?.guide ||
    job.guide.status !== 'guide_found'
  )
    throw new CaptureError('PARTS_NOT_READY');
  if (job.updatedAt !== body.expectedUpdatedAt) throw new CaptureError('STALE_JOB');
  if (
    body.expectedGuideSha256 !== job.parts.sha256 ||
    body.expectedGuideSha256 !== job.guide.guide.sha256
  )
    throw new CaptureError('STALE_GUIDE');
  if (
    body.selections.length !== job.input.lines.length ||
    new Set(body.selections.map((s) => s.lineIndex)).size !== job.input.lines.length
  )
    throw new CaptureError('SELECT_EACH_LINE_ONCE');
  const guide = await guides.resolve(job.guide.requested);
  if (guide.status !== 'guide_found' || guide.guide?.sha256 !== body.expectedGuideSha256)
    throw new CaptureError('GUIDE_REVALIDATION_FAILED');
  const pages = await guides.pages(body.expectedGuideSha256);
  if (!pages) throw new CaptureError('GUIDE_EVIDENCE_UNAVAILABLE');
  const fresh = await extractPartsForGuide(pages, guide, job.input.lines);
  const lines: CapturedParts['lines'] = [];
  for (const selection of [...body.selections].sort((a, b) => a.lineIndex - b.lineIndex)) {
    const line = fresh.lines[selection.lineIndex];
    const candidate = line?.candidates[selection.candidateIndex];
    if (!line || !['extracted', 'needs_part_confirmation'].includes(line.status) || !candidate)
      throw new CaptureError('INVALID_COMPONENT_SELECTION');
    const shown = job.parts.lines[selection.lineIndex]?.candidates[selection.candidateIndex];
    if (JSON.stringify(candidate) !== JSON.stringify(shown))
      throw new CaptureError('CANDIDATE_EVIDENCE_CHANGED');
    lines.push({
      lineIndex: selection.lineIndex,
      requestedName: job.input.lines[selection.lineIndex]!.name,
      quantity: line.quantity,
      manufacturer: candidate.manufacturer,
      partNumber: candidate.partNumber,
      description: candidate.description,
      specifications: candidate.specifications,
      evidence: candidate.evidence,
      componentSelection: 'explicit',
    });
  }
  // Another request can cancel/clarify/finalize while evidence is being read.
  const latest = store.get(id)!;
  if (latest.capturedParts) {
    if (latest.capturedParts.requestSignature === requestSignature) return latest;
    throw new CaptureError('CAPTURE_ALREADY_FINALIZED');
  }
  if (
    latest.updatedAt !== body.expectedUpdatedAt ||
    latest.state !== job.state ||
    JSON.stringify(latest.input) !== JSON.stringify(job.input)
  )
    throw new CaptureError('STALE_JOB');
  const capturedParts: CapturedParts = {
    status: 'captured',
    model: fresh.model,
    modelBasis: body.modelBasis,
    capturedAt: new Date().toISOString(),
    guideSha256: body.expectedGuideSha256,
    requestSignature,
    currentSupersessionsVerified: false,
    installedCompatibilityVerified: false,
    alternativeSpecificationsVerified: false,
    warnings: [
      ...fresh.warnings,
      ...(body.modelBasis === 'test_model'
        ? ['Test model only; the installed equipment model has not been confirmed.']
        : [
            'Equipment model was asserted by the user; independent nameplate verification has not run.',
          ]),
      'Captured historical identifiers support an exact-number lookup. They do not establish a current replacement or specification-compatible alternative.',
    ],
    lines,
  };
  return store.update(
    id,
    { capturedParts, state: 'completed' },
    'Step 4 captured reviewed part numbers, descriptions, specifications and source evidence. Supplier search has not run.',
  );
}
