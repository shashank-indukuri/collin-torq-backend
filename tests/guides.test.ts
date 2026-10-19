import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelEvidence, normalizeModel, GuideResolver } from '../src/guides.js';

test('guide applicability is based on model column headings, not prefix inference or body mentions', () => {
  const pages = [
    {
      page: 2,
      text: 'FIG ITEM DESCRIPTION E1RD030S06B E1RD036S06B\nReplaces something for E1RD036S46B',
    },
  ];
  assert.equal(normalizeModel('York - E1RD036'), 'E1RD036');
  assert.deepEqual(modelEvidence(pages, 'E1RD036').matchingModels, ['E1RD036S06B']);
  assert.deepEqual(modelEvidence(pages, 'E1RD036S46B').matchingModels, []);
  assert.deepEqual(modelEvidence(pages, 'E1RD036S06B').modelEvidence, [
    { page: 2, text: pages[0]!.text.split('\n')[0] },
  ]);
});
test('general discovery with no observed candidates returns honest misses without downloading York evidence', async () => {
  const resolver = new GuideResolver(undefined, { general: { discover: async () => [] } });
  for (const request of [
    { manufacturer: 'Carrier', model: 'E1RD036' },
    { manufacturer: 'York', model: 'UNKNOWN' },
  ]) {
    const r = await resolver.resolve(request);
    assert.equal(r.status, 'not_found');
    assert.equal(r.guide, null);
  }
});

import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { Store } from '../src/store.js';
import { Worker } from '../src/worker.js';
import { inputSchema } from '../src/domain.js';
const request = { manufacturer: 'York', model: 'E1RD036' };
// Synthetic transport/parser boundary for fast offline failure injection.
// Real PDF parsing is covered separately by acceptance:guide.
const fakePdf = '%PDF-1.4\ntransport-test';
const parsedPages = [
  { page: 1, text: 'Johnson Controls Unitary Products 035-21220-001 Rev. E (0409) 1 of 4' },
  { page: 2, text: 'FIG ITEM DESCRIPTION E1RD036S06B E1RD036S25B\nBody mention E1RD036S46B' },
  { page: 3, text: '3 of 4' },
];
async function sandbox(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'torq-guide-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
function resolver(
  dir: string,
  fetcher: typeof fetch = async () => new Response(fakePdf),
  pages = parsedPages,
) {
  return new GuideResolver(dir, { fetch: fetcher, extractPdf: async () => structuredClone(pages) });
}
test('multiple suffixes remain ambiguous; exact full model is required and body mentions do not count', () =>
  sandbox(async (dir) => {
    const r = resolver(dir);
    const prefix = await r.resolve(request);
    assert.equal(prefix.status, 'needs_model_confirmation');
    assert.equal(prefix.guide?.applicability, 'prefix_only');
    assert.deepEqual(prefix.guide?.matchingModels, ['E1RD036S06B', 'E1RD036S25B']);
    assert.equal((await r.resolve({ ...request, model: 'E1RD036S06B' })).status, 'guide_found');
    const wrong = await r.resolve({ ...request, model: 'E1RD036S46B' });
    assert.equal(wrong.status, 'not_found');
    assert.equal(wrong.guide?.applicability, 'not_listed');
  }));
for (const [label, fetcher, pages] of [
  ['HTTP 404', async () => new Response('missing', { status: 404 }), parsedPages],
  [
    'network timeout',
    async () => {
      throw new DOMException('Timed out', 'TimeoutError');
    },
    parsedPages,
  ],
  ['HTML login page', async () => new Response('<html>Sign in</html>'), parsedPages],
  [
    'oversized declared download',
    async () => new Response(fakePdf, { headers: { 'content-length': String(13 * 1024 * 1024) } }),
    parsedPages,
  ],
  [
    'oversized streamed download',
    async () => new Response(new Uint8Array(12 * 1024 * 1024 + 1)),
    parsedPages,
  ],
  ['missing document body', async () => new Response(null), parsedPages],
  [
    'unrecognized document identity',
    async () => new Response(fakePdf),
    [{ page: 1, text: 'FIG ITEM DESCRIPTION E1RD036S06B' }],
  ],
  [
    'no extractable model headings',
    async () => new Response(fakePdf),
    [{ page: 1, text: 'Johnson Controls Unitary Products 035-21220-001 Rev. E (0409)' }],
  ],
] as const) {
  test(`cold-cache ${label} returns unavailable without guide or inferred model`, () =>
    sandbox(async (dir) => {
      const r = await resolver(dir, fetcher, [...pages]).resolve(request);
      assert.equal(r.status, 'unavailable');
      assert.equal(r.guide, null);
      assert.equal(r.cacheHit, false);
      assert.ok(r.attempts.some((a) => a.status === 'error'));
      assert.ok(
        r.attempts.some(
          (a) => a.door === 'johnstone_model_to_part' && a.status === 'not_implemented',
        ),
      );
    }));
}
test('a PDF parser failure fails closed rather than caching a valid-looking result', () =>
  sandbox(async (dir) => {
    const r = new GuideResolver(dir, {
      fetch: async () => new Response(fakePdf),
      extractPdf: async () => {
        throw new Error('Unreadable PDF');
      },
    });
    const result = await r.resolve(request);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.guide, null);
    assert.equal(await r.document('0'.repeat(64)), null);
  }));
