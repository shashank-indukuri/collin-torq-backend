import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import type { Job } from '../src/store.js';
const base = 'http://127.0.0.1:4310';
const id = process.argv[2] ?? '8d6a564e-3456-4d01-a494-9e64654d538c';
async function get(path: string) {
  const r = await fetch(base + path);
  assert.equal(r.status, 200);
  return r.json();
}
const before: Job = await get('/api/searches/' + id);
assert.ok(before.sourceCapture);
assert.ok(before.capturedParts);
let job = before;
if (!process.argv.includes('--verify-only')) {
  const response: Response = await fetch(`${base}/api/searches/${id}/alternatives/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedUpdatedAt: before.updatedAt, allow: true }),
  });
  assert.equal(response.status, 202);
  job = (await response.json()) as Job;
}
let last = '';
const deadline = Date.now() + 420000;
while (['queued', 'running'].includes(job.state) && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 1000));
  job = await get('/api/searches/' + id);
  if (last !== job.message) {
    console.log(job.message);
    last = job.message;
  }
}
await writeFile('.local/alternatives-live.json', JSON.stringify(job, null, 2));
assert.equal(job.state, 'needs_input');
assert.deepEqual(job.capturedParts, before.capturedParts);
assert.deepEqual(job.results, before.results);
assert.deepEqual(job.sourceCapture, before.sourceCapture);
const review = job.alternativeReview!;
assert.equal(review.errors.length, 0);
assert.equal(review.references.length, 3);
assert.equal(review.lines.length, 1);
const candidate = review.lines[0]!.candidates[0]!;
assert.equal(candidate.partNumber, 'S1-02425893700');
assert.equal(candidate.verification.status, 'needs_review');
assert.equal(candidate.verification.checks.find((c) => c.field === 'voltage')?.status, 'missing');
assert.equal(candidate.specifications?.capacitanceMfd, '40/5');
assert.equal(candidate.specifications?.voltageVac, 370);
assert.equal(candidate.attempts.length, 3);
assert.ok(candidate.attempts.every((a) => a.status !== 'error'));
assert.equal(review.lines[0]!.candidates.length, 2);
const successor = review.lines[0]!.candidates[1]!;
assert.equal(successor.partNumber, 'S1-CAP4405040DR');
assert.equal(successor.specifications?.voltageVac, 440);
assert.equal(successor.claims.length, 2);
assert.deepEqual(
  successor.claims.map((c) => c.authority),
  ['supplier', 'oem'],
);
assert.equal(successor.verification.status, 'needs_review');
assert.equal(successor.attempts.length, 3);
assert.ok(successor.attempts.every((a) => a.status !== 'error'));
assert.ok(successor.offers.some((o) => o.supplier === 'partstown'));
assert.ok(candidate.offers.some((o) => o.supplier === 'johnstone'));
assert.ok(candidate.offers.some((o) => o.supplier === 'partstown'));
assert.ok(
  candidate.offers.every((o) => o.match === 'alternative' && !o.eligible && o.total === null),
);
for (const reference of review.references) {
  await get(`/api/searches/${id}/alternative-references/${reference.sha256}`);
  const r = await fetch(`${base}/api/searches/${id}/evidence/${reference.evidence.screenshot}`);
  assert.equal(r.status, 200);
  assert.ok((await r.arrayBuffer()).byteLength > 1000);
}
for (const a of review.lines[0]!.candidates.flatMap((c) => c.attempts)) {
  assert.ok(a.evidence);
  const r = await fetch(`${base}/api/searches/${id}/evidence/${a.evidence.screenshot}`);
  assert.equal(r.status, 200);
  await r.arrayBuffer();
  for (const product of a.noMatchEvidence?.products ?? []) {
    const proof = await fetch(`${base}/api/searches/${id}/evidence/${product.evidence.screenshot}`);
    assert.equal(proof.status, 200);
    await proof.arrayBuffer();
  }
}
console.log(
  JSON.stringify(
    {
      passed: true,
      id,
      state: job.state,
      referenceCount: review.references.length,
      candidate: candidate.partNumber,
      specifications: candidate.specifications,
      verification: candidate.verification,
      attempts: candidate.attempts.map((a) => ({
        supplier: a.supplier,
        status: a.status,
        code: a.code,
      })),
      successor: {
        partNumber: successor.partNumber,
        attempts: successor.attempts.map((a) => ({
          supplier: a.supplier,
          status: a.status,
          code: a.code,
        })),
        offers: successor.offers.map((o) => ({
          supplier: o.supplier,
          price: o.price,
          eligible: o.eligible,
        })),
      },
      offers: candidate.offers.map((o) => ({
        supplier: o.supplier,
        partNumber: o.partNumber,
        price: o.price,
        match: o.match,
        eligible: o.eligible,
      })),
    },
    null,
    2,
  ),
);
