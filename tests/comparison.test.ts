import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, inputSchema, type Offer } from '../src/domain.js';
import { fixtureOffer } from '../src/fixture.js';
import { compareOffers } from '../src/comparison-policy.js';
import {
  resolveLocation,
  distanceMiles,
  censusMatch,
  originSchema,
  type GeoResolution,
} from '../src/geocoding.js';
import { startComparison, comparisonView, buildComparison } from '../src/comparison.js';
import {
  parseCommercial,
  parseArrival,
  parseGraingerBranches,
  requestedSpecConflicts,
} from '../src/commercial.js';
import { graingerPanel } from '../src/commercial.js';
import { runInNewContext } from 'node:vm';
import type { Page } from '@browserbasehq/stagehand';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';
import { exclusive } from '../src/browser.js';
const now = Date.parse('2026-10-18T12:00:00Z'),
  stamp = new Date(now).toISOString();
const input = inputSchema.parse({
  mode: 'live',
  origin: {
    address: 'Arlington, VA 22201',
    coordinates: { latitude: 38.886804, longitude: -77.094992 },
  },
  lines: [{ name: 'board', manufacturer: 'York', partNumber: 'S1-33101975102', quantity: 2 }],
});
const origin: GeoResolution = {
  status: 'resolved',
  address: 'Arlington, VA 22201',
  point: input.origin!.coordinates!,
  basis: 'user_coordinates',
  sourceUrl: null,
  observedAt: stamp,
  warnings: [],
};
function offer(supplier: Offer['supplier'] = 'partstown', amount = 10): Offer {
  const e = {
    url:
      supplier === 'partstown'
        ? 'https://www.partstown.com/p/york/yorks1-33101975102'
        : supplier === 'grainger'
          ? 'https://www.grainger.com/product/YORK-42FL31'
          : 'https://www.johnstonesupply.com/product-view?pID=L41-755',
    screenshot: 'proof.png',
    observedAt: stamp,
  };
  const o = assess(
    { ...fixtureOffer('johnstone', 'control board')!, manufacturer: 'York' },
    input.lines[0]!,
    supplier,
    e,
    false,
  );
  o.commercial = {
    status: 'observed',
    manufacturer: 'York',
    partNumber: o.partNumber,
    requestedQuantity: 2,
    evidence: e,
    price: {
      amount,
      currency: 'USD',
      unit: 'each',
      packSize: 1,
      condition: 'new',
      basis: 'public_displayed',
      text: 'Reviewed price',
    },
    shipping: {
      quantity: 10,
      quantityBasis: 'each',
      arrivalDate: '2026-10-20',
      destinationZip: '22201',
      quantityConfirmed: true,
      text: 'Reviewed quote',
    },
    branches: [
      {
        id: '1',
        name: 'Branch one',
        address: 'Reviewed address',
        stockQuantity: 10,
        quantityBasis: 'each',
        pickupReady: true,
        location: { ...origin, point: { latitude: 38.9, longitude: -77.1 } },
        evidence: e,
      },
    ],
    issues: [],
  };
  return o;
}
test('categories use independent evidence, deterministic ties and requested quantity', () => {
  const a = offer(),
    b = offer('grainger', 8);
  b.commercial!.branches[0]!.location!.point = { latitude: 39.1, longitude: -77.5 };
  b.commercial!.shipping.arrivalDate = '2026-10-21';
  const r = compareOffers([a, b], input.lines[0]!, origin, now);
  assert.equal(r.cheapest.winners[0]!.supplier, 'grainger');
  assert.equal(r.cheapest.winners[0]!.materialSubtotal, 16);
  assert.equal(r.closest.winners[0]!.supplier, 'partstown');
  assert.equal(r.fastestShipping.winners[0]!.supplier, 'partstown');
  b.commercial!.price.amount = 10;
  assert.equal(compareOffers([b, a], input.lines[0]!, origin, now).cheapest.winners.length, 2);
});
test('pack rounding and cents cost whole packs; short stock is a caveat, not a hidden winner', () => {
  const o = offer();
  o.commercial!.price = { ...o.commercial!.price, unit: 'pack', packSize: 3, amount: 1.01 };
  o.commercial!.requestedQuantity = 4;
  o.commercial!.shipping.quantity = 5;
  o.commercial!.branches[0]!.stockQuantity = 5;
  const short = compareOffers([o], { ...input.lines[0]!, quantity: 4 }, origin, now);
  assert.equal(short.cheapest.winners[0]!.materialSubtotal, 2.02);
  assert.ok(
    short.cheapest.winners[0]!.caveats.includes('Stock for the requested quantity was not shown.'),
  );
  assert.equal(short.closest.winners.length, 0, '5 in stock cannot cover 2 packs of 3');
  assert.equal(short.stockedBranches.length, 0);
  o.commercial!.shipping.quantity = 6;
  const enough = compareOffers([o], { ...input.lines[0]!, quantity: 4 }, origin, now);
  assert.equal(enough.cheapest.winners[0]!.materialSubtotal, 2.02);
  assert.deepEqual(enough.cheapest.winners[0]!.caveats, []);
  o.commercial!.price.packSize = null;
  assert.equal(
    compareOffers([o], { ...input.lines[0]!, quantity: 4 }, origin, now).cheapest.winners.length,
    0,
    'a pack with no stated size cannot be costed',
  );
});
test('unstated condition, unit, currency and pickup readiness rank with caveats; refurbished does not', () => {
  const o = offer();
  o.commercial!.price.condition = null;
  o.commercial!.price.currency = null;
  o.commercial!.branches[0]!.pickupReady = false;
  o.commercial!.shipping.arrivalDate = null;
  const r = compareOffers([o], input.lines[0]!, origin, now);
  assert.deepEqual(r.cheapest.winners[0]!.caveats, [
    'Currency not stated on the page; US supplier pricing assumed.',
    'Condition not stated on the page.',
  ]);
  assert.deepEqual(r.closest.winners[0]!.caveats, [
    'Supplier lists a later pickup time; call to confirm.',
  ]);
  assert.equal(r.fastestShipping.winners.length, 0, 'fastest keeps its strict rule');
  o.commercial!.price.unit = null;
  o.commercial!.price.packSize = null;
  o.commercial!.branches[0]!.pickupReady = null;
  o.commercial!.branches[0]!.quantityBasis = 'unknown';
  const loose = compareOffers([o], input.lines[0]!, origin, now);
  assert.equal(loose.cheapest.winners[0]!.materialSubtotal, 20);
  assert.ok(
    loose.cheapest.winners[0]!.caveats.includes(
      'Purchase unit not stated; price read as one unit.',
    ),
  );
  assert.deepEqual(loose.stockedBranches[0]!.caveats, [
    'Stock count unit not stated.',
    'Pickup readiness not stated; call the store to confirm.',
  ]);
  o.commercial!.price.condition = 'refurbished';
  assert.equal(compareOffers([o], input.lines[0]!, origin, now).cheapest.winners.length, 0);
});
test('every store showing enough stock is listed for a call, located or not, nearest first', () => {
  const o = offer('johnstone');
  const e = o.commercial!.evidence;
  o.commercial!.branches = [
    {
      id: '406',
      name: 'Arbutus',
      address: '',
      stockQuantity: 2,
      quantityBasis: 'unknown',
      pickupReady: null,
      evidence: e,
    },
    {
      id: '369',
      name: 'Rosedale',
      address: '',
      stockQuantity: 5,
      quantityBasis: 'unknown',
      pickupReady: null,
      evidence: e,
    },
    {
      id: '461',
      name: 'Alexandria',
      address: '6584 Fleet Drive, Alexandria, VA 22310',
      stockQuantity: 3,
      quantityBasis: 'unknown',
      pickupReady: null,
      location: { ...origin, point: { latitude: 38.77, longitude: -77.18 } },
      evidence: e,
    },
    {
      id: '704',
      name: 'Pittston',
      address: '',
      stockQuantity: 1,
      quantityBasis: 'unknown',
      pickupReady: null,
      evidence: e,
    },
  ];
  const r = compareOffers([o], input.lines[0]!, origin, now);
  assert.deepEqual(
    r.stockedBranches.map((b) => b.branchId),
    ['461', '369', '406'],
  );
  assert.ok(r.stockedBranches[2]!.caveats.includes('Store address not captured.'));
  assert.equal(r.stockedBranches[2]!.address, null);
  assert.deepEqual(
    r.closest.winners.map((w) => w.branchId),
    ['461'],
  );
  o.commercial!.branches[1]!.address = '9100 Yellow Brick Road, Rosedale, MD 21237';
  assert.ok(
    compareOffers([o], input.lines[0]!, origin, now)
      .stockedBranches.find((b) => b.branchId === '369')!
      .caveats.includes('Distance unavailable; the address could not be located.'),
  );
  o.commercial!.branches[0]!.evidence = { ...e, observedAt: '2026-10-17T12:00:00Z' };
  assert.ok(
    !compareOffers([o], input.lines[0]!, origin, now).stockedBranches.some(
      (b) => b.branchId === '406',
    ),
    'stale stock is not listed',
  );
});
test('stale, future-dated, wrong identity, wrong quantity and synthetic evidence fail closed', () => {
  for (const mutate of [
    (o: Offer) => (o.synthetic = true),
    (o: Offer) => (o.match = 'alternative'),
    (o: Offer) => (o.commercial!.partNumber += 'A'),
    (o: Offer) => (o.commercial!.manufacturer = 'Carrier'),
    (o: Offer) => (o.commercial!.requestedQuantity = 3),
    (o: Offer) => (o.commercial!.evidence.observedAt = '2026-10-17T12:00:00Z'),
    (o: Offer) => (o.commercial!.evidence.observedAt = '2026-10-19T12:00:00Z'),
    (o: Offer) => (o.commercial!.evidence.url = 'https://other.example/'),
  ]) {
    const o = offer();
    mutate(o);
    const r = compareOffers([o], input.lines[0]!, origin, now);
    assert.equal(
      r.cheapest.winners.length + r.closest.winners.length + r.fastestShipping.winners.length,
      0,
    );
  }
  const r = compareOffers([offer()], { ...input.lines[0]!, manufacturer: 'Carrier' }, origin, now);
  assert.equal(
    r.cheapest.winners.length + r.closest.winners.length + r.fastestShipping.winners.length,
    0,
  );
});
test('shipping must match destination, quote quantity and future calendar date', () => {
  for (const patch of [
    { destinationZip: '22301' },
    { quantityConfirmed: false },
    { arrivalDate: '2026-10-17' },
    { arrivalDate: null },
  ]) {
    const o = offer();
    Object.assign(o.commercial!.shipping, patch);
    assert.equal(
      compareOffers([o], input.lines[0]!, origin, now).fastestShipping.winners.length,
      0,
    );
  }
});
test('changed quantity, unreadable currency and recommendation prices remain distinct from a bound Grainger quote', () => {
  const o = offer('grainger');
  const body =
    'YORK Defrost Control Board Kit\nItem 42FL31 Mfr. Model S1-331-01975-102\nBrandYORKCountry of OriginUSA\nCustomers Also Purchased\nWeb Price\n$1.00/ each';
  const panel = 'Web Price\n$336.85/ each\nExpected to arrive Tue. Oct 20.\nShip to 22201';
  const r = parseCommercial(o, 1, body, panel, '1', o.commercial!.evidence);
  assert.equal(r.price.amount, 336.85);
  assert.equal(r.price.currency, null);
  assert.equal(r.price.condition, null);
  assert.equal(r.shipping.quantityConfirmed, true);
  assert.equal(r.shipping.arrivalDate, '2026-10-20');
  assert.equal(
    parseCommercial(o, 2, body, panel, '2', o.commercial!.evidence).shipping.quantityConfirmed,
    false,
  );
});
test('an unfamiliar Grainger hierarchy cannot inherit a neighboring product price or ETA', async () => {
  const neighbor = {
    innerText: 'Web Price\n$1.00/ each\nShipping/Pickup\nExpected to arrive Tue. Oct 20.',
    parentElement: null,
    querySelectorAll: () => [1, 2],
  };
  const primary = {
    innerText: 'Web Price\n$336.85/ each',
    parentElement: neighbor,
    querySelectorAll: () => [1],
  };
  const input = { value: '1', parentElement: primary };
  const document = {
    getElementById: (id: string) => (id === 'input-qty-42FL31-1' ? input : null),
    body: { innerText: 'Visible product' },
  };
  const page = {
    evaluate: async (fn: Function, arg: unknown) =>
      runInNewContext('(' + fn.toString() + ')(' + JSON.stringify(arg) + ')', { document }),
  } as unknown as Page;
  const r = await graingerPanel(page, '42FL31');
  assert.equal(r.text, 'Web Price\n$336.85/ each');
  assert.ok(!r.text.includes('Expected to arrive'));
  assert.equal((await graingerPanel(page, 'WRONG')).text, '');
});
test('numeric inventory corruption never becomes sufficient branch or shipping stock', () => {
  for (const quantity of [Infinity, NaN, -1, 1.5]) {
    const o = offer();
    o.commercial!.branches[0]!.stockQuantity = quantity;
    o.commercial!.shipping.quantity = quantity;
    const r = compareOffers([o], input.lines[0]!, origin, now);
    assert.ok(
      r.cheapest.winners[0]!.caveats.includes('Stock for the requested quantity was not shown.'),
    );
    assert.equal(r.closest.winners.length, 0);
    assert.equal(r.stockedBranches.length, 0);
  }
});
test('large subtotals cannot overflow precise integer cents', () => {
  const o = offer();
  o.commercial!.price.amount = Number.MAX_SAFE_INTEGER / 100;
  o.commercial!.shipping.quantity = 10000;
  o.commercial!.branches[0]!.stockQuantity = 10000;
  o.commercial!.requestedQuantity = 10000;
  assert.equal(
    compareOffers([o], { ...input.lines[0]!, quantity: 10000 }, origin, now).cheapest.winners
      .length,
    0,
  );
});
test('Step 6 never starts generic alternative searches, even when the input allows them', async () => {
  const store = new Store(':memory:');
  let alternativeCalls = 0;
  const { worker, app } = createApp(
    store,
    undefined,
    async (_id, _input, _line, _supplier, alternative) => {
      if (alternative) alternativeCalls++;
      return { offers: [], evidence: offer().commercial!.evidence };
    },
  );
  try {
    const j = store.create({
      ...input,
      stopAfter: 'comparison',
      suppliers: ['partstown'],
      allowAlternatives: true,
    }).job;
    worker.enqueue(j.id);
    await exclusive(async () => {});
    assert.equal(alternativeCalls, 0);
    assert.equal(store.get(j.id)!.state, 'needs_input');
  } finally {
    await app.close();
  }
});
test('missing origin cannot produce closest; ZIP distances are explicitly approximate', () => {
  assert.equal(
    compareOffers(
      [offer()],
      input.lines[0]!,
      { ...origin, status: 'needs_address', point: null },
      now,
    ).closest.winners.length,
    0,
  );
  assert.equal(
    compareOffers([offer()], input.lines[0]!, { ...origin, basis: 'census_zcta_reference' }, now)
      .closest.basis,
    'approximate_straight_line_from_zip_area',
  );
  assert.equal(distanceMiles(origin.point!, origin.point!), 0);
  assert.ok(distanceMiles({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }) > 12000);
  assert.ok(
    Math.abs(
      distanceMiles({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 69.0934,
    ) < 0.001,
  );
  assert.throws(() => distanceMiles({ latitude: 91, longitude: 0 }, origin.point!));
});
test('origin uses real bundled Census area data and never reuses it for another ZIP or city', async () => {
  const r = await resolveLocation({ address: 'Arlington, VA 22201' });
  assert.equal(r.basis, 'census_zcta_reference');
  assert.deepEqual(r.point, { latitude: 38.886804, longitude: -77.094992 });
  for (const address of ['22301', 'Boston, MA 22201', 'Arlington, VA'])
    assert.equal((await resolveLocation({ address })).status, 'needs_address');
  assert.throws(() =>
    originSchema.parse({ address: 'test', coordinates: { latitude: 100, longitude: 0 } }),
  );
  assert.throws(() =>
    originSchema.parse({ address: 'test', point: { latitude: 0, longitude: 0 } }),
  );
});
test('Census requires one matching street and ZIP, with interpolation caveat and explicit outage', async () => {
  const address = '6584 Fleet Drive, Alexandria, VA 22310';
  const match = {
    matchedAddress: '6584 FLEET DR, ALEXANDRIA, VA, 22310',
    coordinates: { x: -77.15, y: 38.77 },
    addressComponents: { zip: '22310' },
  };
  const data = (matches: unknown[]) => ({ result: { addressMatches: matches } });
  assert.equal(
    censusMatch(address, data([match]), 'https://geocoding.geo.census.gov', stamp).status,
    'resolved',
  );
  for (const value of [
    data([]),
    data([match, match]),
    data([{ ...match, matchedAddress: '6584 OTHER ST, ALEXANDRIA, VA, 22310' }]),
    data([{ ...match, addressComponents: { zip: '22301' } }]),
    {},
  ])
    assert.equal(
      censusMatch(address, value, 'https://geocoding.geo.census.gov', stamp).status,
      'unavailable',
    );
  assert.equal(
    (
      await resolveLocation({ address }, async () => {
        throw new Error('offline');
      })
    ).status,
    'unavailable',
  );
});
test('delivery parsing rejects dispatch text, impossible days and mismatched weekdays', () => {
  assert.equal(parseArrival('Expected to arrive Tue. Oct 20.', stamp), '2026-10-20');
  for (const text of [
    'Ships today',
    'In Stock',
    'Available for pickup Tue. Oct 20.',
    'Expected to arrive Mon. Oct 20.',
    'Expected to arrive Feb. 30.',
    'Expected to arrive Jan. 1, 2028.',
  ])
    assert.equal(parseArrival(text, stamp), null);
});
test('commercial parser binds identity, primary price and shipping stock instead of recommendations', () => {
  const o = offer();
  const body =
    'USD\nYork S1-33101975102 Defrost Control\nShip It!\nIn Stock\nShips from Parts Town\nMy Price: $198.49\nQuantity Available: 9\nManufacturer: York\nManufacturer #: S1-33101975102\nParts Town #: YORKS1\nUnits: Each\nFREQUENTLY BOUGHT TOGETHER\nMy Price: $1.00\nQuantity Available: 999';
  const r = parseCommercial(o, 2, body, '', '', o.commercial!.evidence);
  assert.equal(r.price.amount, 198.49);
  assert.equal(r.price.condition, null);
  assert.equal(r.shipping.quantity, 9);
  assert.equal(r.branches.length, 0);
  assert.equal(
    parseCommercial(
      o,
      2,
      body.replace('Manufacturer #: S1-33101975102', 'Manufacturer #: OTHER'),
      '',
      '',
      o.commercial!.evidence,
    ).status,
    'unavailable',
  );
});
test('exact-number results expose visible rating conflicts and comparison excludes them', () => {
  const conflicts = requestedSpecConflicts(
    'Class T fuse 150A 600V',
    'Trane FUS00907 Fuse, 160A, 600VAC, Class T',
  );
  assert.deepEqual(conflicts, ['amperage 150A requested, 160A listed']);
  assert.deepEqual(
    requestedSpecConflicts('Class T fuse 150A 600V', 'Fuse, 150A, 600VAC, Class T'),
    [],
  );
  assert.deepEqual(requestedSpecConflicts('Fuse', 'Fuse, 160A, 600VAC, Class T'), []);
  const o = offer();
  o.description = 'Trane FUS00907 Fuse, 160A, 600VAC, Class T';
  const body =
    'USD\nYork S1-33101975102 Defrost Control\nShip It!\nIn Stock\nShips from Parts Town\nMy Price: $198.49\nQuantity Available: 9\nManufacturer: York\nManufacturer #: S1-33101975102\nParts Town #: YORKS1\nUnits: Each';
  const commercial = parseCommercial(
    o,
    2,
    body,
    '',
    '',
    o.commercial!.evidence,
    'Class T fuse 150A 600V',
  );
  assert.ok(
    commercial.issues.some((issue) => issue.includes('amperage 150A requested, 160A listed')),
  );
  o.commercial = commercial;
  const result = compareOffers([o], input.lines[0]!, origin, now);
  assert.equal(
    result.cheapest.winners.length +
      result.closest.winners.length +
      result.fastestShipping.winners.length,
    0,
  );
  assert.ok(
    result.excluded.some((item) =>
      item.reasons.some((reason) => reason.includes('150A requested, 160A listed')),
    ),
  );
});
test('Grainger future pickup branches retain addresses without claiming zero stock or ready-now', () => {
  const text =
    'Change Branch\nCurrently Selected Branch\nFalls Church Branch #903\n2947 Gallows Rd.\nFalls Church, VA 22042\nCurbside Pickup Available\nAvailable for pickup Tue. Oct 20 estimated after 9:00 AM.\n9.68 Miles\nBranch Details\nCancel\nApply';
  const b = parseGraingerBranches(text, offer().commercial!.evidence);
  assert.equal(b.length, 1);
  assert.equal(b[0]!.stockQuantity, null);
  assert.equal(b[0]!.pickupReady, false);
  assert.equal(b[0]!.address, '2947 Gallows Rd., Falls Church, VA 22042');
});
test('comparison creation is immutable, replayable, refreshable and rejects injected facts', () => {
  const store = new Store(':memory:');
  try {
    const p = store.create(input).job;
    store.update(p.id, {
      state: 'completed',
      results: [{ name: 'board', quantity: 2, offers: [offer()], errors: [] }],
    });
    const parent = store.get(p.id)!;
    const body = { expectedUpdatedAt: parent.updatedAt };
    const a = startComparison(store, p.id, body),
      b = startComparison(store, p.id, body);
    assert.equal(a.job.id, b.job.id);
    assert.equal(b.reused, true);
    assert.deepEqual(store.get(p.id), parent);
    assert.equal(a.job.input.allowAlternatives, false);
    assert.equal(a.job.alternativeReview, undefined);
    assert.notEqual(
      startComparison(store, p.id, { ...body, requestId: 'e721f916-7431-4a1a-8137-c52a1a3cc93d' })
        .job.id,
      a.job.id,
    );
    assert.throws(() => startComparison(store, p.id, { ...body, price: 1 }));
    assert.throws(() =>
      startComparison(store, p.id, { expectedUpdatedAt: '2000-01-01T00:00:00.000Z' }),
    );
  } finally {
    store.db.close();
  }
});
test('expired comparison views clear winners without changing durable snapshots', () => {
  const store = new Store(':memory:');
  try {
    const job = store.create(input).job;
    job.comparison = {
      status: 'ready',
      expiresAt: stamp,
      origin,
      lines: [
        {
          name: 'board',
          quantity: 2,
          rankings: compareOffers([offer()], input.lines[0]!, origin, now),
          supplierCoverage: [],
        },
      ],
      warnings: [],
    };
    job.state = 'completed';
    const before = structuredClone(job);
    const view = comparisonView(job, now + 1);
    assert.equal(view.state, 'needs_input');
    assert.equal(view.comparison!.lines[0]!.rankings.cheapest.winners.length, 0);
    assert.equal(view.comparison!.lines[0]!.rankings.cheapest.options.length, 0);
    assert.deepEqual(job, before);
  } finally {
    store.db.close();
  }
});
test('branch cache never persists inventory and respects cancellation before location work', async () => {
  const store = new Store(':memory:');
  try {
    store.saveBranch({
      ...{
        supplier: 'partstown',
        id: '1',
        name: 'One',
        address: 'First street',
        sourceUrl: 'https://www.partstown.com',
        observedAt: stamp,
      },
      ...{ stockQuantity: 999, pickupReady: true },
    });
    assert.equal('stockQuantity' in store.getBranch('partstown', '1')!, false);
    const job = store.create(input).job;
    job.results = [{ name: 'board', quantity: 2, offers: [offer()], errors: [] }];
    await buildComparison(job, store, () => false);
    assert.equal(store.getBranch('partstown', '1')!.address, 'First street');
  } finally {
    store.db.close();
  }
});
test('API comparison refresh preserves the source and serializes real worker boundaries with a mock supplier', async () => {
  const store = new Store(':memory:');
  const currentOffer = offer();
  currentOffer.commercial!.evidence.observedAt = new Date().toISOString();
  currentOffer.commercial!.branches = [];
  currentOffer.commercial!.shipping.arrivalDate = new Date(Date.now() + 2 * 86400000)
    .toISOString()
    .slice(0, 10);
  const { app } = createApp(store, undefined, async () => ({
    offers: [structuredClone(currentOffer)],
    evidence: currentOffer.commercial!.evidence,
  }));
  try {
    const parent = store.create({ ...input, suppliers: ['partstown'] }).job;
    store.update(parent.id, {
      state: 'completed',
      results: [{ name: 'board', quantity: 2, offers: [], errors: [] }],
    });
    const before = store.get(parent.id)!;
    const payload = { expectedUpdatedAt: before.updatedAt };
    const requests = await Promise.all(
      Array.from({ length: 20 }, () =>
        app.inject({ method: 'POST', url: `/api/searches/${parent.id}/compare`, payload }),
      ),
    );
    assert.equal(new Set(requests.map((r) => r.json().id)).size, 1);
    await exclusive(async () => {});
    const result = store.get(requests[0]!.json().id)!;
    assert.equal(result.state, 'needs_input');
    assert.ok(result.comparison);
    assert.equal(result.comparison!.lines[0]!.rankings.cheapest.winners.length, 1);
    assert.deepEqual(store.get(parent.id), before);
    const bad = await app.inject({
      method: 'POST',
      url: `/api/searches/${parent.id}/compare`,
      payload: { ...payload, offers: [currentOffer] },
    });
    assert.equal(bad.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('an open console clears expired comparison winners without mutating saved evidence', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile('public/index.html', 'utf8');
  const source = html.slice(
    html.indexOf('function comparisonForDisplay('),
    html.indexOf('async function show(job)'),
  );
  assert.ok(source.startsWith('function comparisonForDisplay('));
  const display = runInNewContext(source + ';comparisonForDisplay', { structuredClone }) as (
    job: unknown,
    now: number,
  ) => any;
  const job = {
    state: 'completed',
    message: 'Comparison available',
    comparison: {
      status: 'ready',
      expiresAt: new Date(now + 1000).toISOString(),
      lines: [
        {
          rankings: {
            cheapest: {
              winners: [{ supplier: 'partstown' }],
              options: [{ supplier: 'partstown' }],
            },
            closest: { winners: [{ supplier: 'johnstone' }] },
            fastestShipping: { winners: [{ supplier: 'grainger' }] },
            stockedBranches: [{ supplier: 'johnstone', branchId: '406' }],
          },
        },
      ],
    },
  };
  assert.equal(display(job, now), job);
  for (const stamp of [now + 1000, now + 60000]) {
    const expired = display(job, stamp);
    assert.equal(expired.state, 'needs_input');
    assert.match(expired.message, /expired/);
    const rankings = expired.comparison.lines[0].rankings;
    for (const key of ['cheapest', 'closest', 'fastestShipping'])
      assert.equal(rankings[key].winners.length, 0);
    assert.equal(rankings.stockedBranches.length, 0);
    assert.equal(rankings.cheapest.options.length, 0);
  }
  assert.equal(job.comparison.lines[0]!.rankings.fastestShipping.winners.length, 1);
  assert.equal(display({ ...job, state: 'running' }, now + 60000).state, 'running');
});

test('the console schedules expiry even after a job finishes and ignores a superseded job', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile('public/index.html', 'utf8');
  const source = html.slice(
    html.indexOf('function scheduleDisplayRefresh(job)'),
    html.indexOf('async function show(job)'),
  );
  let callback: (() => void) | undefined,
    delay = 0,
    shown: unknown,
    cleared = 0;
  const job = {
    id: 'current',
    state: 'needs_input',
    comparison: { expiresAt: new Date(now + 2000).toISOString() },
  };
  const context = {
    timer: 123,
    activeId: 'current',
    Date: { now: () => now, parse: Date.parse },
    Math,
    clearTimeout: () => cleared++,
    setTimeout: (fn: () => void, ms: number) => {
      callback = fn;
      delay = ms;
      return 456;
    },
    show: (j: unknown) => {
      shown = j;
    },
  };
  runInNewContext(source + ';scheduleDisplayRefresh(job)', { ...context, job });
  assert.equal(cleared, 1);
  assert.equal(delay, 2000);
  callback!();
  assert.equal(shown, job);
  shown = undefined;
  runInNewContext(source + ';scheduleDisplayRefresh(job)', { ...context, activeId: 'newer', job });
  callback!();
  assert.equal(shown, undefined);
  callback = undefined;
  runInNewContext(source + ';scheduleDisplayRefresh(job)', {
    ...context,
    job: { ...job, comparison: { expiresAt: new Date(now).toISOString() } },
  });
  assert.equal(callback, undefined);
});

test('agent sourcing builds the comparison from its own results with one supplier pass', async () => {
  const { config } = await import('../src/config.js');
  const engine = config.supplierEngine;
  config.supplierEngine = 'agent';
  const store = new Store(':memory:');
  const current = offer();
  current.commercial!.evidence.observedAt = new Date().toISOString();
  for (const b of current.commercial!.branches)
    b.evidence.observedAt = current.commercial!.evidence.observedAt;
  let calls = 0;
  const { app } = createApp(store, undefined, async () => {
    calls++;
    return { offers: [structuredClone(current)], evidence: current.commercial!.evidence };
  });
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/searches',
      payload: { ...input, suppliers: ['partstown'] },
    });
    await exclusive(async () => {});
    for (
      let i = 0;
      i < 50 && ['queued', 'running'].includes(store.get(created.json().id)!.state);
      i++
    )
      await new Promise((r) => setTimeout(r, 20));
    const job = store.get(created.json().id)!;
    assert.equal(calls, 1, 'no second supplier search');
    assert.ok(job.comparison, 'comparison attached to the sourcing job');
    assert.equal(job.comparison!.lines[0]!.rankings.cheapest.options.length, 1);
    assert.equal(job.comparison!.lines[0]!.rankings.cheapest.options[0]!.materialSubtotal, 20);
  } finally {
    config.supplierEngine = engine;
    await app.close();
  }
});