test('offline cache survives metadata-text corruption and rejects corrupt PDF bytes', () =>
  sandbox(async (dir) => {
    let calls = 0;
    const transport: typeof fetch = async () => {
      calls++;
      if (calls > 1) throw new Error('Offline');
      return new Response(fakePdf);
    };
    const r = resolver(dir, transport);
    const first = await r.resolve(request);
    const hash = first.guide!.sha256;
    const path = join(dir, 'york-e1rd.json');
    const meta = JSON.parse(await readFile(path, 'utf8'));
    meta.pages = [{ page: 2, text: 'FIG ITEM DESCRIPTION E1RD036S46B' }];
    await writeFile(path, JSON.stringify(meta));
    const second = await r.resolve({ ...request, model: 'E1RD036S46B' });
    assert.equal(second.status, 'not_found');
    assert.equal(second.cacheHit, true);
    assert.equal(calls, 1);
    assert.equal((await r.document(hash))?.toString(), fakePdf);
    assert.equal(await r.document('0'.repeat(64)), null);
    await writeFile(join(dir, `${hash}.pdf`), 'broken');
    assert.equal(await r.document(hash), null);
    const corrupt = await r.resolve(request);
    assert.equal(corrupt.status, 'unavailable');
    assert.equal(corrupt.guide, null);
  }));
test('malformed cache is recovered by a fresh download and a failed attempt can be retried', () =>
  sandbox(async (dir) => {
    await writeFile(join(dir, 'york-e1rd.json'), '{bad json');
    let calls = 0;
    const r = resolver(dir, async () => {
      if (++calls === 1) throw new Error('Temporarily offline');
      return new Response(fakePdf);
    });
    assert.equal((await r.resolve(request)).status, 'unavailable');
    const recovered = await r.resolve(request);
    assert.equal(recovered.status, 'needs_model_confirmation');
    assert.equal(recovered.cacheHit, false);
    assert.equal((await r.resolve(request)).cacheHit, true);
    assert.equal(calls, 2);
  }));
test('concurrent cold-cache resolutions share one download', () =>
  sandbox(async (dir) => {
    let calls = 0;
    const r = resolver(dir, async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return new Response(fakePdf);
    });
    const results = await Promise.all(Array.from({ length: 6 }, () => r.resolve(request)));
    assert.equal(calls, 1);
    assert.ok(results.every((r) => r.status === 'needs_model_confirmation'));
  }));
test('incomplete-page warning follows PDF numbering rather than a hardcoded page count', () =>
  sandbox(async (dir) => {
    const complete = parsedPages.map((p) => ({ ...p, text: p.text.replaceAll('of 4', 'of 3') }));
    const result = await resolver(dir, undefined, complete).resolve(request);
    assert.ok(!result.guide?.warnings.some((w) => w.includes('incomplete guide copy')));
  }));
