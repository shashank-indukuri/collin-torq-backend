import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  retainRecoveryPage,
  safeProductUrl,
  validateProductRecovery,
  findExactProductLink,
} from '../src/recovery-policy.js';
import { loginSchema } from '../src/auth.js';
const good = 'https://www.johnstonesupply.com/product-view?pID=L41-755';
test('empty fragments cannot disguise same-page controls as product candidates', () => {
  assert.equal(safeProductUrl(good + '#', 'www.johnstonesupply.com'), false);
  assert.equal(
    safeProductUrl('https://www.partstown.com/p/york/yorks1-33101975102#', 'www.partstown.com'),
    false,
  );
});
test('live model recovery permits only bounded supplier product links', () => {
  const goal = {
    kind: 'product' as const,
    partNumber: 'S1-33101975102',
    candidates: [{ url: good, text: 'Defrost Control' }],
  };
  assert.doesNotThrow(() =>
    validateProductRecovery(
      'https://www.johnstonesupply.com/search',
      ['www.johnstonesupply.com'],
      goal,
    ),
  );
  for (const bad of [
    'https://www.johnstonesupply.com/product-view?redirect=https://evil.example',
    'https://www.johnstonesupply.com/cart',
    'https://www.johnstonesupply.com/checkout',
    'https://evil.example/product/test',
    'http://www.johnstonesupply.com/product-view?pID=X',
    'https://u:p@www.johnstonesupply.com/product-view?pID=X',
    'https://www.johnstonesupply.com/product-view?order=1',
  ]) {
    assert.equal(safeProductUrl(bad, 'www.johnstonesupply.com'), false);
    assert.throws(() =>
      validateProductRecovery(
        'https://www.johnstonesupply.com/search',
        ['www.johnstonesupply.com'],
        { ...goal, candidates: [{ url: bad, text: 'Injected instructions' }] },
      ),
    );
  }
  assert.throws(() =>
    validateProductRecovery(
      'https://www.johnstonesupply.com/search',
      ['www.johnstonesupply.com', 'evil.example'],
      goal,
    ),
  );
  assert.throws(() =>
    validateProductRecovery('https://www.johnstonesupply.com/search', ['www.johnstonesupply.com'], {
      ...goal,
      candidates: [],
    }),
  );
});
test('login contract requires credentials and validates ZIP/store without accepting arbitrary destinations', () => {
  assert.equal(
    loginSchema.parse({ username: 'example', password: 'not-a-real-secret' }).zip,
    '22201',
  );
  assert.throws(() =>
    loginSchema.parse({
      username: 'example',
      password: 'not-a-real-secret',
      url: 'https://evil.example',
    }),
  );
  assert.throws(() =>
    loginSchema.parse({ username: 'example', password: 'not-a-real-secret', zip: 'bad' }),
  );
  assert.throws(() =>
    loginSchema.parse({ username: 'example', password: 'not-a-real-secret', storeNumber: 'bad' }),
  );
});

import { createApp } from '../src/server.js';
import { Store } from '../src/store.js';
import { inputSchema } from '../src/domain.js';
test('connection API rejects unsupported providers, invalid inputs and busy sessions without echoing secrets', async () => {
  const { app, store } = createApp(new Store(':memory:'));
  const password = 'test-only-value-not-a-real-credential';
  const username = 'test-user';
  try {
    for (const url of ['/api/connections/grainger/login', '/api/connections/unknown/login']) {
      const r = await app.inject({ method: 'POST', url, payload: { username, password } });
      assert.equal(r.statusCode, 400);
      assert.ok(!r.body.includes(password));
    }
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/connections/partstown/login',
      payload: { username, password, zip: 'invalid' },
    });
    assert.equal(invalid.statusCode, 400);
    assert.ok(!invalid.body.includes(password));
    store.create(inputSchema.parse({ lines: [{ name: 'board' }] }));
    const busy = await app.inject({
      method: 'POST',
      url: '/api/connections/johnstone/login',
      payload: { username, password },
    });
    assert.equal(busy.statusCode, 409);
    assert.ok(!busy.body.includes(password));
    assert.ok(!JSON.stringify(store.list()).includes(password));
  } finally {
    await app.close();
  }
});

