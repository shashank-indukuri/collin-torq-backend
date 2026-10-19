import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { config } from './config.js';
import {
  resolveGeneralGuide,
  generalGuidePages,
  type GeneralGuideDependencies,
} from './general-guides.js';

// Reviewed discovery seed, not a hardcoded part-number answer. Additional manufacturers
// require separate discovery adapters; unavailable doors are reported rather than simulated.
const yorkGuide = {
  sourceUrl: 'https://www.hvacrmart.com/assets/images/Resources/JOHCONE00442_1-3.pdf',
  manufacturer: 'York',
  publisher: 'Johnson Controls Unitary Products / Source 1',
  title: 'E1RD SERIES - 13 SEER X3 HEAT PUMP (R22) (STYLE B)',
  documentNumber: '035-21220-001',
  revision: 'Rev. E (0409)',
};
const pageSchema = z.object({ page: z.number().int().positive(), text: z.string() });
const cachedSchema = z.object({
  schemaVersion: z.literal(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  retrievedAt: z.string(),
  sourceUrl: z.literal(yorkGuide.sourceUrl),
  pages: z.array(pageSchema).min(1),
});
export const guideRequestSchema = z
  .object({
    manufacturer: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(120),
  })
  .strict();
export type GuideRequest = z.infer<typeof guideRequestSchema>;
type GuidePages = z.infer<typeof pageSchema>[];
type GuideDependencies = {
  fetch?: typeof fetch;
  extractPdf?: (path: string) => Promise<GuidePages>;
  general?: GeneralGuideDependencies;
};
type Attempt = {
  door: string;
  status: 'hit' | 'miss' | 'not_implemented' | 'error';
  detail: string;
};
export type GuideResolution = {
  status: 'guide_found' | 'needs_model_confirmation' | 'not_found' | 'unavailable';
  requested: GuideRequest;
  normalizedModel: string;
  cacheHit: boolean;
  attempts: Attempt[];
  message: string;
  guide:
    | null
    | (typeof yorkGuide & {
        sha256: string;
        retrievedAt: string;
        hostType: 'distributor_mirror' | 'unverified_public_source';
        discoveryMethod?: 'agent';
        evidenceUrl: string;
        pageCount: number;
        coveredModels: string[];
        matchingModels: string[];
        modelEvidence: { page: number; text: string }[];
        applicability: 'exact_model_listed' | 'prefix_only' | 'not_listed';
        warnings: string[];
      });
};
export function normalizeModel(value: string, manufacturer = 'York') {
  const prefix = manufacturer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value
    .trim()
    .toUpperCase()
    .replace(new RegExp('^' + prefix + '\\s*[-:]?\\s*', 'i'), '')
    .replace(/[\s-]/g, '');
}
export function modelEvidence(pages: z.infer<typeof pageSchema>[], model: string) {
  // Restrict coverage to the FIG ITEM DESCRIPTION column headings, never incidental prose.
  const evidence = pages.flatMap((p) =>
    p.text
      .split('\n')
      .filter((l) => /FIG\s+ITEM\s+DESCRIPTION/i.test(l))
      .map((text) => ({ page: p.page, text })),
  );
  const coveredModels = [
    ...new Set(evidence.flatMap((e) => e.text.match(/\bE1RD\d{3}S\d{2}[A-Z]\b/g) ?? [])),
  ];
  return {
    coveredModels,
    matchingModels: coveredModels.filter((m) => m === model || m.startsWith(model)),
    modelEvidence: evidence.filter((e) => e.text.includes(model)),
  };
}
const execFileAsync = promisify(execFile);
export class GuideResolver {
  private pending: Promise<z.infer<typeof cachedSchema>> | undefined;
  private verifiedPages = new Map<string, GuidePages>();
  constructor(
    private directory = join(config.dataDir, 'guides'),
    private dependencies: GuideDependencies = {},
  ) {}
  private async extract(path: string, sha256: string) {
    const verified = this.verifiedPages.get(sha256);
    if (verified) return verified;
    let pages: GuidePages;
    if (this.dependencies.extractPdf) pages = await this.dependencies.extractPdf(path);
    else {
      const { stdout } = await execFileAsync(
        resolve('.venv/bin/python'),
        [resolve('python/read_guide.py'), path],
        { timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
      );
      pages = z
        .object({ pages: z.array(pageSchema).min(1).max(100) })
        .parse(JSON.parse(stdout)).pages;
    }
    const text = pages.map((p) => p.text).join('\n');
    if (
      !text.includes('Johnson Controls Unitary Products') ||
      !text.includes(yorkGuide.documentNumber) ||
      !text.includes(yorkGuide.revision) ||
      !modelEvidence(pages, 'E1RD').coveredModels.length
    )
      throw new Error(
        'Document identity, revision or model headings changed; review source before accepting',
      );
    this.verifiedPages.set(sha256, pages);
    return pages;
  }
  private async cached() {
    try {
      const record = cachedSchema.parse(
        JSON.parse(await readFile(join(this.directory, 'york-e1rd.json'), 'utf8')),
      );
      const bytes = await readFile(join(this.directory, `${record.sha256}.pdf`));
      if (createHash('sha256').update(bytes).digest('hex') !== record.sha256) return null;
      // Metadata text can be corrupt even when PDF bytes are intact. Re-derive
      // applicability from the verified PDF instead of trusting cached text.
      // Reuse parsed evidence in memory only for an already verified content hash.
      return {
        ...record,
        pages: await this.extract(join(this.directory, `${record.sha256}.pdf`), record.sha256),
      };
    } catch {
      return null;
    }
  }
  private async download() {
    const response = await (this.dependencies.fetch ?? fetch)(yorkGuide.sourceUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Guide source returned HTTP ${response.status}`);
    const limit = 12 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > limit)
      throw new Error('Guide exceeds size limit');
    if (!response.body) throw new Error('Guide body missing');
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) throw new Error('Guide exceeds size limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = Buffer.concat(chunks);
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('Source did not return a PDF');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, `${sha256}.pdf`);
    await writeFile(path, bytes, { mode: 0o600 });
    const pages = await this.extract(path, sha256);
    const record = cachedSchema.parse({
      schemaVersion: 1,
      sha256,
      retrievedAt: new Date().toISOString(),
      sourceUrl: yorkGuide.sourceUrl,
      pages,
    });
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, join(this.directory, 'york-e1rd.json'));
    return record;
  }
  async resolve(raw: GuideRequest): Promise<GuideResolution> {
    const requested = guideRequestSchema.parse(raw);
    const model = normalizeModel(requested.model);
    const attempts: Attempt[] = [];
    const result: GuideResolution = {
      status: 'not_found',
      requested,
      normalizedModel: model,
      cacheHit: false,
      attempts,
      guide: null,
      message: '',
    };
    if (
      requested.manufacturer.toLowerCase() !== 'york' ||
      !/^E1RD\d{3}(S\d{2}[A-Z])?$/.test(model)
    ) {
      return resolveGeneralGuide(this.directory, requested, this.dependencies.general);
    }
    let record = await this.cached();
    result.cacheHit = Boolean(record);
    attempts.push({
      door: 'saved_guides',
      status: record ? 'hit' : 'miss',
      detail: record ? 'PDF checksum verified against the saved guide.' : 'No intact saved guide.',
    });
    if (!record) {
      for (const [door, detail] of [
        ['manufacturer_public', 'Automated manufacturer guide search is not implemented.'],
        ['shop_dealer_portal', 'Shop dealer portal is not configured.'],
        ['johnstone_model_to_part', 'Authenticated guide discovery is not implemented.'],
        ['partstown_model_pages', 'Public model-guide discovery is not implemented.'],
      ])
        attempts.push({ door: door!, status: 'not_implemented', detail: detail! });
      try {
        // Share only in-flight downloads for this directory; subsequent lookups verify disk.
        if (!this.pending)
          this.pending = this.download().finally(() => {
            this.pending = undefined;
          });
        record = await this.pending;
        attempts.push({
          door: 'reviewed_open_web_source',
          status: 'hit',
          detail: 'Downloaded and validated a reviewed manufacturer-authored distributor mirror.',
        });
      } catch (e) {
        attempts.push({
          door: 'reviewed_open_web_source',
          status: 'error',
          detail: e instanceof Error ? e.message : 'Download failed',
        });
        result.status = 'unavailable';
        result.message =
          'Guide could not be retrieved or validated; no model or part numbers were inferred.';
        return result;
      }
    }
    const coverage = modelEvidence(record.pages, model);
    const exact = coverage.coveredModels.includes(model);
    const declaredCounts = record.pages.flatMap((p) =>
      Array.from(p.text.matchAll(/\b\d+\s+of\s+(\d+)\b/gi), (m) => Number(m[1])),
    );
    const declaredCount = Math.max(record.pages.length, ...declaredCounts);
    const incomplete = declaredCount > record.pages.length;
    const warnings = [
      'Historical April 2009 revision; current supersessions are not verified.',
      'Distributor mirror, not an OEM-hosted download.',
      ...(incomplete
        ? [
            `PDF contains ${record.pages.length} pages but printed numbering declares ${declaredCount}. This is an incomplete guide copy.`,
          ]
        : []),
      'Model listing confirms only document coverage. Serial-number applicability and installed modifications are not verified.',
      'Requested part extraction and supplier availability have not run.',
    ];
    result.guide = {
      ...yorkGuide,
      sha256: record.sha256,
      retrievedAt: record.retrievedAt,
      hostType: 'distributor_mirror',
      evidenceUrl: `/api/guides/${record.sha256}/document`,
      pageCount: record.pages.length,
      ...coverage,
      applicability: exact
        ? 'exact_model_listed'
        : coverage.matchingModels.length
          ? 'prefix_only'
          : 'not_listed',
      warnings,
    };
    result.status = exact
      ? 'guide_found'
      : coverage.matchingModels.length
        ? 'needs_model_confirmation'
        : 'not_found';
    result.message = exact
      ? 'Full model appears in the guide table. Review document warnings before part extraction.'
      : coverage.matchingModels.length
        ? 'A candidate guide lists a longer model matching this prefix. Confirm the full model from the nameplate; the suffix is not assumed.'
        : 'This guide does not list the requested full model. No applicability or part number inferred.';
    return result;
  }
  async pages(hash: string) {
    const record = await this.cached();
    return record?.sha256 === hash
      ? structuredClone(record.pages)
      : generalGuidePages(this.directory, hash, this.dependencies.general);
  }
  async document(hash: string) {
    const record = await this.cached();
    if (
      (!record || record.sha256 !== hash) &&
      !(await generalGuidePages(this.directory, hash, this.dependencies.general))
    )
      return null;
    return readFile(join(this.directory, `${hash}.pdf`));
  }
}
