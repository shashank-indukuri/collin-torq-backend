import { z } from 'zod';
import type { GuideResolver, GuideResolution } from './guides.js';
import { normalizeModel } from './guides.js';
import { extractGeneralParts } from './general-parts.js';

export const partLinesSchema = z
  .array(
    z
      .object({
        name: z.string().trim().min(1).max(150),
        quantity: z.number().int().positive().max(10000).default(1),
      })
      .strict(),
  )
  .min(1)
  .max(10);
export const extractionRequestSchema = z
  .object({
    manufacturer: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(120),
    lines: partLinesSchema,
  })
  .strict();
type Pages = { page: number; text: string }[];
export type PartCandidate = {
  manufacturer: string;
  partNumber: string;
  description: string;
  specifications: { capacitanceMfd: string | null; voltage: number | null };
  matchBasis: 'description' | 'reviewed_alias';
  requiresConfirmation: boolean;
  evidence: {
    page: number;
    model: string;
    modelColumn: number;
    header: string;
    row: string;
    cells: { model: string; value: string }[];
    sourceUrl: string;
    documentUrl: string;
    sha256: string;
    revision: string;
  };
};
export type PartLine = {
  name: string;
  quantity: number;
  status: 'extracted' | 'needs_part_confirmation' | 'not_applicable' | 'not_found' | 'unreadable';
  candidates: PartCandidate[];
  message: string;
  excludedRows: { page: number; row: string; reason: string }[];
};
export type PartExtraction = {
  status: 'extracted' | 'needs_input' | 'blocked' | 'unavailable';
  model: string;
  sha256: string | null;
  lines: PartLine[];
  warnings: string[];
};
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
function match(request: string, description: string): 'description' | 'reviewed_alias' | null {
  const q = normalize(request);
  const d = normalize(description);
  if (q === 'control board' || q === 'board')
    return d === 'control defrost' ? 'reviewed_alias' : null;
  if (['defrost control', 'defrost control board', 'defrost board'].includes(q))
    return d === 'control defrost' ? 'reviewed_alias' : null;
  if (q === 'capacitor' || q === 'capacitors') return /^capacitor\b/.test(d) ? 'description' : null;
  if (['run capacitor', 'capacitor run'].includes(q))
    return /^capacitor run\b/.test(d) ? 'description' : null;
  if (['start capacitor', 'capacitor start'].includes(q))
    return /^capacitor start\b/.test(d) ? 'description' : null;
  // Other names must match the guide description exactly, not a guessed synonym.
  return q === d ? 'description' : null;
}
export function extractGuideParts(
  pages: Pages,
  guide: GuideResolution,
  requests: z.infer<typeof partLinesSchema>,
): PartExtraction {
  const model = normalizeModel(guide.requested.model);
  const base: PartExtraction = {
    status: guide.status === 'unavailable' ? 'unavailable' : 'blocked',
    model,
    sha256: guide.guide?.sha256 ?? null,
    lines: [],
    warnings: guide.guide?.warnings.filter((w) => !w.includes('Requested part extraction')) ?? [],
  };
  if (guide.status !== 'guide_found' || guide.guide?.applicability !== 'exact_model_listed') {
    base.warnings.push(
      'An exact full model must be listed in a verified guide before part extraction.',
    );
    return base;
  }
  const document = guide.guide;
  base.warnings.push(
    'Historical guide identifiers only; current supersessions, installed modifications and supplier availability are unverified.',
    'Voltage is not supplied in these table rows and is returned as unknown.',
  );
  for (const request of requests) {
    const result: PartLine = {
      ...request,
      status: 'not_found',
      candidates: [],
      excludedRows: [],
      message: '',
    };
    let invalid = false;
    for (const page of pages) {
      let models: string[] = [];
      let header = '';
      for (const row of page.text.split('\n')) {
        if (/FIG\s+ITEM\s+DESCRIPTION/.test(row)) {
          models = row.match(/\bE1RD\d{3}S\d{2}[A-Z]\b/g) ?? [];
          header = row;
          continue;
        }
        if (!models.includes(model)) continue;
        // Data grammar is scoped to the reviewed E1RD table. Every column must
        // contain an explicit part number or ---; never shift across missing cells.
        const first = row.search(/\bS1-[0-9]|---/);
        if (first < 0) {
          const description = row.replace(/^\s*(?:\*|\d+)\s+\d+[A-Z]?\s+/, '').trim();
          if (match(request.name, description)) {
            invalid = true;
            result.excludedRows.push({
              page: page.page,
              row,
              reason: 'Matching description has no readable model cells.',
            });
          }
          continue;
        }
        const description = row
          .slice(0, first)
          .replace(/^\s*(?:\*|\d+)\s+\d+[A-Z]?\s+/, '')
          .trim();
        const basis = match(request.name, description);
        if (!basis) continue;
        const tail = row
          .slice(first)
          .replace(/\s*<\s*$/, '')
          .trim();
        const cells = tail.split(/\s+/);
        if (
          new Set(models).size !== models.length ||
          cells.length !== models.length ||
          cells.some((v) => !/^(?:S1-\d+(?:-\d+)*|---)$/.test(v))
        ) {
          invalid = true;
          result.excludedRows.push({
            page: page.page,
            row,
            reason: 'Unrecognized or incomplete model-column alignment; row rejected.',
          });
          continue;
        }
        const column = models.indexOf(model);
        const value = cells[column]!;
        if (value === '---') {
          result.excludedRows.push({
            page: page.page,
            row,
            reason: '--- means not applicable to this exact model.',
          });
          continue;
        }
        result.candidates.push({
          manufacturer: document.manufacturer,
          partNumber: value,
          description,
          specifications: {
            capacitanceMfd: description.match(/\(([\d./]+)\s*MFD\)/i)?.[1] ?? null,
            voltage: null,
          },
          matchBasis: basis,
          requiresConfirmation:
            normalize(request.name) === 'control board' || normalize(request.name) === 'board',
          evidence: {
            page: page.page,
            model,
            modelColumn: column + 1,
            header,
            row,
            cells: models.map((m, i) => ({ model: m, value: cells[i]! })),
            sourceUrl: document.sourceUrl,
            documentUrl: `${document.evidenceUrl}#page=${page.page}`,
            sha256: document.sha256,
            revision: document.revision,
          },
        });
      }
    }
    // A rejected matching row may hide another applicable candidate. Do not claim
    // uniqueness from only the rows that happened to parse successfully.
    if (invalid) {
      result.status = 'unreadable';
      result.message =
        'A matching row has uncertain column alignment. Review the PDF before accepting candidates.';
    } else if (
      result.candidates.length > 1 ||
      result.candidates.some((c) => c.requiresConfirmation)
    ) {
      result.status = 'needs_part_confirmation';
      result.message =
        result.candidates.length > 1
          ? 'Multiple applicable rows match this part name. Specify which component is needed.'
          : 'The guide says Control, Defrost. Confirm that this is the requested control board.';
    } else if (result.candidates.length === 1) {
      result.status = 'extracted';
      result.message =
        'One applicable guide row matches this request; inspect evidence and document limitations.';
    } else if (result.excludedRows.length) {
      result.status = 'not_applicable';
      result.message = 'Matching rows are marked not applicable to this model.';
    } else
      result.message =
        'No supported matching description found in this guide copy. Missing pages or other terminology may be relevant.';
    if (result.status !== 'extracted')
      for (const candidate of result.candidates) candidate.requiresConfirmation = true;
    base.lines.push(result);
  }
  base.status = base.lines.every((l) => l.status === 'extracted') ? 'extracted' : 'needs_input';
  return base;
}
export async function resolveGuideParts(
  guides: Pick<GuideResolver, 'resolve' | 'pages'>,
  raw: z.infer<typeof extractionRequestSchema>,
) {
  const input = extractionRequestSchema.parse(raw);
  const guide = await guides.resolve({ manufacturer: input.manufacturer, model: input.model });
  if (guide.status !== 'guide_found' || !guide.guide)
    return { guide, parts: extractGuideParts([], guide, input.lines) };
  const pages = await guides.pages(guide.guide.sha256);
  if (!pages)
    return {
      guide,
      parts: {
        status: 'unavailable',
        model: guide.normalizedModel,
        sha256: guide.guide.sha256,
        lines: [],
        warnings: [
          'Guide evidence became unavailable or failed integrity validation; no parts extracted.',
        ],
      } as PartExtraction,
    };
  const parts = await extractPartsForGuide(pages, guide, input.lines);
  guide.guide.warnings = guide.guide.warnings.filter(
    (w) => !w.includes('Requested part extraction'),
  );
  guide.guide.warnings.push('Supplier availability has not run.');
  return { guide, parts };
}

export async function extractPartsForGuide(
  pages: Pages,
  guide: GuideResolution,
  requests: z.infer<typeof partLinesSchema>,
): Promise<PartExtraction> {
  if (guide.status !== 'guide_found' || guide.guide?.discoveryMethod !== 'agent')
    return extractGuideParts(pages, guide, requests);
  return extractGeneralParts(pages, guide, requests);
}
