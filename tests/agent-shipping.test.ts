import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShippingArrival } from '../src/arrival.js';
import { groundedFact, type AgentFact } from '../src/agent-policy.js';
import { assembleAgentOffer, type AgentTrace } from '../src/sourcing-agent.js';
import { compareOffers } from '../src/comparison-policy.js';

const observedAt = '2026-10-19T14:00:00.000Z';
const fact = (field: AgentFact['field'], value: string, quote: string): AgentFact =>
  ({ field, value, quote, branchId: null, branchName: null }) as AgentFact;

test('shipping arrival phrases convert to ISO dates in code', () => {
  for (const [text, iso] of [
    ['Expected to arrive Tue. Oct 20.', '2026-10-20'],
    ['Estimated delivery: Thursday, October 22', '2026-10-22'],
    ['Arrives by Oct 22, 2026', '2026-10-22'],
    ['Get it by Fri Oct 23', '2026-10-23'],
    ['Expected to arrive Jan. 5.', '2027-01-05'],
  ] as const)
    assert.equal(parseShippingArrival(text, observedAt), iso, text);
});

test('ranges, pickup estimates and impossible dates never become arrival dates', () => {
  for (const text of [
    'Available in 1-2 Days',
    'Available for pickup Tue. Oct 20 estimated after 9:00 AM.',
    'Ships today',
    'Expected to arrive Mon. Oct 20.',
    'Expected to arrive Feb. 30.',
    'Expected to arrive Oct 200.',
    'Expected to arrive Jun 1, 2027.',
    'Expected to arrive Oct 18, 2026.',
  ])
    assert.equal(parseShippingArrival(text, observedAt), null, text);
});

test('an arrival fact is grounded only when code re-derives the same date from the quote', () => {
  const body = 'Ship\nPickup\nExpected to arrive Tue. Oct 20.\nShip to 22201 | Change';
  const quote = 'Expected to arrive Tue. Oct 20.';
  assert.equal(groundedFact(fact('arrivalDate', '2026-10-20', quote), body, observedAt), true);
  assert.equal(groundedFact(fact('arrivalDate', '2026-10-21', quote), body, observedAt), false);
  assert.equal(
    groundedFact(fact('arrivalDate', '2026-10-20', 'Available in 1-2 Days'), body, observedAt),
    false,
  );
  assert.equal(
    groundedFact(fact('arrivalDate', '2026-10-20', 'Expected Oct 20'), 'Expected Oct 20'),
    false,
  );
});

const evidence = {
  url: 'https://www.grainger.com/product/YORK-Defrost-Control-Board-Kit-42FL31',
  screenshot: 'grainger-agent-3.png',
  observedAt: new Date().toISOString(),
};
const line = { name: 'board', manufacturer: 'York', partNumber: 'S1-33101975102', quantity: 1 };
const observations = [
  fact('manufacturer', 'YORK', 'Brand YORK'),
  fact('partNumber', 'S1-33101975102', 'Mfr Part # S1-331-01975-102'),
  fact('price', '336.85', 'Web Price $336.85/ each'),
  fact('unit', 'each', '$336.85/ each'),
].map((f) => ({ ...f, evidence }));
const trace = (shipping?: AgentTrace['shipping']): AgentTrace => ({
  engine: 'stagehand_goal_agent',
  model: 'test',
  steps: 3,
  termination: 'goal_inspection_finished',
  observations,
  shipping,
  actions: [],
});
const quoted = (quantityValue: string | null, destinationZip: string | null = '22201') => ({
  arrivalDate: '2099-10-20',
  destinationZip,
  quantityValue,
  quote: 'Expected to arrive Tue. Oct 20.',
  evidence,
});

test('shipping quantity is confirmed only by the quantity input in the arrival panel', () => {
  const confirmed = assembleAgentOffer(
    'grainger',
    line,
    observations,
    evidence,
    trace(quoted('1')),
  );
  assert.equal(confirmed.commercial?.shipping.quantityConfirmed, true);
  assert.equal(confirmed.commercial?.shipping.arrivalDate, '2099-10-20');
  assert.equal(confirmed.commercial?.shipping.destinationZip, '22201');

  const wrongQty = assembleAgentOffer('grainger', line, observations, evidence, trace(quoted('2')));
  assert.equal(wrongQty.commercial?.shipping.quantityConfirmed, false);
  assert.ok(wrongQty.commercial?.issues.some((i) => i.includes('requested quantity')));

  const ambiguous = assembleAgentOffer(
    'grainger',
    line,
    observations,
    evidence,
    trace(quoted(null)),
  );
  assert.equal(ambiguous.commercial?.shipping.quantityConfirmed, false);

  const noZip = assembleAgentOffer(
    'grainger',
    line,
    observations,
    evidence,
    trace(quoted('1', null)),
  );
  assert.equal(noZip.commercial?.shipping.quantityConfirmed, false);
  assert.ok(noZip.commercial?.issues.some((i) => i.includes('destination ZIP')));

  const none = assembleAgentOffer('grainger', line, observations, evidence, trace());
  assert.equal(none.commercial?.shipping.arrivalDate, null);
  assert.equal(none.commercial?.shipping.quantityConfirmed, false);
});

