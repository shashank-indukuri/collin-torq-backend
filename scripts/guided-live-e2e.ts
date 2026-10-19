import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createApp } from '../src/server.js';
import { getBrowser, exclusive } from '../src/browser.js';
import { config } from '../src/config.js';
import type { Job } from '../src/store.js';

const base = `http://127.0.0.1:${config.port}`;
let runtime = createApp();
const report: {
  passed: boolean;
  startedAt: string;
  engine: string;
  cases: unknown[];
  failure?: string;
  commercialComplete?: boolean;
  jobId?: string;
} = {
  passed: false,
  startedAt: new Date().toISOString(),
  engine: config.supplierEngine,
  cases: [],
};
const save = () =>
  writeFile('.local/guided-live-e2e.json', JSON.stringify(report, null, 2), { mode: 0o600 });
async function until<T>(read: () => Promise<T | undefined>, label: string, ms = 30000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Timed out: ' + label);
}
async function done(id: string) {
  return until(
    async () => {
      const j = runtime.store.get(id);
      return j && !['queued', 'running'].includes(j.state) ? j : undefined;
    },
    'job ' + id,
    600000,
  ).then(async (j) => {
    await exclusive(async () => {});
    return runtime.store.get(j.id)!;
  });
}
async function getJob(id: string) {
  const r = await fetch(base + '/api/searches/' + id);
  assert.equal(r.status, 200);
  return r.json() as Promise<Job>;
}
async function ui(jobId?: string) {
  const sh = await getBrowser(),
    page = await sh.browser.context.newPage();
  await page.goto(base + '/flow');
  await page.evaluate((id) => {
    if (id) localStorage.setItem('torq-flow-job', id);
    else localStorage.removeItem('torq-flow-job');
    history.replaceState(
      null,
      '',
      location.pathname + (id ? '?job=' + encodeURIComponent(id) : ''),
    );
    location.reload();
  }, jobId ?? '');
  await until(
    async () =>
      (await page.evaluate(() =>
        document.querySelector('#health-label')?.textContent?.includes('ready'),
      ))
        ? true
        : undefined,
    'UI health',
  );
  if (jobId)
    await until(
      async () =>
        (await page.evaluate(() => !document.querySelector('#workspace')?.hasAttribute('hidden')))
          ? true
          : undefined,
      'saved job render',
    );
  return page;
}
async function clickText(page: Awaited<ReturnType<typeof ui>>, text: string) {
  await page.evaluate((value) => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === value,
    );
    if (!button || button.disabled) throw new Error('Button unavailable: ' + value);
    button.click();
  }, text);
}
async function child(find: (j: Job) => boolean) {
  return until(async () => runtime.store.list().find(find), 'new child request', 30000);
}
async function evidence(job: Job) {
  const files = new Set<string>();
  for (const line of job.results)
    for (const a of line.attempts ?? []) if (a.evidence) files.add(a.evidence.screenshot);
  for (const line of job.results)
    for (const offer of line.offers) {
      files.add(offer.evidence);
      if (offer.commercial) files.add(offer.commercial.evidence.screenshot);
      for (const f of offer.agent?.observations ?? []) files.add(f.evidence.screenshot);
    }
  for (const reference of job.alternativeReview?.references ?? []) {
    files.add(reference.evidence.screenshot);
    const r = await fetch(
      `${base}/api/searches/${job.id}/alternative-references/${reference.sha256}`,
    );
    assert.equal(r.status, 200);
  }
  for (const line of job.alternativeReview?.lines ?? [])
    for (const c of line.candidates)
      for (const a of c.attempts) {
        if (a.evidence) files.add(a.evidence.screenshot);
        for (const p of a.noMatchEvidence?.products ?? []) files.add(p.evidence.screenshot);
      }
  for (const file of files) {
    const r = await fetch(`${base}/api/searches/${job.id}/evidence/${encodeURIComponent(file)}`);
    assert.equal(r.status, 200, file);
    assert.ok((await r.arrayBuffer()).byteLength > 100);
  }
  return files.size;
}
await runtime.app.listen({ host: '127.0.0.1', port: config.port });
await save();
try {
  let page = await ui();
  await page.locator('#start-button').click();
  const prefix = await child(
    (j) =>
      j.createdAt >= report.startedAt && j.input.model === 'York - E1RD036' && !j.sourceCapture,
  );
  let guide = await done(prefix.id);
  assert.equal(guide.guide?.status, 'needs_model_confirmation');
  assert.equal(guide.results.length, 0);
  await until(
    async () =>
      (await page.evaluate(() => Boolean(document.querySelector('#confirmed-model'))))
        ? true
        : undefined,
    'model confirmation',
  );
  await page.evaluate(() => {
    const select = document.querySelector('#confirmed-model') as HTMLSelectElement;
    select.value = 'E1RD036S06B';
    select.dispatchEvent(new Event('change'));
    select.closest('form')!.requestSubmit();
  });
  guide = await until(async () => {
    const j = await getJob(prefix.id);
    return j.guide?.status === 'guide_found' && j.parts ? j : undefined;
  }, 'part extraction');
  await until(
    async () =>
      (await page.evaluate(() => Boolean(document.querySelector('#candidate-1'))))
        ? true
        : undefined,
    'component review',
  );
  await page.evaluate(() => {
    for (const id of ['candidate-0', 'candidate-1']) {
      const s = document.getElementById(id) as HTMLSelectElement;
      s.value = '0';
      s.dispatchEvent(new Event('change'));
    }
  });
  await clickText(page, 'Save these part numbers');
  const captured = await until(async () => {
    const j = await getJob(prefix.id);
    return j.capturedParts ? j : undefined;
  }, 'durable capture');
  assert.equal(captured.capturedParts!.modelBasis, 'test_model');
  assert.equal(captured.capturedParts!.lines[1]!.specifications.voltage, null);
  report.cases.push({
    name: 'UI → prefix clarification → real cached PDF → component selection → capture',
    jobId: captured.id,
  });
  await save();
  console.log('PASS guide and capture', captured.id);
  await until(
    async () =>
      (await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).some(
          (b) => b.textContent === 'Search selected suppliers',
        ),
      ))
        ? true
        : undefined,
    'sourcing button',
  );
  await clickText(page, 'Search selected suppliers');
  const source = await done((await child((j) => j.sourceCapture?.jobId === captured.id)).id);
  assert.deepEqual(runtime.store.get(captured.id), captured);
  assert.equal(source.execution?.supplierEngine, config.supplierEngine);
  assert.ok(source.results.every((l) => l.attempts?.length === 3));
  assert.ok(
    source.results.every((l) => l.errors.length === 0),
    JSON.stringify(source.results.map((l) => l.errors)),
  );
  assert.ok(source.results[0]!.offers.length >= 2);
  assert.equal(source.results[1]!.offers.length, 0);
  assert.equal(source.alternativeReview, undefined);
  report.cases.push({
    name: 'captured source → three suppliers × two lines, immutable parent, no automatic alternatives',
    jobId: source.id,
    evidenceFiles: await evidence(source),
    execution: source.execution,
  });
  await save();
  console.log('PASS exact sourcing', source.id);
  page = await ui(source.id);
  await until(
    async () =>
      (await page.evaluate(() =>
        Boolean(document.querySelector('[data-action="review-alternatives"]')),
      ))
        ? true
        : undefined,
    'alternatives consent available',
  );
  await clickText(page, 'Compare verified options');
  const compared = await done((await child((j) => j.comparisonOf?.jobId === source.id)).id);
  assert.deepEqual(runtime.store.get(source.id), source);
  assert.ok(compared.comparison);
  assert.ok(compared.results.every((l) => l.errors.length === 0));
  report.commercialComplete = compared.comparison.status === 'ready';
  report.cases.push({
    name: 'fresh comparison and immutable exact source',
    jobId: compared.id,
    status: compared.comparison.status,
    evidenceFiles: await evidence(compared),
    categories: compared.comparison.lines.map((l) => ({
      name: l.name,
      cheapest: l.rankings.cheapest.winners.length,
      closest: l.rankings.closest.winners.length,
      arrival: l.rankings.fastestShipping.winners.length,
      missing: l.rankings.excluded,
    })),
  });
  await save();
  console.log('PASS comparison processing; commercial completeness:', report.commercialComplete);
  page = await ui(compared.id);
  await until(
    async () =>
      (await page.evaluate(() =>
        Boolean(document.querySelector('[data-action="review-alternatives"]')),
      ))
        ? true
        : undefined,
    'comparison alternatives consent',
  );
  const exactResults = structuredClone(compared.results),
    captureSnapshot = structuredClone(compared.capturedParts);
  await page.locator('[data-action="review-alternatives"]').click();
  await until(
    async () => (runtime.store.get(compared.id)?.alternativeReview ? true : undefined),
    'consent persisted',
  );
  const reviewed = await done(compared.id);
  assert.ok(reviewed.alternativeReview);
  assert.deepEqual(reviewed.results, exactResults);
  assert.deepEqual(reviewed.capturedParts, captureSnapshot);
  assert.ok(reviewed.alternativeReview.lines.some((l) => l.candidates.length));
  assert.equal(
    reviewed.alternativeReview.errors.length,
    0,
    JSON.stringify(reviewed.alternativeReview.errors),
  );
  for (const line of reviewed.alternativeReview.lines)
    for (const c of line.candidates) {
      assert.equal(c.verification.rankingEligible, false);
      assert.ok(
        c.attempts.every((a) => a.status !== 'error'),
        JSON.stringify(c.attempts),
      );
      assert.ok(c.offers.every((o) => o.match === 'alternative' && !o.eligible));
    }
  report.cases.push({
    name: 'explicit UI consent → documented alternative review → unchanged capture/exact results',
    jobId: reviewed.id,
    evidenceFiles: await evidence(reviewed),
    candidates: reviewed.alternativeReview.lines.flatMap((l) =>
      l.candidates.map((c) => ({
        number: c.partNumber,
        verification: c.verification.status,
        offers: c.offers.length,
      })),
    ),
  });
  report.jobId = reviewed.id;
  await save();
  page = await ui(reviewed.id);
  await until(
    async () =>
      (await page.evaluate(() => document.body.innerText.includes('S1-02425893700')))
        ? true
        : undefined,
    'candidate review UI',
  );
  await page.screenshot({ path: '.local/guided-live-e2e.png', fullPage: true });
  const persisted = structuredClone(runtime.store.get(reviewed.id));
  await runtime.app.close();
  runtime = createApp();
  await runtime.app.listen({ host: '127.0.0.1', port: config.port });
  assert.deepEqual(runtime.store.get(reviewed.id), persisted);
  const response = await getJob(reviewed.id);
  assert.deepEqual(response.capturedParts, captureSnapshot);
  assert.deepEqual(response.results, exactResults);
  report.cases.push({
    name: 'actual API/browser shutdown and restart preserves review, capture, exact results and evidence',
    jobId: reviewed.id,
    evidenceFiles: await evidence(response),
  });
  report.passed = true;
  await save();
  console.log('PASS guided live E2E', JSON.stringify(report));
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  await save();
  console.error('FAIL guided live E2E:', report.failure);
  if (!process.argv.includes('--serve')) {
    await runtime.app.close();
    throw error;
  }
  process.exitCode = 1;
}
if (process.argv.includes('--serve')) {
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void runtime.app.close().then(() => process.exit(0));
    });
  console.log('Backend remains available.');
} else await runtime.app.close();
