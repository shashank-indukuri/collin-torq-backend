import { z } from 'zod';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getBrowser, saveEvidence } from './browser.js';
import { config } from './config.js';
import { normalizePart, type Offer } from './domain.js';
import { CaptureError } from './capture.js';
import type { Store, SupplierAttempt } from './store.js';
import { lookup, SupplierError } from './suppliers.js';

export const alternativeReviewSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime(),
    allow: z.literal(true),
    installedVoltageVac: z.number().positive().max(1000).optional(),
  })
  .strict();
export type ReferenceSnapshot = {
  cacheHit?: true;
  refreshWarning?: string;
  refreshAttemptedAt?: string;
  url: string;
  heading: string;
  text: string;
  sha256: string;
  evidence: { url: string; screenshot: string; observedAt: string };
};
export const alternativeSources = {
  crossReference:
    'https://www.technicalhotandcoldparts.com/york-coleman-s1-02425893700-dual-run-capacitor/',
  oemSpecifications: 'https://www.yorknow.com/s102425893700.html',
  oemSubstituteSpecifications: 'https://www.yorknow.com/s1cap4405040dr.html',
} as const;
export type ReplacementClaim = {
  from: string;
  to: string;
  authority: 'supplier' | 'oem';
  sourceUrl: string;
  quote: string;
};
export type AlternativeCandidate = {
  manufacturer: string;
  partNumber: string;
  specifications: {
    capacitanceMfd: string;
    voltageVac: number;
    kind: 'dual_run';
    shape: 'round';
    dimensionsText: string | null;
  } | null;
  claims: ReplacementClaim[];
  verification: {
    status: 'needs_review' | 'rejected' | 'verified_replacement';
    checks: { field: string; status: 'passed' | 'missing' | 'failed'; detail: string }[];
    installedCompatibilityVerified: false;
    rankingEligible: false;
  };
  offers: Offer[];
  attempts: SupplierAttempt[];
};
export type AlternativeReview = {
  status: 'queued' | 'needs_review' | 'completed' | 'partial';
  consent: true;
  requestedAt: string;
  requestBasisUpdatedAt: string;
  installedVoltageVac?: number;
  references: ReferenceSnapshot[];
  lines: {
    lineIndex: number;
    requestedPartNumber: string;
    status: 'needs_review' | 'unsupported' | 'reviewed';
    candidates: AlternativeCandidate[];
    message: string;
  }[];
  errors: { source: string; message: string }[];
};