test('exact navigation cannot choose a manufacturer category or leave an existing product for another link', () => {
  const part = 'S1-33101975102';
  const search = 'https://www.partstown.com/search?q=' + part;
  const links = [
    { href: 'https://www.partstown.com/b/york', text: 'York', context: 'Manufacturer #: ' + part },
    {
      href: 'https://www.partstown.com/p/york/yorks1-33101975102',
      text: 'Control Board',
      context: 'Manufacturer #: ' + part,
    },
  ];
  assert.equal(findExactProductLink(links, search, part)?.href, links[1]!.href);
  assert.equal(findExactProductLink(links, links[1]!.href, part), undefined);
  assert.equal(findExactProductLink([links[0]!], search, part), undefined);
});

test('only reviewed legacy York product paths are allowed, never generic two-segment categories', () => {
  assert.equal(
    safeProductUrl('https://www.partstown.com/york/yorks1-cap4405040dr', 'www.partstown.com'),
    true,
  );
  for (const path of ['/b/york', '/york/controls', '/york/account', '/other/anything'])
    assert.equal(safeProductUrl('https://www.partstown.com' + path, 'www.partstown.com'), false);
});

test('table-row product context can locate an exact identifier without inheriting another row', () => {
  const url =
    'https://www.grainger.com/category/motors/motor-capacitors/motor-run-capacitors?searchQuery=S1-CAP4405040DR';
  const links = [
    {
      href: 'https://www.grainger.com/product/YORK-Single-Capacitor-111',
      text: '111',
      context: '5 MFD S1-CAP44050R YORK',
    },
    {
      href: 'https://www.grainger.com/product/YORK-Dual-Capacitor-222',
      text: '222',
      context: '40/5 MFD S1-CAP4405040DR YORK',
    },
  ];
  assert.equal(findExactProductLink(links, url, 'S1-CAP4405040DR')?.href, links[1]!.href);
  assert.equal(findExactProductLink([links[0]!], url, 'S1-CAP4405040DR'), undefined);
});

test('informational product-collections pages are not product recovery destinations', () => {
  for (const host of ['www.johnstonesupply.com', 'www.grainger.com', 'www.partstown.com'])
    assert.equal(safeProductUrl(`https://${host}/content/mc/product-collections`, host), false);
  assert.equal(
    safeProductUrl('https://www.grainger.com/product/YORK-Capacitor-123', 'www.grainger.com'),
    true,
  );
});

test('product selection cannot confuse a longer identifier with an exact one', () => {
  const base = 'https://www.partstown.com/search?q=S1-33101975102';
  const wrong = { href: 'https://www.partstown.com/p/york/wrong', text: 'S1-33101975102A' };
  const right = {
    href: 'https://www.partstown.com/p/york/right',
    text: 'Manufacturer #: S1-33101975102',
  };
  assert.equal(findExactProductLink([wrong, right], base, 'S1-33101975102')?.href, right.href);
  assert.equal(findExactProductLink([wrong], base, 'S1-33101975102'), undefined);
});
test('product destinations reject action subpaths, fragments and unexpected ports', () => {
  for (const url of [
    'https://www.partstown.com/p/york/part/checkout',
    'https://www.partstown.com/p/york/part/anything',
    'https://www.grainger.com:8443/product/YORK-123',
    'https://www.grainger.com/product/YORK-123#cart',
  ])
    assert.equal(safeProductUrl(url, new URL(url).hostname), false);
});
test('recovery keeps only its original tab before the single-domain Browser Use handoff', async () => {
  const closed: string[] = [];
  const pages = ['auth', 'target', 'reference', 'other-supplier'].map((pageId) => ({
    pageId,
    close: async () => {
      closed.push(pageId);
    },
  }));
  await retainRecoveryPage(pages, 'target');
  assert.deepEqual(closed, ['auth', 'reference', 'other-supplier']);
  closed.length = 0;
  await assert.rejects(retainRecoveryPage(pages, 'missing'), /original supplier tab/);
  assert.deepEqual(closed, []);
});
