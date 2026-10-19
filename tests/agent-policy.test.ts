import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groundedFact,
  permittedAction,
  actionStateKey,
  queryNoMatchGrounded,
  type AgentFact,
  type DynamicControl,
} from '../src/agent-policy.js';
import { assembleAgentOffer, type AgentTrace } from '../src/sourcing-agent.js';
const fact = (field: AgentFact['field'], value: string, quote: string): AgentFact =>
  ({ field, value, quote, branchId: null, branchName: null }) as AgentFact;
const control: DynamicControl = {
  tag: 'input',
  type: 'search',
  text: 'Search catalog',
  href: '',
  form: 'Search',
};
test('no-match evidence is bound to the actual query even when the page omits the identifier', () => {
  const facts = [fact('noMatch', 'No results', 'No results')];
  assert.equal(
    queryNoMatchGrounded(
      'TEST-123',
      'https://example.test/search?term=TEST-123',
      facts,
      'No results',
    ),
    true,
  );
  assert.equal(
    queryNoMatchGrounded(
      'TEST-123',
      'https://example.test/search?term=OTHER-999',
      facts,
      'No results',
    ),
    false,
  );
  assert.equal(
    queryNoMatchGrounded('TEST-123', 'https://example.test/', facts, 'No results'),
    false,
  );
  assert.equal(
    queryNoMatchGrounded('TEST-123', 'https://example.test/search?term=TEST-123', facts, 'Loading'),
    false,
  );
  assert.equal(
    queryNoMatchGrounded(
      'TEST-123',
      'https://example.test/search?term=TEST-123-EXTRA',
      facts,
      'No results',
    ),
    false,
  );
  assert.equal(
    queryNoMatchGrounded(
      'TEST-123',
      'https://example.test/',
      [fact('noMatch', 'No results', 'No results for TEST-123-EXTRA')],
      'No results for TEST-123-EXTRA',
    ),
    false,
  );
  assert.equal(
    queryNoMatchGrounded(
      'TEST-123',
      'https://example.test/',
      [fact('noMatch', 'No results', 'No results for TEST-123')],
      'No results for TEST-123',
    ),
    true,
  );
});
test('repeated clicks cannot evade the page-state guard through irrelevant argument changes', () => {
  const a = { selector: 'xpath=/button', method: 'click', arguments: [] };
  const key = actionStateKey('https://example.com', a, 'inventory open');
  assert.equal(
    key,
    actionStateKey('https://example.com', { ...a, arguments: ['22201'] }, 'inventory open'),
  );
  assert.notEqual(key, actionStateKey('https://example.com', a, 'inventory updated'));
  assert.notEqual(
    actionStateKey('https://example.com', { ...a, method: 'fill', arguments: ['1'] }, 'quantity'),
    actionStateKey('https://example.com', { ...a, method: 'fill', arguments: ['2'] }, 'quantity'),
  );
});
test('semantic facts require actual page quotes and exact numeric evidence; dollars cannot become USD', () => {
  assert.equal(groundedFact(fact('price', '196.72', 'Price $196.72'), 'Price $196.72'), true);
  assert.equal(groundedFact(fact('price', '196.72', 'Price $196.72'), 'Price $198.49'), false);
  assert.equal(
    groundedFact(fact('branchStock', '9', 'Quantity Available: 19'), 'Quantity Available: 19'),
    false,
  );
  assert.equal(groundedFact(fact('currency', 'USD', 'Price $196.72'), 'Price $196.72'), false);
  assert.equal(groundedFact(fact('pickupReady', 'true', 'Branch #9: 1'), 'Branch #9: 1'), false);
  assert.equal(
    groundedFact(fact('arrivalDate', '2026-10-20', 'Expected Oct 20'), 'Expected Oct 20'),
    false,
  );
});
test('branch inventory cannot borrow an unrelated numeric occurrence or a different branch identity', () => {
  const stock = {
    field: 'branchStock' as const,
    value: '1',
    quote: '1',
    branchId: '406',
    branchName: 'Arbutus',
  };
  const body = 'Requested quantity: 1. Arbutus #406 Qty 0. Rosedale #369 Qty 1.';
  assert.equal(groundedFact(stock, body), false);
  assert.equal(groundedFact({ ...stock, quote: 'Rosedale #369 Qty 1' }, body), false);
  assert.equal(groundedFact({ ...stock, quote: 'Arbutus #406 Qty 0' }, body), false);
  assert.equal(groundedFact({ ...stock, value: '0', quote: 'Arbutus #406 Qty 0' }, body), true);
});
test('semantic actions can fill task values on unknown layouts but cannot buy, change accounts or leave the supplier', () => {
  assert.equal(
    permittedAction({ method: 'fill', arguments: ['22201'] }, control, 'www.example.com', [
      '22201',
    ]),
    true,
  );
  assert.equal(
    permittedAction({ method: 'fill', arguments: ['secret'] }, control, 'www.example.com', [
      '22201',
    ]),
    false,
  );
  assert.equal(
    permittedAction(
      { method: 'click' },
      { ...control, tag: 'button', type: 'button', text: 'Add to cart' },
      'www.example.com',
      [],
    ),
    false,
  );
  assert.equal(
    permittedAction(
      { method: 'click' },
      { ...control, tag: 'a', type: '', href: 'https://evil.test/product' },
      'www.example.com',
      [],
    ),
    false,
  );
  assert.equal(
    permittedAction(
      { method: 'fill', arguments: ['22201'] },
      { ...control, type: 'password' },
      'www.example.com',
      ['22201'],
    ),
    false,
  );
  assert.equal(
    permittedAction(
      { method: 'click' },
      {
        ...control,
        tag: 'button',
        type: 'button',
        text: 'Check availability',
        form: 'Price $11 Add to Cart',
      },
      'www.example.com',
      [],
    ),
    true,
  );
});
test('goal agent preserves discovered numeric branch stock without inventing pickup promises or condition', () => {
  const evidence = {
    url: 'https://www.johnstonesupply.com/dynamic-product',
    screenshot: 'agent.png',
    observedAt: new Date().toISOString(),
  };
  const observations = [
    fact('manufacturer', 'Source 1', 'Brand Source 1'),
    fact('partNumber', 'S1-33101975102', 'Part S1-33101975102'),
    fact('price', '196.72', 'Price $196.72'),
    fact('currency', 'USD', 'Currency USD'),
    fact('unit', 'each', 'Unit each'),
    { ...fact('branchStock', '1', 'Arbutus #406 Qty 1'), branchId: '406', branchName: 'Arbutus' },
  ].map((f) => ({ ...f, evidence }));
  const trace: AgentTrace = {
    engine: 'stagehand_goal_agent',
    model: 'test',
    steps: 4,
    termination: 'budget',
    observations,
    actions: [],
  };
  const offer = assembleAgentOffer(
    'johnstone',
    { name: 'board', manufacturer: 'York', partNumber: 'S1-33101975102', quantity: 1 },
    observations,
    evidence,
    trace,
  );
  assert.equal(offer.match, 'exact');
  assert.equal(offer.commercial?.branches[0]?.stockQuantity, 1);
  assert.equal(offer.commercial?.branches[0]?.pickupReady, null);
  assert.equal(offer.commercial?.price.condition, null);
  assert.equal(offer.eligible, false);
});
