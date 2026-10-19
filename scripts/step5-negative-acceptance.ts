import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import type { Job } from '../src/store.js';
const base = 'http://127.0.0.1:4310';
const evidence: unknown[] = [];
async function request(path: string, body?: unknown) {
  const r = await fetch(
    base + path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  assert.ok(r.ok, `${r.status} ${await r.clone().text()}`);
  return r.json() as Promise<Job>;
}
async function done(j: Job) {
  const end = Date.now() + 360000;
  while (['queued', 'running'].includes(j.state) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 300));
    j = await request('/api/searches/' + j.id);
  }
  assert.ok(!['queued', 'running'].includes(j.state));
  for (const a of j.results.flatMap((l) => l.attempts ?? [])) {
    assert.ok(a.evidence);
    const r = await fetch(`${base}/api/searches/${j.id}/evidence/${a.evidence.screenshot}`);
    assert.equal(r.status, 200);
    assert.ok((await r.arrayBuffer()).byteLength > 1000);
  }
  return j;
}
const body = (
  manufacturer: string,
  partNumber: string,
  suppliers = ['johnstone', 'partstown', 'grainger'],
) => ({
  mode: 'live',
  stopAfter: 'sourcing',
  suppliers,
  lines: [{ name: 'defrost control', manufacturer, partNumber, quantity: 2 }],
});
for (const [name, input] of [
  ['wrong manufacturer', body('Carrier', 'S1-33101975102')],
  ['longer identifier', body('York', 'S1-33101975102A')],
] as const) {
  const j = await done(await request('/api/searches', input));
  assert.equal(j.results[0]!.offers.length, 0, `${name} incorrectly produced an offer`);
  assert.equal(j.results[0]!.attempts?.length, 3);
  assert.ok(j.results[0]!.attempts!.every((a) => a.status !== 'found'));
  if (name === 'wrong manufacturer') {
    assert.equal(j.state, 'partial');
    assert.ok(j.results[0]!.attempts!.every((a) => a.status === 'error'));
  }
  evidence.push({ name, job: j });
  console.log(
    'PASS',
    name,
    j.results[0]!.attempts!.map((a) => ({ supplier: a.supplier, status: a.status, code: a.code })),
  );
}
const healthy = await done(
  await request('/api/searches', body(' York ', 'S1-33101975102', ['partstown'])),
);
assert.equal(healthy.state, 'completed');
assert.equal(healthy.results[0]!.offers[0]!.match, 'exact');
assert.equal(healthy.results[0]!.quantity, 2);
assert.equal(healthy.results[0]!.offers[0]!.eligible, false);
evidence.push({ name: 'whitespace and quantity input after negative cases', job: healthy });
const stress = JSON.parse(await readFile('.local/step5-stress-report.json', 'utf8'));
assert.equal(stress.passed, true);
const failed = stress.cases.find(
  (c: { name: string }) => c.name === 'Ollama missing model fails closed',
);
assert.ok(failed);
const retried = await done(await request(`/api/searches/${failed.jobId}/retry`, {}));
assert.equal(retried.state, 'completed');
assert.equal(retried.results[0]!.attempts?.length, 1);
assert.equal(retried.results[0]!.errors.length, 0);
assert.equal(retried.results[0]!.offers[0]!.match, 'exact');
evidence.push({ name: 'API retry of actual model-failure job', job: retried });
for (const patch of [
  { forceRecovery: true },
  { mode: 'cloud' },
  { suppliers: [] },
  { lines: [{ name: 'board', quantity: 0 }] },
  { lines: [{ name: 'board', quantity: 10001 }] },
]) {
  const r = await fetch(base + '/api/searches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body('York', 'S1-33101975102'), ...patch }),
  });
  assert.equal(r.status, 400);
}
await writeFile(
  '.local/step5-negative-report.json',
  JSON.stringify({ passed: true, evidence, invalidRequestsRejected: 5 }, null, 2),
);
console.log(
  'PASS real negative supplier checks, healthy input, actual retry and five invalid API requests',
);
