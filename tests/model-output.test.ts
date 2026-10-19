import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStructured } from '../src/model.js';

test('a strict-schema reply keeps its first complete object and rejects prose', () => {
  assert.deepEqual(parseStructured('{"a":1}'), { a: 1 });
  assert.deepEqual(parseStructured('{"a":"x}"}\n\nWe need next step'), { a: 'x}' });
  assert.deepEqual(parseStructured('{"a":"q\\"}"}{"b":2}'), { a: 'q"}' });
  assert.deepEqual(parseStructured('{"a":{"b":[1,2]}} trailing'), { a: { b: [1, 2] } });
  assert.throws(() => parseStructured('We need next step'), SyntaxError);
  assert.throws(() => parseStructured('{"a":1'), SyntaxError);
});

test('over-long strings are trimmed to the schema maxLength, other values untouched', async () => {
  const { clampToSchema } = await import('../src/model.js');
  const schema = {
    type: 'object',
    properties: {
      nextAction: { type: 'string', maxLength: 5 },
      finished: { type: 'boolean' },
      facts: {
        type: 'array',
        items: {
          anyOf: [{ type: 'object', properties: { quote: { type: 'string', maxLength: 3 } } }],
        },
      },
    },
  };
  assert.deepEqual(
    clampToSchema(
      { nextAction: 'abcdefgh', finished: true, facts: [{ quote: 'wxyz', value: '9' }] },
      schema,
    ),
    { nextAction: 'abcde', finished: true, facts: [{ quote: 'wxy', value: '9' }] },
  );
});
