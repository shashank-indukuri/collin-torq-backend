import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { config } from './config.js';
import {
  searchWeb,
  chooseLinks,
  readWebDocument,
  structured,
  type WebDocument,
} from './discovery.js';
import { normalizePart } from './domain.js';
import type { CapturedParts } from './capture.js';
import type { AlternativeCandidate, ReferenceSnapshot, ReplacementClaim } from './alternatives.js';
const candidateSchema = z.object({
  candidates: z
    .array(
      z.object({
        manufacturer: z.string().min(1).max(100),
        partNumber: z.string().min(1).max(100),
        description: z.string().min(1).max(250),
        identityQuote: z.string().min(1).max(900),
        replacementQuote: z.string().max(1200).nullable(),
        capacitanceMfd: z.string().nullable(),
        voltageVac: z.number().positive().nullable(),
        specificationQuote: z.string().max(900).nullable(),
      }),
    )
    .max(3),
});
type CandidateData = z.infer<typeof candidateSchema>;
const literal = (value: string, text: string) =>
  text.replace(/\s+/g, ' ').toLowerCase().includes(value.replace(/\s+/g, ' ').toLowerCase());
const hasPart = (text: string, part: string) =>
  (text.match(/[a-z0-9]+(?:-[a-z0-9]+)*/gi) ?? []).some(
    (token) => normalizePart(token) === normalizePart(part),
  );
