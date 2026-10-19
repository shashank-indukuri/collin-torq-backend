import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { inputSchema } from '../src/domain.js';
import { Worker } from '../src/worker.js';
import { exclusive } from '../src/browser.js';
import { SupplierError, type lookup } from '../src/suppliers.js';
const input = inputSchema.parse({
  mode: 'live',
  lines: [
    { name: 'defrost control', manufacturer: 'York', partNumber: 'S1-33101975102' },
    { name: 'capacitor', manufacturer: 'York', partNumber: 'S1-02425893000' },
  ],
});
const evidence = {
  url: 'https://www.partstown.com/p/york/test',
  screenshot: 'test.png',
  observedAt: new Date().toISOString(),
};
test('twelve queued jobs and duplicate enqueues serialize browser ownership without dropped attempts', async () => {
  const store = new Store(':memory:');
  let active = 0,
    max = 0,
    calls = 0;
  const fn: typeof lookup = async () => {
    calls++;
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 2));
    active--;
    return { offers: [], evidence };
  };
  try {
    const worker = new Worker(store, undefined, fn, async () => null);
    const jobs = Array.from({ length: 12 }, () => store.create(input).job);
    for (const j of jobs) {
      worker.enqueue(j.id);
      worker.enqueue(j.id);
    }
    await exclusive(async () => {});
    assert.equal(max, 1);
    assert.equal(calls, 72);
    for (const j of jobs) {
      const done = store.get(j.id)!;
      assert.equal(done.state, 'needs_permission');
      assert.ok(done.results.every((l) => l.attempts?.length === 3));
    }
  } finally {
    store.db.close();
  }
});
test('each real-world failure class remains a partial error and does not block the next supplier or job', async () => {
  for (const code of [
    'AUTH_REQUIRED',
    'SITE_CHALLENGE',
    'EMPTY_PAGE',
    'PRODUCT_DETAILS_UNVERIFIED',
    'PRODUCT_IDENTITY_UNVERIFIED',
    'RECOVERY_FAILED',
    'SUPPLIER_ERROR',
  ]) {
    const store = new Store(':memory:');
    let calls = 0;
    const fn: typeof lookup = async (id, input, line, supplier) => {
      calls++;
      if (supplier === 'johnstone')
        throw new SupplierError(code, 'Injected failure', evidence, {
          attempted: true,
          navigationVerified: false,
        });
      return { offers: [], evidence };
    };
    try {
      const worker = new Worker(store, undefined, fn, async () => null);
      const j = store.create(input).job;
      worker.enqueue(j.id);
      await exclusive(async () => {});
      const done = store.get(j.id)!;
      assert.equal(calls, 6);
      assert.equal(done.state, 'partial');
      for (const l of done.results) {
        assert.equal(l.offers.length, 0);
        assert.equal(l.attempts?.[0]?.status, 'error');
        assert.equal(l.attempts?.[0]?.code, code);
        assert.equal(l.attempts?.[0]?.recovery?.navigationVerified, false);
        assert.equal(l.attempts?.[2]?.status, 'no_match');
      }
    } finally {
      store.db.close();
    }
  }
});
test('restart refreshes interrupted read-only jobs without duplicating stale offers or attempts', async () => {
  const store = new Store(':memory:');
  let calls = 0;
  const fn: typeof lookup = async () => {
    calls++;
    return { offers: [], evidence };
  };
  try {
    const j = store.create(input).job;
    store.update(j.id, {
      state: 'running',
      results: [
        { name: 'stale incomplete result', quantity: 1, offers: [], errors: [], attempts: [] },
      ],
    });
    const worker = new Worker(store, undefined, fn, async () => null);
    worker.restart();
    worker.restart();
    await exclusive(async () => {});
    const done = store.get(j.id)!;
    assert.equal(calls, 6);
    assert.equal(done.state, 'needs_permission');
    assert.equal(done.results.length, 2);
    assert.equal(done.results[0]!.name, 'defrost control');
    assert.ok(done.results.every((l) => l.attempts?.length === 3));
  } finally {
    store.db.close();
  }
});
test('queued cancellation makes zero supplier calls and cannot be resurrected by restart', async () => {
  const store = new Store(':memory:');
  let calls = 0;
  const fn: typeof lookup = async () => {
    calls++;
    return { offers: [], evidence };
  };
  try {
    const worker = new Worker(store, undefined, fn, async () => null);
    const j = store.create(input).job;
    store.update(j.id, { state: 'cancelled' });
    worker.enqueue(j.id);
    worker.restart();
    await exclusive(async () => {});
    assert.equal(calls, 0);
    assert.equal(store.get(j.id)?.state, 'cancelled');
  } finally {
    store.db.close();
  }
});