test('a bound agent arrival quote ranks for fastest shipping; an unbound one does not', () => {
  const origin = {
    status: 'resolved' as const,
    address: 'Arlington VA 22201',
    point: { latitude: 38.88, longitude: -77.1 },
    basis: 'census_zcta_reference' as const,
    sourceUrl: null,
    observedAt: new Date().toISOString(),
    warnings: [],
  };
  const bound = assembleAgentOffer('grainger', line, observations, evidence, trace(quoted('1')));
  assert.deepEqual(
    compareOffers([bound], line, origin).fastestShipping.winners.map((w) => w.arrivalDate),
    ['2099-10-20'],
  );
  const unbound = assembleAgentOffer('grainger', line, observations, evidence, trace(quoted('2')));
  assert.equal(compareOffers([unbound], line, origin).fastestShipping.winners.length, 0);
  const otherZip = assembleAgentOffer(
    'grainger',
    line,
    observations,
    evidence,
    trace(quoted('1', '22301')),
  );
  assert.equal(compareOffers([otherZip], line, origin).fastestShipping.winners.length, 0);
});

test('a challenge stops the agent only when the rendered page shows one', async () => {
  const { challengeShown } = await import('../src/agent-policy.js');
  assert.equal(
    challengeShown(
      'Verification Required\nSlide right to secure your access\nWe detected unusual activity',
    ),
    true,
  );
  assert.equal(
    challengeShown('Grainger\nCatalog\nFind A Branch\nEnter keyword, item, model or part #'),
    false,
  );
});

test('verification and anti-bot controls are never permitted actions', async () => {
  const { permittedAction } = await import('../src/agent-policy.js');
  const control = { tag: 'button', type: 'button', text: '', href: '', form: '' };
  for (const description of [
    'Switches to the audio verification option for the DataDome access check.',
    'Slide right to secure your access',
    'Press and hold to confirm you are human',
    'Solve the captcha',
  ])
    assert.equal(
      permittedAction({ method: 'click', description }, control, 'www.grainger.com', []),
      false,
      description,
    );
  const { challengeShown } = await import('../src/agent-policy.js');
  assert.equal(challengeShown('Use the verification control to complete the DataDome check'), true);
});

test('live quotes: a quantity box label is not a condition and a delivery range is not stock', () => {
  // Parts Town 2026-10-19: the model grounded condition "new" on a quantity label.
  const pt =
    'Ship It!\nIn Stock\nMy Price: $ 198.49\nNew quantity: 1\nQuantity Available:\t9\nUnits:\tEach';
  assert.equal(groundedFact(fact('condition', 'new', 'New quantity: 1'), pt), false);
  assert.equal(groundedFact(fact('condition', 'new', 'Condition: New'), 'Condition: New'), true);
  assert.equal(
    groundedFact(
      fact('condition', 'refurbished', 'Condition: Refurbished'),
      'Condition: Refurbished',
    ),
    true,
  );
  assert.equal(groundedFact(fact('shippingQuantity', '9', 'Quantity Available:\t9'), pt), true);
  // Johnstone 2026-10-19: "1" in "1-2 Days" was taken as shipping stock.
  const js = 'My Johnstone Supply Price\n\nAvailable in 1-2 Days\n\n$196.72';
  assert.equal(
    groundedFact(fact('shippingQuantity', '1', 'Available in 1-2 Days $196.72'), js),
    false,
  );
  assert.equal(groundedFact(fact('price', '1', 'Available in 1-2 Days'), js), false);
  assert.equal(groundedFact(fact('price', '196.72', '$196.72'), js), true);
  // Branch rows keep working.
  assert.equal(
    groundedFact(
      { ...fact('branchStock', '1', 'Arbutus - #406\t1'), branchId: '406', branchName: 'Arbutus' },
      'Arbutus - #406\t1',
    ),
    true,
  );
});

test('a home-page dropdown no-match counts only after the agent typed that exact number', async () => {
  const { suggestionNoMatch } = await import('../src/sourcing-agent.js');
  // Johnstone 2026-10-19: the search dropdown answered on the home page.
  const body = 'ASM01668\nEntire Store\n"ASM01668"\nNo products found\nSuggestions';
  const noMatch = fact('noMatch', 'No products found', '"ASM01668" No products found');
  const typed = [
    {
      instruction: 'Fill the search box with ASM01668',
      description: '',
      method: 'fill',
      url: 'https://www.johnstonesupply.com/',
      outcome: 'executed',
    },
  ];
  assert.equal(suggestionNoMatch('ASM01668', [noMatch], body, typed), true);
  assert.equal(suggestionNoMatch('ASM01668', [noMatch], body, []), false, 'nothing typed');
  assert.equal(
    suggestionNoMatch('ASM01668', [noMatch], body, [
      { ...typed[0]!, instruction: 'Fill the search box with ASM0166' },
    ]),
    false,
    'a different value was typed',
  );
  assert.equal(
    suggestionNoMatch(
      'ASM01668',
      [fact('noMatch', 'No products found', 'No products found')],
      body,
      typed,
    ),
    false,
    'the message must name the number',
  );
  assert.equal(suggestionNoMatch('ASM01669', [noMatch], body, typed), false, 'different part');
});

test('live quote: Parts Town "couldn\'t find anything" is a query-bound no-match', async () => {
  const { queryNoMatchGrounded } = await import('../src/agent-policy.js');
  // Parts Town 2026-10-19 for RLY00681.
  const body =
    'Global Search\nRLY00681\nWhoops! We couldn’t find anything for "RLY00681"\nHere are ways you can track down what you need.';
  const quote = 'Whoops! We couldn’t find anything for "RLY00681"';
  const f = fact('noMatch', 'couldn’t find anything', quote);
  const url = 'https://www.partstown.com/b/trane?q=RLY00681&searchwithin=RLY00681';
  assert.equal(queryNoMatchGrounded('RLY00681', url, [f], body), true);
  assert.equal(queryNoMatchGrounded('RLY00682', 'https://www.partstown.com/', [f], body), false);
});
