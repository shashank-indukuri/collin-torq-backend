import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';
import { getBrowser, closeBrowser } from '../src/browser.js';
import { usage } from '../src/ollama.js';
import { comparisonRequestSchema } from '../src/comparison.js';
import { alternativeReviewSchema } from '../src/alternatives.js';

// UI integration against local API fixtures; never visits suppliers or runs inference.
const app = Fastify(),
  suppliers = ['johnstone', 'partstown', 'grainger'];
const lines = [
  { name: 'Control board', manufacturer: 'York', partNumber: 'S1-33101975102', quantity: 1 },
  { name: 'Capacitor', manufacturer: 'York', partNumber: 'S1-02425893000', quantity: 1 },
];
const base = {
  id: 'ui-alternatives-fixture',
  state: 'needs_permission',
  updatedAt: '2026-10-18T20:00:00Z',
  input: { suppliers, lines, origin: { address: 'Arlington VA 22201' } },
  sourceCapture: { jobId: 'fixture-capture' },
  capturedParts: {
    modelBasis: 'test_model',
    warnings: ['Synthetic UI fixture.'],
    lines: lines.map((l) => ({ ...l, requestedName: l.name, description: l.name })),
  },
  results: lines.map((l, i) => ({
    name: l.name,
    quantity: 1,
    offers: i
      ? []
      : [
          {
            supplier: 'johnstone',
            match: 'exact',
            manufacturer: 'York',
            partNumber: l.partNumber,
            description: 'Synthetic board',
            price: 10,
            currency: 'USD',
            unit: 'each',
            stockText: 'Synthetic inventory unverified',
            sourceUrl: 'https://example.invalid/fixture',
          },
        ],
    errors: [],
    attempts: suppliers.map((supplier) => ({
      supplier,
      phase: 'exact',
      status: i || supplier !== 'johnstone' ? 'no_match' : 'found',
    })),
  })),
};
let job: any = structuredClone(base),
  reviewCalls = 0,
  declineCalls = 0,
  refreshCalls = 0;
