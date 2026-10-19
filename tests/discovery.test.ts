import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unwrapSearchLink } from '../src/discovery.js';

test('Bing redirect links decode to their real destination; others pass through', () => {
  const target =
    'https://www.mitsubishitechinfo.ca/sites/default/files/Parts_MXZ-(2)(3)(4)(5)D-(20)(24)(30)(36)(42)NL(HZ)_OBB962A_EN_0.pdf';
  const encoded = Buffer.from(target)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const bing = `https://www.bing.com/ck/a?!&&p=abc&ptn=3&ver=2&hsh=4&u=a1${encoded}&ntb=1`;
  assert.equal(unwrapSearchLink(bing), target);
  assert.equal(unwrapSearchLink('https://example.com/a.pdf'), 'https://example.com/a.pdf');
  const http = Buffer.from('http://insecure.example/a.pdf').toString('base64');
  assert.equal(
    unwrapSearchLink(`https://www.bing.com/ck/a?u=a1${http}`).startsWith('https://www.bing.com/'),
    true,
  );
  assert.equal(
    unwrapSearchLink('https://www.bing.com/ck/a?u=a1!!!'),
    'https://www.bing.com/ck/a?u=a1!!!',
  );
});

test('the pinned DNS answer serves both lookup forms with only the validated address', async () => {
  const { pinnedLookup } = await import('../src/discovery.js');
  const lookup = pinnedLookup({ address: '203.0.113.7', family: 4 });
  const single = await new Promise<unknown[]>((r) => lookup('h', {}, (...a: unknown[]) => r(a)));
  assert.deepEqual(single, [null, '203.0.113.7', 4]);
  const all = await new Promise<unknown[]>((r) =>
    lookup('h', { all: true }, (...a: unknown[]) => r(a)),
  );
  assert.deepEqual(all, [null, [{ address: '203.0.113.7', family: 4 }]]);
});

test('a guide brand matches the requested brand only as its leading whole words', async () => {
  const { sameBrand } = await import('../src/general-guides.js');
  assert.equal(sameBrand('Mitsubishi Electric', 'Mitsubishi'), true);
  assert.equal(sameBrand('MITSUBISHI ELECTRIC CORPORATION', 'mitsubishi electric'), true);
  assert.equal(sameBrand('Trane', 'Trane'), true);
  assert.equal(sameBrand('Mitsubishi', 'Mitsubishi Electric'), false);
  assert.equal(sameBrand('Carrier', 'Trane'), false);
  assert.equal(sameBrand('Goodman', 'Good'), false);
  assert.equal(sameBrand('American Standard', 'Trane'), false);
});
