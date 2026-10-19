import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJohnstoneDirectory,
  directoryAddress,
  johnstoneDirectory,
} from '../src/johnstone-stores.js';

// Excerpt of the rendered store list captured 2026-10-19 (both layouts).
const rendered = `Store Site

Arbutus - #406

1660 Sulphur Spring Rd.
Arbutus, MD 21227
Hours

Monday - Friday:
7:00 am - 4:30 pm
Get Directions
(410) 568-7390
Email Store

Rosedale - #369

9100 Yellow Brick Road, Suite A-C1
Rosedale,
MD  21237
Hours
Get Directions
(410) 391 5495

Broken - #999
No address here
Hours
`;

test('the store list parser reads both rendered layouts and skips rows without a ZIP', () => {
  assert.deepEqual(parseJohnstoneDirectory(rendered), [
    {
      id: '406',
      name: 'Arbutus',
      address: '1660 Sulphur Spring Rd., Arbutus, MD 21227',
      phone: '(410) 568-7390',
    },
    {
      id: '369',
      name: 'Rosedale',
      address: '9100 Yellow Brick Road, Suite A-C1, Rosedale, MD 21237',
      phone: '(410) 391 5495',
    },
  ]);
});

test('a directory address needs both the store number and the store name to match', () => {
  const directory = {
    sourceUrl: 'https://www.johnstonesupply.com/store406/contact-us',
    observedAt: '2026-10-19T15:14:09.054Z',
    stores: parseJohnstoneDirectory(rendered),
  };
  assert.equal(directoryAddress('406', 'Arbutus', directory)?.address.startsWith('1660'), true);
  assert.equal(directoryAddress('406', 'Arbutus - #406', directory)?.id, '406');
  assert.equal(directoryAddress('406', 'Rosedale', directory), null, 'number/name mismatch');
  assert.equal(directoryAddress('123', 'Easton', directory), null, 'unknown store');
});

test('the saved store list loads and covers the stores seen on the York product page', () => {
  const directory = johnstoneDirectory();
  assert.ok(directory);
  for (const [id, name] of [
    ['406', 'Arbutus'],
    ['369', 'Rosedale'],
    ['704', 'Pittston'],
    ['461', 'Alexandria'],
    ['562', 'Sterling'],
  ])
    assert.ok(directoryAddress(id, name, directory), `${name} #${id}`);
});