async function settled(store: Store, id: string) {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    const job = store.get(id)!;
    if (!['queued', 'running'].includes(job.state)) return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Worker did not settle');
}
const guideInput = {
  mode: 'live',
  stopAfter: 'guide',
  model: 'York - E1RD036',
  lines: [
    { name: 'control board', manufacturer: 'York' },
    { name: 'capacitor', manufacturer: 'York' },
  ],
};
test('guide API validates input and drives prefix → wrong suffix → correct suffix without supplier calls', () =>
  sandbox(async (dir) => {
    const store = new Store(join(dir, 'jobs.sqlite'));
    const { app } = createApp(store, resolver(dir));
    try {
      for (const payload of [
        { model: 'E1RD036' },
        { manufacturer: 'York', model: '' },
        { ...request, url: 'https://untrusted.example' },
      ]) {
        assert.equal(
          (await app.inject({ method: 'POST', url: '/api/guides/resolve', payload })).statusCode,
          400,
        );
      }
      assert.equal((await app.inject({ url: '/api/guides/not-a-hash/document' })).statusCode, 400);
      assert.equal(
        (await app.inject({ url: `/api/guides/${'0'.repeat(64)}/document` })).statusCode,
        404,
      );
      const created = await app.inject({
        method: 'POST',
        url: '/api/searches',
        payload: guideInput,
      });
      assert.equal(created.statusCode, 202);
      const id = created.json().id;
      let job = await settled(store, id);
      assert.equal(job.state, 'needs_input');
      assert.equal(job.guide?.status, 'needs_model_confirmation');
      assert.deepEqual(job.results, []);
      const pdf = await app.inject({ url: job.guide!.guide!.evidenceUrl });
      assert.equal(pdf.statusCode, 200);
      assert.equal(pdf.headers['content-type'], 'application/pdf');
      assert.equal(pdf.body, fakePdf);
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: `/api/searches/${id}/alternatives`,
            payload: { allow: true },
          })
        ).statusCode,
        409,
      );
      for (const [model, status] of [
        ['E1RD036S46B', 'needs_input'],
        ['E1RD036S06B', 'completed'],
      ] as const) {
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: `/api/searches/${id}/clarification`,
              payload: { model },
            })
          ).statusCode,
          202,
        );
        job = await settled(store, id);
        assert.equal(job.state, status);
        assert.deepEqual(job.results, []);
      }
      assert.equal(job.guide?.status, 'guide_found');
      assert.equal(job.guide.cacheHit, true);
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: `/api/searches/${id}/clarification`,
            payload: { model: 'E1RD036' },
          })
        ).statusCode,
        409,
      );
    } finally {
      await app.close();
    }
    const reopened = new Store(join(dir, 'jobs.sqlite'));
    try {
      const saved = reopened.list()[0]!;
      assert.equal(saved.state, 'completed');
      assert.equal(saved.guide?.guide?.applicability, 'exact_model_listed');
      assert.deepEqual(saved.results, []);
    } finally {
      reopened.db.close();
    }
  }));
test('worker requests missing or conflicting manufacturers rather than assuming York', async () => {
  const store = new Store(':memory:');
  let called = false;
  const worker = new Worker(store, {
    resolve: async () => {
      called = true;
      throw new Error('Should not resolve');
    },
  });
  try {
    for (const payload of [
      { ...guideInput, model: 'E1RD036', lines: [{ name: 'board' }] },
      { ...guideInput, lines: [{ name: 'board', manufacturer: 'Carrier' }] },
      {
        ...guideInput,
        lines: [
          { name: 'board', manufacturer: 'York' },
          { name: 'capacitor', manufacturer: 'Carrier' },
        ],
      },
    ]) {
      const { job } = store.create(inputSchema.parse(payload));
      worker.enqueue(job.id);
      const done = await settled(store, job.id);
      assert.equal(done.state, 'needs_input');
      assert.equal(done.guide, undefined);
    }
    assert.equal(called, false);
  } finally {
    store.db.close();
  }
});
test('cancellation during a guide download cannot be overwritten by a later successful result', () =>
  sandbox(async (dir) => {
    let release!: () => void;
    let started!: () => void;
    const downloading = new Promise<void>((r) => (started = r));
    const gate = new Promise<void>((r) => (release = r));
    const r = resolver(dir, async () => {
      started();
      await gate;
      return new Response(fakePdf);
    });
    const store = new Store(':memory:');
    const worker = new Worker(store, r);
    const { job } = store.create(inputSchema.parse(guideInput));
    worker.enqueue(job.id);
    await downloading;
    store.update(job.id, { state: 'cancelled' }, 'Cancelled by regression test');
    release();
    // Wait for the shared worker queue to drain before checking final state/closing DB.
    const { exclusive } = await import('../src/browser.js');
    await exclusive(async () => {});
    try {
      assert.equal(store.get(job.id)?.state, 'cancelled');
      assert.equal(store.get(job.id)?.guide, undefined);
      assert.deepEqual(store.get(job.id)?.results, []);
    } finally {
      store.db.close();
    }
  }));
