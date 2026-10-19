import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Job, SupplierAttempt } from '../src/store.js';
import { normalizePart, suppliers } from '../src/domain.js';
// Run against the idle local backend. Input comes from an existing reviewed capture.
const base = 'http://127.0.0.1:4310';
const parentId = process.argv[2] ?? 'c54ab711-5e39-4bf2-bd11-992ec2375623';
const rounds = Number(process.argv[3] ?? 2);
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 5);
async function get(path: string) {
  const r = await fetch(base + path);
  assert.equal(r.status, 200);
  return r.json();
}
const parent = (await get('/api/searches/' + parentId)) as Job;
const capture = parent.capturedParts;
assert.ok(capture, 'A reviewed capture is required');
assert.deepEqual(
  capture.lines.map((l) => normalizePart(l.partNumber)),
  ['S133101975102', 'S102425893000'],
  'This acceptance checks Collin’s two specific historical guide identifiers',
);
const outcomes = [];
for (let round = 1; round <= rounds; round++) {
  const started = Date.now();
  const response: Response = await fetch(base + '/api/searches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'live',
      stopAfter: 'sourcing',
      model: capture.model,
      origin: parent.input.origin,
      suppliers,
      allowAlternatives: false,
      lines: capture.lines.map((l) => ({
        name: l.description,
        manufacturer: l.manufacturer,
        partNumber: l.partNumber,
        quantity: l.quantity,
      })),
    }),
  });
  assert.equal(response.status, 202);
  let job = (await response.json()) as Job;
  console.log(`Round ${round}: ${job.id}`);
  const deadline = Date.now() + 420000;
  let last = '';
  while (['queued', 'running'].includes(job.state) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    job = await get('/api/searches/' + job.id);
    if (job.message !== last) {
      console.log(job.message);
      last = job.message;
    }
  }
  await mkdir('.local', { recursive: true });
  await writeFile(`.local/supplier-coverage-round-${round}.json`, JSON.stringify(job, null, 2));
  assert.ok(
    ['needs_permission', 'completed'].includes(job.state),
    `Supplier checks unresolved: ${job.state}`,
  );
  assert.equal(job.results.length, 2);
  for (const [index, line] of job.results.entries()) {
    assert.equal(line.errors.length, 0);
    assert.equal(line.attempts?.length, 3);
    for (const supplier of suppliers) {
      const attempt: SupplierAttempt = line.attempts!.find((a) => a.supplier === supplier)!;
      assert.ok(attempt);
      assert.equal(attempt.status, index === 0 ? 'found' : 'no_match', `${line.name}: ${supplier}`);
      assert.equal(attempt.phase, 'exact');
      assert.ok(attempt.evidence);
      assert.ok(Date.parse(attempt.observedAt) >= started - 1000);
      const r = await fetch(
        `${base}/api/searches/${job.id}/evidence/${attempt.evidence.screenshot}`,
      );
      assert.equal(r.status, 200);
      assert.match(r.headers.get('content-type') ?? '', /image\/png/);
      assert.ok((await r.arrayBuffer()).byteLength > 1000);
    }
    for (const offer of line.offers) {
      assert.equal(offer.match, 'exact');
      assert.equal(offer.synthetic, false);
      assert.equal(
        normalizePart(offer.partNumber),
        normalizePart(capture.lines[index]!.partNumber),
      );
      assert.equal(offer.stockQuantity, null);
      assert.equal(offer.pickupReady, null);
      assert.equal(offer.eligible, false);
    }
  }
  const johnstone = job.results[0]!.offers.find((o) => o.supplier === 'johnstone')!;
  assert.equal(johnstone.manufacturer, 'Source 1');
  assert.equal(johnstone.identityEvidence?.basis, 'oem_service_brand');
  assert.equal(johnstone.access, 'authenticated');
  assert.equal(
    job.results[0]!.offers.find((o) => o.supplier === 'partstown')?.access,
    'authenticated',
  );
  outcomes.push({
    round,
    jobId: job.id,
    state: job.state,
    checks: 6,
    errors: 0,
    durationMs: Date.now() - started,
  });
}
const report = {
  passed: true,
  scope:
    'Exact catalog query outcomes only; not branch inventory, alternatives, prices, or installed compatibility',
  parentId,
  outcomes,
  checksPassed: rounds * 6,
  checksTotal: rounds * 6,
};
await writeFile('.local/supplier-coverage-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
