import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, type Job } from '../src/store.js';
import { inputSchema, assess } from '../src/domain.js';
import { startCapturedSourcing } from '../src/sourcing.js';
import { createApp } from '../src/server.js';
import { SupplierError, type lookup } from '../src/suppliers.js';
import { Worker } from '../src/worker.js';
import { fixtureOffer } from '../src/fixture.js';
const evidence = {
  url: 'https://example.test/product',
  screenshot: 'check.png',
  observedAt: new Date().toISOString(),
};
function captured(store: Store) {
  const { job } = store.create(
    inputSchema.parse({
      mode: 'live',
      stopAfter: 'capture',
      model: 'E1RD036S06B',
      lines: [{ name: 'board' }, { name: 'capacitor' }],
    }),
  );
  store.update(job.id, {
    state: 'completed',
    capturedParts: {
      status: 'captured',
      model: 'E1RD036S06B',
      modelBasis: 'test_model',
      capturedAt: new Date().toISOString(),
      guideSha256: 'a'.repeat(64),
      requestSignature: 'test-signature',
      warnings: ['Historical test capture'],
      currentSupersessionsVerified: false,
      installedCompatibilityVerified: false,
      alternativeSpecificationsVerified: false,
      lines: [
        ['control board', 'Control, Defrost', 'S1-33101975102'],
        ['capacitor', 'Capacitor, Run (40/5MFD)', 'S1-02425893000'],
      ].map(([requestedName, description, partNumber], lineIndex) => ({
        lineIndex,
        requestedName: requestedName!,
        description: description!,
        partNumber: partNumber!,
        quantity: 1,
        manufacturer: 'York',
        componentSelection: 'explicit',
        specifications: { capacitanceMfd: lineIndex ? '40/5' : null, voltage: null },
        evidence: {
          ...evidence,
          page: 2,
          model: 'E1RD036S06B',
          modelColumn: 4,
          header: 'model header',
          row: 'row',
          cells: [],
          sourceUrl: evidence.url,
          documentUrl: '/guide.pdf',
          sha256: 'a'.repeat(64),
          revision: 'E',
        },
      })),
    },
  });
  return store.get(job.id)!;
}
const request = (job: Job) => ({
  expectedCapturedAt: job.capturedParts!.capturedAt,
  suppliers: ['johnstone', 'partstown', 'grainger'],
});
async function finished(store: Store, id: string) {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    const job = store.get(id)!;
    if (!['queued', 'running'].includes(job.state)) return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Worker timeout');
}
test('captured source creates an immutable, idempotent child with only server-selected exact identifiers', () => {
  const store = new Store(':memory:');
  try {
    const parent = captured(store);
    const first = startCapturedSourcing(store, parent.id, request(parent));
    assert.equal(first.job.input.mode, 'live');
    assert.equal(first.job.input.allowAlternatives, false);
    assert.equal(first.job.sourceCapture?.jobId, parent.id);
    assert.deepEqual(
      first.job.input.lines.map((l) => l.partNumber),
      ['S1-33101975102', 'S1-02425893000'],
    );
    assert.deepEqual(store.get(parent.id), parent);
    const again = startCapturedSourcing(store, parent.id, {
      ...request(parent),
      suppliers: ['grainger', 'johnstone', 'partstown'],
    });
    assert.equal(again.reused, true);
    assert.equal(again.job.id, first.job.id);
    assert.throws(
      () =>
        startCapturedSourcing(store, parent.id, {
          ...request(parent),
          expectedCapturedAt: '2020-01-01T00:00:00Z',
        }),
      /STALE_CAPTURE/,
    );
    assert.throws(
      () =>
        startCapturedSourcing(store, parent.id, {
          ...request(parent),
          lines: [{ partNumber: 'FAKE' }],
        }),
      /Unrecognized key/,
    );
  } finally {
    store.db.close();
  }
});
test('missing or unfinished capture cannot start supplier work', () => {
  const store = new Store(':memory:');
  try {
    const parent = captured(store);
    store.update(parent.id, { capturedParts: undefined });
    assert.throws(
      () => startCapturedSourcing(store, parent.id, request(parent)),
      /CAPTURE_REQUIRED/,
    );
  } finally {
    store.db.close();
  }
});
test('supplier failures override no-match permission; exact job preserves capture and continues other suppliers', async () => {
  const store = new Store(':memory:');
  const parent = captured(store);
  const { job } = startCapturedSourcing(store, parent.id, request(parent));
  const calls: string[] = [];
  const fn: typeof lookup = async (id, input, line, supplier, alt) => {
    calls.push(`${supplier}:${line.partNumber}:${alt}`);
    if (supplier === 'johnstone') throw new SupplierError('AUTH_REQUIRED', 'Reconnect', evidence);
    return { offers: [], evidence };
  };
  try {
    const worker = new Worker(store, undefined, fn, async () => null);
    worker.enqueue(job.id);
    const done = await finished(store, job.id);
    assert.equal(done.state, 'partial');
    assert.equal(calls.length, 6);
    assert.ok(calls.every((c) => c.endsWith(':false')));
    assert.equal(
      done.results[0]?.attempts?.find((a) => a.supplier === 'johnstone')?.status,
      'error',
    );
    assert.equal(
      done.results[0]?.attempts?.find((a) => a.supplier === 'grainger')?.status,
      'no_match',
    );
    assert.deepEqual(done.capturedParts, parent.capturedParts);
    assert.deepEqual(store.get(parent.id), parent);
  } finally {
    store.db.close();
  }
});
test('completed no-match checks pause for permission and captured alternatives remain specification-blocked', async () => {
  const store = new Store(':memory:');
  const parent = captured(store);
  const { job } = startCapturedSourcing(store, parent.id, request(parent));
  const fn: typeof lookup = async () => ({ offers: [], evidence });
  const { app, worker } = createApp(store, undefined, fn);
  try {
    worker.enqueue(job.id);
    const done = await finished(store, job.id);
    assert.equal(done.state, 'needs_permission');
    assert.ok(done.results.every((r) => r.attempts?.every((a) => a.status === 'no_match')));
    const r = await app.inject({
      method: 'POST',
      url: `/api/searches/${job.id}/alternatives`,
      payload: { allow: true },
    });
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().error, 'ALTERNATIVE_SPECIFICATIONS_UNVERIFIED');
    assert.equal(store.get(job.id)?.input.allowAlternatives, false);
    const declined = await app.inject({
      method: 'POST',
      url: `/api/searches/${job.id}/alternatives`,
      payload: { allow: false },
    });
    assert.equal(declined.json().state, 'completed');
  } finally {
    await app.close();
  }
});
test('exact offers are retained without inventing local inventory and retry refreshes rather than duplicates', async () => {
  const store = new Store(':memory:');
  const parent = captured(store);
  const { job } = startCapturedSourcing(store, parent.id, request(parent));
  let failures = true;
  const fn: typeof lookup = async (id, input, line, supplier) => {
    if (failures && supplier === 'johnstone')
      throw new SupplierError('SITE_CHALLENGE', 'Challenge', evidence);
    const raw = fixtureOffer('johnstone', 'board')!;
    raw.partNumber = line.partNumber!;
    raw.stockQuantity = null;
    raw.pickupReady = null;
    return { offers: [assess(raw, line, supplier, evidence, false)], evidence };
  };
  const { app, worker } = createApp(store, undefined, fn);
  try {
    worker.enqueue(job.id);
    assert.equal((await finished(store, job.id)).state, 'partial');
    failures = false;
    const r = await app.inject({
      method: 'POST',
      url: `/api/searches/${job.id}/retry`,
      payload: {},
    });
    assert.equal(r.statusCode, 202);
    const done = await finished(store, job.id);
    assert.equal(done.state, 'completed');
    assert.ok(
      done.results.every(
        (r) =>
          r.offers.length === 3 && r.offers.every((o) => o.stockQuantity === null && !o.eligible),
      ),
    );
    assert.ok(done.results.every((r) => r.attempts?.length === 3));
    assert.equal(done.capturedParts?.lines.length, 2);
  } finally {
    await app.close();
  }
});
test('API source starts once, replays safely, validates scope and leaves capture intact', async () => {
  const store = new Store(':memory:');
  const parent = captured(store);
  let calls = 0;
  const fn: typeof lookup = async () => {
    calls++;
    return { offers: [], evidence };
  };
  const { app } = createApp(store, undefined, fn);
  try {
    const r = await app.inject({
      method: 'POST',
      url: `/api/searches/${parent.id}/source`,
      payload: request(parent),
    });
    assert.equal(r.statusCode, 202);
    const id = r.json().id;
    const again = await app.inject({
      method: 'POST',
      url: `/api/searches/${parent.id}/source`,
      payload: request(parent),
    });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().id, id);
    await finished(store, id);
    assert.equal(calls, 6);
    assert.deepEqual(store.get(parent.id), parent);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/searches/${parent.id}/source`,
          payload: { ...request(parent), suppliers: [] },
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});

import { partsTownCatalog } from '../src/catalog.js';
const catalogText =
  'USD\nYork S1-33101975102 Control Board Kit, Defrost\nIn Stock\nShips from Parts Town\nMy Price:\n$ 198.49\nList Price:\n$ 385.44\nManufacturer:\tYork\nManufacturer #:\tS1-33101975102\nParts Town #:\tYORKS1-33101975102\nUnits:\tEach\nFREQUENTLY BOUGHT TOGETHER\nYork S1-OTHER\n$ 3.00';
test('public catalog parser binds identity and displayed price to the main product, never branch stock', () => {
  const raw = partsTownCatalog(catalogText, 'York', 'S1-33101975102')!;
  assert.ok(raw);
  assert.equal(raw.price, 198.49);
  assert.equal(raw.supplierSku, 'YORKS1-33101975102');
  assert.equal(raw.stockQuantity, null);
  assert.equal(raw.pickupReady, null);
  assert.equal(raw.branch, null);
  assert.equal(raw.condition, null);
  assert.equal(partsTownCatalog(catalogText, 'Carrier', 'S1-33101975102'), null);
  assert.equal(partsTownCatalog(catalogText, 'York', 'S1-OTHER'), null);
});
test('recommendations, previous part numbers and list prices cannot substitute for requested product data', () => {
  assert.equal(
    partsTownCatalog(
      catalogText.replace(
        'Manufacturer #:\tS1-33101975102',
        'Manufacturer #:\tS1-NEW\nPrevious Part #:\tS1-33101975102',
      ),
      'York',
      'S1-33101975102',
    ),
    null,
  );
  const raw = partsTownCatalog(
    catalogText.replace('My Price:\n$ 198.49', ''),
    'York',
    'S1-33101975102',
  )!;
  assert.equal(raw.price, null);
  assert.equal(
    partsTownCatalog('USD\nFREQUENTLY BOUGHT TOGETHER\n' + catalogText, 'York', 'S1-33101975102'),
    null,
  );
});
test('cancellation during sourcing preserves the capture and prevents subsequent supplier work', async () => {
  const store = new Store(':memory:');
  const parent = captured(store);
  const { job } = startCapturedSourcing(store, parent.id, request(parent));
  let calls = 0;
  const fn: typeof lookup = async () => {
    calls++;
    store.update(job.id, { state: 'cancelled' });
    return { offers: [], evidence };
  };
  try {
    new Worker(store, undefined, fn).enqueue(job.id);
    const { exclusive } = await import('../src/browser.js');
    await exclusive(async () => {});
    assert.equal(store.get(job.id)?.state, 'cancelled');
    assert.equal(calls, 1);
    assert.deepEqual(store.get(job.id)?.capturedParts, parent.capturedParts);
  } finally {
    store.db.close();
  }
});

test('legacy punctuation and third-party seller titles remain exact identities without becoming branch inventory', () => {
  const body = catalogText
    .replace(
      'York S1-33101975102 Control Board Kit, Defrost',
      'York DEFROST CONTROL BOARD KIT S1-331-01975-102',
    )
    .replace('Manufacturer #:\tS1-33101975102', 'Manufacturer #:\tS1-331-01975-102')
    .replace('Ships from Parts Town', 'Ships from Third Party Seller');
  const result = partsTownCatalog(body, 'York', 'S1-33101975102');
  assert.ok(result);
  assert.equal(result.partNumber, 'S1-331-01975-102');
  assert.equal(result.shippingText, 'Ships from Third Party Seller');
  assert.equal(result.stockQuantity, null);
});