const exact = JSON.stringify(base.results);
app.get('/flow', async (_, r) =>
  r.type('text/html').send(await readFile('public/flow.html', 'utf8')),
);
app.get('/api/health', async () => ({ status: 'ok' }));
app.get('/api/searches/:id', async (req) =>
  (req.params as { id: string }).id === 'exact-parent'
    ? { ...base, id: 'exact-parent', state: 'completed' }
    : job,
);
app.post('/api/searches/:id/compare', async (req) => {
  assert.equal((req.params as { id: string }).id, 'exact-parent');
  const body = comparisonRequestSchema.parse(req.body);
  assert.equal(body.expectedUpdatedAt, base.updatedAt);
  refreshCalls++;
  job = { ...job, id: 'refreshed-comparison', state: 'needs_input' };
  return job;
});
app.post('/api/searches/:id/alternatives/review', async (req) => {
  const body = alternativeReviewSchema.parse(req.body);
  assert.equal(body.allow, true);
  assert.equal(body.expectedUpdatedAt, job.updatedAt);
  reviewCalls++;
  job = {
    ...job,
    state: 'needs_input',
    alternativeReview: {
      status: 'needs_review',
      consent: true,
      lines: [
        {
          requestedPartNumber: 'S1-02425893000',
          status: 'needs_review',
          message: 'Installed voltage and physical fit need review.',
          candidates: [
            {
              manufacturer: 'York',
              partNumber: 'S1-02425893700',
              offers: [],
              attempts: [],
              verification: {
                rankingEligible: false,
                checks: [
                  { field: 'voltage', status: 'missing', detail: 'Installed voltage is unknown.' },
                ],
              },
            },
          ],
        },
      ],
      errors: [],
    },
  };
  return job;
});
app.post('/api/searches/:id/alternatives', async (req) => {
  assert.deepEqual(req.body, { allow: false });
  declineCalls++;
  job = { ...job, state: 'completed' };
  return job;
});
await app.listen({ host: '127.0.0.1', port: 4313 });
const beforeCalls = usage.calls;
async function until(fn: () => Promise<boolean>) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('UI assertion timed out');
}
try {
  const sh = await getBrowser(),
    page = await sh.browser.context.newPage();
  await page.goto('http://127.0.0.1:4313/flow');
  await page.evaluate(() => {
    localStorage.setItem('torq-flow-job', 'ui-alternatives-fixture');
    location.reload();
  });
  await until(() =>
    page.evaluate(() => Boolean(document.querySelector('[data-action="review-alternatives"]'))),
  );
  assert.equal(reviewCalls, 0);
  assert.equal(declineCalls, 0);
  await page.screenshot({ path: '.local/flow-alternatives-consent.png', fullPage: true });
  await page.locator('[data-action="review-alternatives"]').click();
  await until(() =>
    page.evaluate(
      () =>
        document.body.innerText.includes('S1-02425893700') &&
        document.body.innerText.includes('Installed voltage is unknown.'),
    ),
  );
  assert.equal(reviewCalls, 1);
  assert.equal(JSON.stringify(job.results), exact);
  assert.equal(
    await page.evaluate(() =>
      Boolean(document.querySelector('[data-action="review-alternatives"]')),
    ),
    false,
  );
  await page.screenshot({ path: '.local/flow-alternatives-review.png', fullPage: true });
  // Refusal ends sourcing without granting consent or starting a review.
  job = structuredClone(base);
  await page.goto('http://127.0.0.1:4313/flow');
  await until(() =>
    page.evaluate(() => Boolean(document.querySelector('[data-action="decline-alternatives"]'))),
  );
  await page.locator('[data-action="decline-alternatives"]').click();
  await until(() =>
    page.evaluate(() => !document.querySelector('[data-testid="alternatives-permission"]')),
  );
  assert.equal(declineCalls, 1);
  assert.equal(reviewCalls, 1);
  assert.equal(JSON.stringify(job.results), exact);
  // An incomplete supplier check must never be presented as permission-ready no-match.
  job = structuredClone(base);
  job.results[1].errors = [
    { supplier: 'grainger', code: 'SITE_CHALLENGE', message: 'Human verification required' },
  ];
  job.results[1].attempts[2].status = 'error';
  await page.goto('http://127.0.0.1:4313/flow');
  await until(() =>
    page.evaluate(() => document.querySelector('#workspace')?.getAttribute('hidden') === null),
  );
  assert.equal(
    await page.evaluate(() =>
      Boolean(document.querySelector('[data-action="review-alternatives"]')),
    ),
    false,
  );
  // The comparison screen must expose review too; comparison must not swallow consent.
  job = structuredClone(base);
  job.state = 'needs_input';
  job.comparisonOf = { jobId: 'exact-parent' };
  job.comparison = {
    status: 'needs_verification',
    origin: { address: 'Arlington VA 22201', warnings: [] },
    lines: [],
  };
  await page.goto('http://127.0.0.1:4313/flow');
  await until(() =>
    page.evaluate(() => Boolean(document.querySelector('[data-action="review-alternatives"]'))),
  );
  await page.locator('[data-action="refresh-comparison"]').click();
  await until(() =>
    page.evaluate(() => localStorage.getItem('torq-flow-job') === 'refreshed-comparison'),
  );
  assert.equal(refreshCalls, 1);
  assert.equal(JSON.stringify(job.results), exact);
  await page.locator('[data-action="review-alternatives"]').click();
  await until(() => page.evaluate(() => document.body.innerText.includes('S1-02425893700')));
  assert.equal(reviewCalls, 2);
  await page.evaluate(() => localStorage.removeItem('torq-flow-job'));
  await page.goto('http://127.0.0.1:4313/flow?job=refreshed-comparison');
  await until(() => page.evaluate(() => document.body.innerText.includes('S1-02425893700')));
  assert.equal(usage.calls, beforeCalls);
  console.log(
    'PASS guided alternatives consent, refusal, candidate review, unchanged exact results, failed-supplier exclusion, source-bound refresh and direct-link resume; zero model calls',
  );
} finally {
  await closeBrowser();
  await app.close();
}
