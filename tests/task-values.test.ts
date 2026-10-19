import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originStateValues } from '../src/task-values.js';
test('origin permits full state labels only when grounded in the supplied address', () => {
  for (const input of [
    'Arlington VA 22201',
    'Arlington, VA 22201',
    'Arlington, Virginia 22201',
    '100 Example St, Arlington VA 22201-1234',
  ])
    assert.deepEqual(originStateValues(input), ['VA', 'Virginia']);
  assert.deepEqual(originStateValues('New York NY 10001'), ['NY', 'New York']);
  assert.deepEqual(originStateValues('Charleston West Virginia 25301'), ['WV', 'West Virginia']);
  for (const input of [
    '22201',
    'Arlington 22201',
    'Virginia Beach 23451',
    'Somewhere XX 22201',
    'Arlington VA',
  ])
    assert.deepEqual(originStateValues(input), []);
});
