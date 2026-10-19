import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { config } from './config.js';
import { structured } from './discovery.js';
import { normalizeModel, type GuideResolution } from './guides.js';
import type { PartCandidate, PartExtraction } from './parts.js';
import type { Pages } from './general-guides.js';
const schema = z.object({
  lines: z
    .array(
      z.object({
        lineIndex: z.number().int().nonnegative(),
        candidates: z
          .array(
            z.object({
              partNumber: z.string().min(1).max(100),
              description: z.string().min(1).max(250),
              page: z.number().int().positive(),
              header: z.string().min(1).max(1500),
              row: z.string().min(1).max(2000),
              cells: z
                .array(z.object({ model: z.string().min(1), value: z.string().min(1) }))
                .min(1)
                .max(50),
              capacitanceMfd: z.string().nullable(),
              voltage: z.number().positive().nullable(),
            }),
          )
          .max(10),
      }),
    )
    .max(10),
});
const text = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
export function validateGeneralParts(
  raw: unknown,
  pages: Pages,
  guide: GuideResolution,
  requests: { name: string; quantity: number }[],
): PartExtraction {
  const parsed = schema.parse(raw),
    document = guide.guide!;
  const model = guide.normalizedModel;
  const lines = requests.map((request, index) => {
    const outputs = parsed.lines.filter((l) => l.lineIndex === index);
    const candidates: PartCandidate[] = [];
    let invalid = outputs.length !== 1;
    for (const c of outputs[0]?.candidates ?? []) {
      const page = pages.find((p) => p.page === c.page);
      const single = document.coveredModels.length === 1 && document.coveredModels[0] === model;
      const headerOnPage = Boolean(page && text(page.text).includes(text(c.header)));
      const globalHeader =
        single && document.modelEvidence.some((e) => text(e.text) === text(c.header));
      const columns = c.cells.map((cell) => normalizeModel(cell.model));
      const col = columns.indexOf(model);
      const headerModels = (c.header.match(/[a-z0-9]+(?:[.-][a-z0-9]+)*/gi) ?? []).map((value) =>
        normalizeModel(value),
      );
      let offset = -1;
      const aligned = c.cells.every((cell) => {
        const token = cell.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = new RegExp('(?:^|\\s)' + token + '(?=\\s|$)', 'i').exec(
          c.row.slice(offset + 1),
        );
        if (!match) return false;
        offset += 1 + match.index + match[0].length - 1;
        return true;
      });
      const requestedCell = col >= 0 ? c.cells[col]?.value : null;
      let headerOffset = -1;
      const ordered = columns.every((m) => {
        const i = headerModels.indexOf(m, headerOffset + 1);
        if (i < 0) return false;
        headerOffset = i;
        return true;
      });
      if (
        !page ||
        !text(page.text).includes(text(c.row)) ||
        !text(c.row).includes(text(c.description)) ||
        (!headerOnPage && !globalHeader) ||
        !ordered ||
        new Set(columns).size !== columns.length ||
        col < 0 ||
        requestedCell !== c.partNumber ||
        !aligned ||
        !document.coveredModels.includes(model) ||
        (!single && c.cells.length < 2)
      ) {
        invalid = true;
        continue;
      }
      if (
        c.voltage !== null &&
        !new RegExp('\\b' + c.voltage + '\\s*(?:vac|volt|v)\\b', 'i').test(c.row)
      ) {
        invalid = true;
        continue;
      }
      if (c.capacitanceMfd !== null && !text(c.row).includes(text(c.capacitanceMfd))) {
        invalid = true;
        continue;
      }
      candidates.push({
        manufacturer: document.manufacturer,
        partNumber: c.partNumber,
        description: c.description,
        specifications: { capacitanceMfd: c.capacitanceMfd, voltage: c.voltage },
        matchBasis: 'reviewed_alias',
        requiresConfirmation: true,
        evidence: {
          page: c.page,
          model,
          modelColumn: col + 1,
          header: c.header,
          row: c.row,
          cells: c.cells,
          sourceUrl: document.sourceUrl,
          documentUrl: document.evidenceUrl + '#page=' + c.page,
          sha256: document.sha256,
          revision: document.revision,
        },
      });
    }
    return {
      ...request,
      status: invalid
        ? ('unreadable' as const)
        : candidates.length
          ? ('needs_part_confirmation' as const)
          : ('not_found' as const),
      candidates,
      excludedRows: [],
      message: invalid
        ? 'Some proposed rows failed literal evidence or column alignment checks. Inspect the guide.'
        : candidates.length
          ? 'Agent-discovered candidates require explicit component confirmation before capture.'
          : 'No evidence-backed candidate was found. Supply a clearer guide or exact part number.',
    };
  });
  return {
    status: 'needs_input',
    model,
    sha256: document.sha256,
    lines,
    warnings: [
      ...document.warnings.filter((w) => !w.includes('Requested part extraction')),
      'Agent-discovered parts require human confirmation of description and model-column applicability. Current supersessions and installed compatibility remain unverified.',
    ],
  };
}
export async function extractGeneralParts(
  pages: Pages,
  guide: GuideResolution,
  requests: { name: string; quantity: number }[],
  dependencies: { directory?: string; extract?: (data: unknown) => Promise<unknown> } = {},
): Promise<PartExtraction> {
  const directory = dependencies.directory ?? join(config.dataDir, 'part-extractions');
  const identity = {
    version: 1,
    sha256: guide.guide!.sha256,
    model: guide.normalizedModel,
    requests,
  };
  const key = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const path = join(directory, key + '.json');
  try {
    return validateGeneralParts(JSON.parse(await readFile(path, 'utf8')), pages, guide, requests);
  } catch {
    /* Re-extract missing/invalid caches; capture still compares against the candidates shown. */
  }
  // All included pages remain whole. Exceeding the text budget is explicit rather than silently dropping table columns.
  const relevant = pages.filter((p) => /part|item|description|model/i.test(p.text));
  let length = 0;
  const selected = relevant.filter((p) => (length += p.text.length) <= 44000);
  const data = {
    guide: {
      manufacturer: guide.guide!.manufacturer,
      model: guide.normalizedModel,
      coveredModels: guide.guide!.coveredModels,
      modelEvidence: guide.guide!.modelEvidence,
    },
    requests,
    pages: selected,
  };
  const raw = await (
    dependencies.extract ??
    ((data) =>
      structured(
        schema,
        'Find requested components in the guide. Return one line for every request index. Each candidate MUST have a contiguous literal row, literal description, and the complete ordered model cells with part numbers or explicit not-applicable markers. Header must be literal on the same page, except a single-model document may use its explicit model coverage heading. Never omit or shift model columns, guess part numbers, or infer electrical specifications. For uncertain rows return no candidates. All semantic matches will be reviewed by the user.',
        data,
      ))
  )(data);
  const valid = validateGeneralParts(raw, pages, guide, requests);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, randomUUID() + '.tmp');
  await writeFile(temporary, JSON.stringify(raw), { mode: 0o600 });
  await rename(temporary, path);
  return valid;
}