export function startAlternativeReview(store: Store, id: string, raw: unknown) {
  const body = alternativeReviewSchema.parse(raw);
  const job = store.get(id);
  if (!job) throw new CaptureError('NOT_FOUND', 404);
  if (job.alternativeReview?.requestBasisUpdatedAt === body.expectedUpdatedAt) {
    if (job.alternativeReview.installedVoltageVac !== body.installedVoltageVac)
      throw new CaptureError('ALTERNATIVE_REVIEW_CONFLICT');
    return job;
  }
  if (job.updatedAt !== body.expectedUpdatedAt) throw new CaptureError('STALE_JOB');
  if (
    !job.sourceCapture ||
    !job.capturedParts ||
    !['needs_permission', 'needs_input', 'partial'].includes(job.state)
  )
    throw new CaptureError('CAPTURED_EXACT_SEARCH_REQUIRED');
  const unresolved = job.results.filter((r) => !r.offers.some((o) => o.match === 'exact'));
  if (
    !unresolved.length ||
    unresolved.some(
      (r) =>
        r.errors.length > 0 ||
        r.attempts?.length !== new Set(job.input.suppliers).size ||
        new Set(r.attempts.map((a) => a.supplier)).size !== new Set(job.input.suppliers).size ||
        r.attempts.some((a) => a.status !== 'no_match' || a.phase !== 'exact'),
    )
  )
    throw new CaptureError('EXACT_SCOPE_INCOMPLETE');
  return store.update(
    id,
    {
      state: 'queued',
      alternativeReview: {
        status: 'queued',
        consent: true,
        requestedAt: new Date().toISOString(),
        requestBasisUpdatedAt: body.expectedUpdatedAt,
        installedVoltageVac: body.installedVoltageVac,
        references: [],
        lines: [],
        errors: [],
      },
    },
    'Reviewing documented alternatives; compatibility is not inferred from supplier suggestions.',
  );
}
export function parseSupplierReplacement(
  snapshot: Pick<ReferenceSnapshot, 'url' | 'heading' | 'text'>,
  from: string,
  to: string,
): ReplacementClaim | null {
  if (
    snapshot.url !== alternativeSources.crossReference ||
    !(snapshot.heading.match(/\bS1-[A-Z0-9-]+/gi) ?? []).some(
      (n) => normalizePart(n) === normalizePart(to),
    )
  )
    return null;
  const list = snapshot.text
    .split(/Replaces Old York Coleman Part Numbers/i)[1]
    ?.split(/Other Part Numbers|Fits Models|Warranty/i)[0];
  const numbers = list?.match(/S1-[A-Z0-9-]+/g) ?? [];
  if (!numbers.some((n) => normalizePart(n) === normalizePart(from))) return null;
  return {
    from,
    to,
    authority: 'supplier',
    sourceUrl: snapshot.url,
    quote: `Replaces Old York Coleman Part Numbers: ${from}`,
  };
}
export function parseOemCapacitor(
  snapshot: Pick<ReferenceSnapshot, 'url' | 'heading' | 'text'>,
  partNumber: string,
): AlternativeCandidate['specifications'] {
  const expected =
    partNumber === 'S1-02425893700'
      ? alternativeSources.oemSpecifications
      : partNumber === 'S1-CAP4405040DR'
        ? alternativeSources.oemSubstituteSpecifications
        : undefined;
  if (!expected || snapshot.url !== expected) return null;
  const sku = snapshot.text.match(/\bSKU[ \t]*\n?\s*(S1-[A-Z0-9-]+)(?:\s|$)/i)?.[1]?.trim();
  const s =
    snapshot.heading.match(
      /(?:capacitor,?\s*)?run\s*dual,?\s*(\d+)\s*[+/]\s*(\d+)\s*(?:mfd|[µu]f),?\s*(\d+)\s*v,?\s*round/i,
    ) ??
    snapshot.heading.match(
      /^round\s+dual\s+run\s+capacitor,?\s*(\d+)\s*[+/]\s*(\d+)\s*(?:mfd|[µu]f),?\s*(\d+)\s*v$/i,
    );
  if (!sku || normalizePart(sku) !== normalizePart(partNumber) || !s) return null;
  return {
    capacitanceMfd: `${s[1]}/${s[2]}`,
    voltageVac: Number(s[3]),
    kind: 'dual_run',
    shape: 'round',
    dimensionsText: snapshot.text.match(/\bDimension[ \t]+([^\n]+)/i)?.[1]?.trim() ?? null,
  };
}
export function parseOemSubstitute(
  snapshot: Pick<ReferenceSnapshot, 'url' | 'heading' | 'text'>,
): ReplacementClaim | null {
  if (!parseOemCapacitor(snapshot, 'S1-02425893700')) return null;
  const substitute = snapshot.text.match(/Substitute SKU[ \t]*\n?\s*(S1-[A-Z0-9-]+)(?:\s|$)/i)?.[1];
  if (substitute !== 'S1-CAP4405040DR') return null;
  return {
    from: 'S1-02425893700',
    to: substitute,
    authority: 'oem',
    sourceUrl: snapshot.url,
    quote: 'Substitute SKU: ' + substitute,
  };
}
export function replacementChain(
  from: string,
  to: string,
  claims: ReplacementClaim[],
): ReplacementClaim[] {
  const visit = (
    current: string,
    path: ReplacementClaim[],
    seen: Set<string>,
  ): ReplacementClaim[] => {
    if (normalizePart(current) === normalizePart(to)) return path;
    if (path.length >= 8 || seen.has(normalizePart(current))) return [];
    const nextSeen = new Set(seen).add(normalizePart(current));
    for (const claim of claims.filter((c) => normalizePart(c.from) === normalizePart(current))) {
      const found = visit(claim.to, [...path, claim], nextSeen);
      if (found.length) return found;
    }
    return [];
  };
  return normalizePart(from) === normalizePart(to) ? [] : visit(from, [], new Set());
}
export function verifyReplacement(
  from: string,
  baselineCapacitance: string | null,
  installedVoltageVac: number | undefined,
  specs: AlternativeCandidate['specifications'],
  claims: ReplacementClaim[],
  targetNumber = claims.at(-1)?.to ?? '',
): AlternativeCandidate['verification'] {
  const normalizeCap = (v: string) => v.replace(/\s/g, '').replace('+', '/');
  const chain = replacementChain(from, targetNumber, claims);
  const oemChain = chain.length > 0 && chain.every((c) => c.authority === 'oem');
  const checks: AlternativeCandidate['verification']['checks'] = [
    {
      field: 'replacement_reference',
      status: chain.length ? 'passed' : 'missing',
      detail: chain.length
        ? `${chain.map((c) => c.authority).join(' → ')} reference chain links the original identifier to this candidate`
        : 'No complete original-to-candidate replacement reference chain',
    },
    {
      field: 'capacitance',
      status:
        !baselineCapacitance || !specs
          ? 'missing'
          : normalizeCap(baselineCapacitance) === normalizeCap(specs.capacitanceMfd)
            ? 'passed'
            : 'failed',
      detail: specs
        ? `Guide ${baselineCapacitance ?? 'unknown'} µF; candidate ${specs.capacitanceMfd} µF`
        : 'OEM candidate specifications unavailable',
    },
    {
      field: 'voltage',
      status:
        !installedVoltageVac || !specs
          ? 'missing'
          : specs.voltageVac >= installedVoltageVac
            ? 'passed'
            : 'failed',
      detail: installedVoltageVac
        ? `User-reported installed rating ${installedVoltageVac} VAC; candidate ${specs?.voltageVac ?? 'unknown'} VAC`
        : 'Installed voltage is unknown; candidate voltage does not establish the original rating',
    },
    {
      field: 'oem_replacement_authority',
      status: oemChain ? 'passed' : 'missing',
      detail: oemChain
        ? 'Every replacement edge is manufacturer-documented'
        : 'A supplier reference anywhere in the chain cannot establish OEM approval for the original part',
    },
    {
      field: 'physical_and_installation_fit',
      status: 'missing',
      detail:
        'Mounting dimensions, terminals, frequency, tolerance, temperature rating and installed wiring require verification',
    },
  ];
  return {
    status: checks.some((c) => c.status === 'failed')
      ? 'rejected'
      : checks.every((c) => c.status === 'passed')
        ? 'verified_replacement'
        : 'needs_review',
    checks,
    installedCompatibilityVerified: false,
    rankingEligible: false,
  };
}
function validReference(
  key: keyof typeof alternativeSources,
  reference: Pick<ReferenceSnapshot, 'url' | 'heading' | 'text'>,
) {
  if (reference.url !== alternativeSources[key]) return false;
  return key === 'crossReference'
    ? Boolean(parseSupplierReplacement(reference, 'S1-02425893000', 'S1-02425893700'))
    : Boolean(
        parseOemCapacitor(
          reference,
          key === 'oemSpecifications' ? 'S1-02425893700' : 'S1-CAP4405040DR',
        ),
      );
}
const referenceCache = join(config.dataDir, 'alternative-reference-cache');
export async function rememberAlternativeReference(
  id: string,
  key: keyof typeof alternativeSources,
  reference: ReferenceSnapshot,
  cacheDir = referenceCache,
) {
  z.string().uuid().parse(id);
  z.string()
    .regex(/^[a-z0-9-]+\.png$/i)
    .parse(reference.evidence.screenshot);
  const text = JSON.stringify({ heading: reference.heading, text: reference.text });
  if (
    !validReference(key, reference) ||
    createHash('sha256').update(text).digest('hex') !== reference.sha256
  )
    throw new Error('Cannot cache an unvalidated reference');
  await readFile(join(config.dataDir, 'evidence', id, reference.evidence.screenshot));
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  await writeFile(join(cacheDir, key + '.json'), JSON.stringify({ id, reference }), {
    mode: 0o600,
  });
}
export async function cachedAlternativeReference(
  id: string,
  key: keyof typeof alternativeSources,
  warning: string,
  cacheDir = referenceCache,
): Promise<ReferenceSnapshot> {
  const cached = JSON.parse(await readFile(join(cacheDir, key + '.json'), 'utf8')) as {
    id: string;
    reference: ReferenceSnapshot;
  };
  const r = cached.reference;
  z.string().uuid().parse(cached.id);
  z.string().uuid().parse(id);
  z.string()
    .regex(/^[a-z0-9-]+\.png$/i)
    .parse(r.evidence.screenshot);
  const age = Date.now() - Date.parse(r.evidence.observedAt);
  const text = JSON.stringify({ heading: r.heading, text: r.text });
  if (
    !validReference(key, r) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 86400000 ||
    createHash('sha256').update(text).digest('hex') !== r.sha256
  )
    throw new Error('Cached reference is stale or failed validation');
  const folder = join(config.dataDir, 'evidence', id);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const screenshot = `cached-ref-${r.sha256}.png`;
  await copyFile(
    join(config.dataDir, 'evidence', cached.id, r.evidence.screenshot),
    join(folder, screenshot),
  );
  await writeFile(join(folder, r.sha256 + '.json'), text, { mode: 0o600 });
  return {
    ...r,
    cacheHit: true,
    refreshWarning: warning,
    refreshAttemptedAt: new Date().toISOString(),
    evidence: { ...r.evidence, screenshot },
  };
}
export async function readAlternativeReference(
  id: string,
  key: keyof typeof alternativeSources,
): Promise<ReferenceSnapshot> {
  const url = alternativeSources[key];
  const sh = await getBrowser();
  const page = await sh.browser.context.newPage();
  await sh.browser.context.setActivePage(page);
  let failure = '';
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await page.goto(url);
        let snapshot = { heading: '', text: '' };
        for (let i = 0; i < 16; i++) {
          snapshot = await page.evaluate(() => ({
            heading: document.querySelector('h1')?.textContent?.trim() ?? '',
            text: document.body.innerText,
          }));
          if (
            /500 internal server error|502 bad gateway|503 service unavailable/i.test(
              snapshot.heading,
            )
          )
            throw new Error('Reference server returned an error');
          if (
            snapshot.heading &&
            snapshot.text.includes(
              key === 'oemSubstituteSpecifications' ? 'S1-CAP4405040DR' : 'S1-02425893700',
            )
          )
            break;
          await new Promise((r) => setTimeout(r, 400));
        }
        const actual = new URL(await page.url()),
          expected = new URL(url);
        if (
          actual.origin !== expected.origin ||
          actual.pathname !== expected.pathname ||
          /captcha|access denied|verify you are human/i.test(snapshot.text.slice(0, 4000))
        )
          throw new Error('Reference is unavailable, redirected or requires a human challenge');
        if (!snapshot.text.trim()) throw new Error('Reference returned an empty page');
        const evidence = await saveEvidence(id, 'alternative-reference-' + key);
        const text = JSON.stringify(snapshot);
        const sha256 = createHash('sha256').update(text).digest('hex');
        const dir = join(config.dataDir, 'evidence', id);
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await writeFile(join(dir, sha256 + '.json'), text, { mode: 0o600 });
        const reference = { ...snapshot, url, sha256, evidence };
        // Changed/unsupported content is returned for explicit review, never silently
        // replaced by an older successful page.
        if (validReference(key, reference)) await rememberAlternativeReference(id, key, reference);
        return reference;
      } catch (e) {
        failure = e instanceof Error ? e.message : 'Reference failed';
        if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
      }
    }
    try {
      return await cachedAlternativeReference(
        id,
        key,
        `Live refresh failed after two attempts: ${failure}. Using a validated reference less than 24 hours old; current content is unverified.`,
      );
    } catch {
      throw new Error(failure + '; no valid recent reference cache is available');
    }
  } finally {
    try {
      await page.close();
    } catch {
      /* The next bounded handoff also checks tab ownership. */
    }
  }
}
export async function reviewAlternatives(
  store: Store,
  id: string,
  supplierLookup: typeof lookup = lookup,
  readReference: typeof readAlternativeReference = readAlternativeReference,
) {
  const job = store.get(id)!;
  const saved = job.alternativeReview!;
  const review: AlternativeReview = {
    ...saved,
    status: 'queued',
    references: [],
    lines: [],
    errors: [],
  };
  const active = () => store.get(id)?.state !== 'cancelled';
  const persist = (message: string) => {
    if (active()) store.update(id, { alternativeReview: structuredClone(review) }, message);
  };
  store.update(
    id,
    { state: 'running' },
    'Checking documented replacement evidence before alternative supplier searches',
  );
  const unresolved = job.capturedParts!.lines.filter(
    (_, i) => !job.results[i]?.offers.some((o) => o.match === 'exact'),
  );
  // Reviewed pilot discovery scope. Unknown components are explicit, never a generic name search.
  const supported = unresolved.some((l) => normalizePart(l.partNumber) === 'S102425893000');
  if (supported)
    for (const key of [
      'crossReference',
      'oemSpecifications',
      'oemSubstituteSpecifications',
    ] as const) {
      if (!active()) return;
      try {
        review.references.push(await readReference(id, key));
      } catch (e) {
        review.errors.push({
          source: alternativeSources[key],
          message: e instanceof Error ? e.message : 'Reference failed',
        });
      }
      if (!active()) return;
      persist('Read alternative reference: ' + key);
    }
  for (const line of unresolved) {
    if (!active()) return;
    const output: AlternativeReview['lines'][number] = {
      lineIndex: line.lineIndex,
      requestedPartNumber: line.partNumber,
      status: 'unsupported',
      candidates: [],
      message:
        'No reviewed replacement-discovery adapter for this component. No compatibility was assumed.',
    };
    review.lines.push(output);
    if (normalizePart(line.partNumber) !== 'S102425893000') {
      persist(output.message);
      continue;
    }
    const cross = review.references.find((r) => r.url === alternativeSources.crossReference);
    const oem = review.references.find((r) => r.url === alternativeSources.oemSpecifications);
    const successor = review.references.find(
      (r) => r.url === alternativeSources.oemSubstituteSpecifications,
    );
    const claim = cross ? parseSupplierReplacement(cross, line.partNumber, 'S1-02425893700') : null;
    const substitute = oem ? parseOemSubstitute(oem) : null;
    output.status = 'needs_review';
    output.message =
      'Documented supplier replacement candidates; inspect each complete chain and compatibility check. Original capture is unchanged.';
    for (const target of ['S1-02425893700', 'S1-CAP4405040DR']) {
      const specs = (target === 'S1-02425893700' ? oem : successor)
        ? parseOemCapacitor((target === 'S1-02425893700' ? oem : successor)!, target)
        : null;
      const claims = claim
        ? [claim, ...(target === 'S1-CAP4405040DR' && substitute ? [substitute] : [])]
        : [];
      const chain = replacementChain(line.partNumber, target, claims);
      const candidate: AlternativeCandidate = {
        manufacturer: 'York',
        partNumber: target,
        specifications: specs,
        claims: chain,
        verification: verifyReplacement(
          line.partNumber,
          line.specifications.capacitanceMfd,
          saved.installedVoltageVac,
          specs,
          chain,
          target,
        ),
        offers: [],
        attempts: [],
      };
      output.candidates.push(candidate);
      if (!chain.length || !specs) {
        review.errors.push({
          source: 'replacement_evidence',
          message: `Complete reference chain or OEM specifications unavailable for ${target}. Supplier lookup was not run.`,
        });
        persist(output.message);
        continue;
      }
      if (candidate.verification.status === 'rejected') {
        persist('Candidate rejected by specification checks');
        continue;
      }
      for (const supplier of new Set(job.input.suppliers)) {
        if (!active()) return;
        persist(`Checking ${supplier} for documented alternative ${target}`);
        try {
          const result = await supplierLookup(
            id,
            job.input,
            {
              name: 'Documented dual-run capacitor candidate',
              manufacturer: 'York',
              partNumber: target,
              quantity: line.quantity,
            },
            supplier,
            false,
          );
          if (!active()) return;
          candidate.offers.push(
            ...result.offers.map((o) => ({
              ...o,
              match: 'alternative' as const,
              eligible: false,
              total: null,
              reason:
                'Documented replacement candidate; compatibility review is required. ' + o.reason,
            })),
          );
          candidate.attempts.push({
            supplier,
            phase: 'alternative',
            status: result.offers.length ? 'found' : 'no_match',
            query: target,
            observedAt: new Date().toISOString(),
            evidence: result.evidence,
            recovery: result.recovery,
            noMatchEvidence: result.noMatchEvidence,
            message: result.noMatchEvidence
              ? `No exact identifier among all ${result.noMatchEvidence.returnedCount} inspected products returned by this query`
              : undefined,
          });
        } catch (e) {
          if (!active()) return;
          candidate.attempts.push({
            supplier,
            phase: 'alternative',
            status: 'error',
            query: target,
            observedAt: new Date().toISOString(),
            code: e instanceof SupplierError ? e.code : 'SUPPLIER_ERROR',
            message: e instanceof Error ? e.message : 'Supplier failed',
            evidence: e instanceof SupplierError ? e.evidence : undefined,
            recovery: e instanceof SupplierError ? e.recovery : undefined,
          });
        }
        persist(`Finished ${supplier} alternative catalog check`);
      }
    }
  }
  if (!active()) return;
  const errors =
    review.errors.length > 0 ||
    review.lines.some((l) =>
      l.candidates.some((c) => c.attempts.some((a) => a.status === 'error')),
    );
  review.status = errors ? 'partial' : 'needs_review';
  store.update(
    id,
    { alternativeReview: review, state: errors ? 'partial' : 'needs_input' },
    errors
      ? 'Some alternative evidence or supplier checks failed; inspect the review.'
      : 'Alternative candidate checks finished. Missing compatibility evidence requires review; no alternative is approved for installation or ranking.',
  );
}