export function validateAlternativeDiscovery(
  raw: CandidateData,
  document: WebDocument,
  line: CapturedParts['lines'][number],
): AlternativeCandidate[] {
  const output: AlternativeCandidate[] = [];
  for (const c of candidateSchema.parse(raw).candidates) {
    if (
      normalizePart(c.partNumber) === normalizePart(line.partNumber) ||
      !literal(c.identityQuote, document.text) ||
      !literal(c.manufacturer, c.identityQuote) ||
      !hasPart(c.identityQuote, c.partNumber) ||
      !literal(c.description, c.identityQuote)
    )
      continue;
    const q = c.replacementQuote;
    const relationship = Boolean(
      q &&
      literal(q, document.text) &&
      hasPart(q, line.partNumber) &&
      hasPart(q, c.partNumber) &&
      /replaces|supersed|replacement for|substitut/i.test(q),
    );
    const claims: ReplacementClaim[] = relationship
      ? [
          {
            from: line.partNumber,
            to: c.partNumber,
            authority: 'supplier',
            sourceUrl: document.url,
            quote: q!,
          },
        ]
      : [];
    const specificationQuote = c.specificationQuote;
    const groundedSpecs = Boolean(
      specificationQuote &&
      literal(specificationQuote, document.text) &&
      hasPart(specificationQuote, c.partNumber),
    );
    const capacitance =
      groundedSpecs && c.capacitanceMfd && literal(c.capacitanceMfd, specificationQuote!)
        ? c.capacitanceMfd
        : null;
    const voltage =
      groundedSpecs &&
      c.voltageVac &&
      new RegExp('\\b' + c.voltageVac + '\\s*(?:vac|volt|v)\\b', 'i').test(specificationQuote!)
        ? c.voltageVac
        : null;
    const conflict = Boolean(
      line.specifications.capacitanceMfd &&
      capacitance &&
      line.specifications.capacitanceMfd.replace(/\s|\+/g, '') !==
        capacitance.replace(/\s|\+/g, ''),
    );
    output.push({
      manufacturer: c.manufacturer,
      partNumber: c.partNumber,
      specifications:
        capacitance && voltage
          ? {
              capacitanceMfd: capacitance,
              voltageVac: voltage,
              kind: 'dual_run',
              shape: 'round',
              dimensionsText: null,
            }
          : null,
      claims,
      verification: {
        status: conflict ? 'rejected' : 'needs_review',
        installedCompatibilityVerified: false,
        rankingEligible: false,
        checks: [
          { field: 'discovered_identity', status: 'passed', detail: c.identityQuote },
          {
            field: 'replacement_reference',
            status: relationship ? 'passed' : 'missing',
            detail: relationship
              ? 'A public reference claims replacement; manufacturer approval has not been verified.'
              : 'Description-search candidate only; no replacement relationship established.',
          },
          {
            field: 'capacitance',
            status: conflict
              ? 'failed'
              : line.specifications.capacitanceMfd && capacitance
                ? 'passed'
                : 'missing',
            detail: capacitance ?? 'Not stated in product-bound specification evidence.',
          },
          {
            field: 'voltage',
            status: 'missing',
            detail: voltage
              ? `Candidate ${voltage} VAC; installed applicability requires confirmation.`
              : 'Candidate and installed voltage are not verified.',
          },
          {
            field: 'physical_and_installation_fit',
            status: 'missing',
            detail:
              'Component function, dimensions, mounting, terminals, electrical ratings and installed wiring require review.',
          },
        ],
      },
      offers: [],
      attempts: [],
    });
  }
  return output;
}
export type GeneralAlternativeDiscovery = (
  id: string,
  line: CapturedParts['lines'][number],
  active: () => boolean,
) => Promise<{
  references: ReferenceSnapshot[];
  candidates: AlternativeCandidate[];
  errors: { source: string; message: string }[];
}>;
export const discoverGeneralAlternatives: GeneralAlternativeDiscovery = async (
  id,
  line,
  active,
) => {
  const references: ReferenceSnapshot[] = [],
    candidates: AlternativeCandidate[] = [],
    errors: { source: string; message: string }[] = [];
  const visited = new Set<string>();
  const specs = [
    line.specifications.capacitanceMfd ? line.specifications.capacitanceMfd + ' MFD' : '',
    line.specifications.voltage ? line.specifications.voltage + ' VAC' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const queries = [
    `${line.manufacturer} ${line.partNumber} replacement superseded`,
    `${line.manufacturer} ${line.description} ${specs}`,
    `${line.description} ${specs} replacement part`,
  ];
  for (const query of queries) {
    if (!active()) break;
    try {
      const search = await searchWeb(query);
      const links = await chooseLinks(
        search,
        `Identify actual product/reference pages for replacements or comparable ${line.description}, original ${line.manufacturer} ${line.partNumber}. Specifications ${specs}.`,
        2,
      );
      for (const link of links) {
        if (!active() || visited.size >= 5) break;
        if (visited.has(link.url) || /\.pdf(?:\?|$)/i.test(link.url)) continue;
        visited.add(link.url);
        try {
          const doc = await readWebDocument(link.url, id);
          if (!active()) break;
          const extracted = await structured(
            candidateSchema,
            'Identify actual replacement or comparable product identities on this reference page. Identity quote must literally contain manufacturer, part number and description together. Replacement quote, if available, must literally contain BOTH old and new part numbers and the explicit replaces/supersedes relationship. A similar name is not replacement approval. Specification quote must include the candidate number. Return empty candidates for search pages, unrelated products or uncertain identities. Do not assume omitted voltage or other ratings.',
            { original: line, document: { url: doc.url, title: doc.title, text: doc.text } },
          );
          const validated = validateAlternativeDiscovery(extracted, doc, line);
          if (!validated.length) continue;
          const content = JSON.stringify({ heading: doc.title, text: doc.text });
          const sha256 = createHash('sha256').update(content).digest('hex');
          const directory = join(config.dataDir, 'evidence', id);
          await mkdir(directory, { recursive: true, mode: 0o700 });
          await writeFile(join(directory, sha256 + '.json'), content, { mode: 0o600 });
          references.push({
            url: doc.url,
            heading: doc.title,
            text: doc.text,
            sha256,
            evidence: doc.evidence!,
          });
          for (const candidate of validated)
            if (
              !candidates.some(
                (c) =>
                  c.manufacturer.toLowerCase() === candidate.manufacturer.toLowerCase() &&
                  normalizePart(c.partNumber) === normalizePart(candidate.partNumber),
              )
            )
              candidates.push(candidate);
        } catch (error) {
          errors.push({
            source: link.url,
            message: error instanceof Error ? error.message : 'Reference failed',
          });
        }
      }
    } catch (error) {
      errors.push({
        source: 'description_and_replacement_search',
        message: error instanceof Error ? error.message : 'Search failed',
      });
    }
    if (candidates.length >= 3 || visited.size >= 5) break;
  }
  return { references, candidates: candidates.slice(0, 3), errors };
};
