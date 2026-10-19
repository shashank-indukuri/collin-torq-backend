import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { getBrowser, closeBrowser } from '../src/browser.js';
import { normalizePart } from '../src/domain.js';
import type { Job } from '../src/store.js';
const { app, store } = createApp();
await app.listen({ host: '127.0.0.1', port: 4310 });
async function until(check: () => Promise<boolean>, label: string, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out: ${label}`);
}
try {
  const sh = await getBrowser();
  const page = await sh.browser.context.newPage();
  await page.goto('http://127.0.0.1:4310');
  await until(
    () =>
      page.evaluate(() =>
        Boolean((document.querySelector('#request') as HTMLTextAreaElement)?.value),
      ),
    'capture intake',
  );
  await page.locator('#run').click();
  await until(
    () => page.evaluate(() => Boolean(document.querySelector('#capture-review'))),
    'review controls',
  );
  await page.evaluate(() => {
    for (const id of ['capture-line-0', 'capture-line-1']) {
      const s = document.getElementById(id) as HTMLSelectElement;
      s.value = '0';
      s.dispatchEvent(new Event('change'));
    }
  });
  await page.locator('#capture-submit').click();
  await until(
    () => page.evaluate(() => Boolean(document.querySelector('#start-source'))),
    'source handoff control',
  );
  const parent: Job = JSON.parse(
    await page.evaluate(() => document.querySelector('#raw')!.textContent!),
  );
  assert.ok(parent.capturedParts);
  await page.locator('#start-source').click();
  await until(
    () =>
      page.evaluate(() => {
        const text = document.querySelector('#raw')?.textContent;
        if (!text) return false;
        const j = JSON.parse(text);
        return Boolean(j.sourceCapture && !['running', 'queued'].includes(j.state));
      }),
    'live supplier checks',
    180000,
  );
  const job: Job = JSON.parse(
    await page.evaluate(() => document.querySelector('#raw')!.textContent!),
  );
  assert.equal(job.sourceCapture?.jobId, parent.id);
  assert.deepEqual(job.capturedParts, parent.capturedParts);
  assert.equal(job.results.length, 2);
  assert.deepEqual(store.get(parent.id)?.capturedParts, parent.capturedParts);
  assert.equal(store.get(parent.id)?.state, 'completed');
  for (const line of job.results) {
    assert.equal(line.attempts?.length, 3);
    assert.ok(line.attempts.every((a) => a.phase === 'exact'));
    for (const o of line.offers) {
      assert.equal(o.synthetic, false);
      assert.equal(o.match, 'exact');
      assert.equal(o.pickupReady, null);
      assert.equal(o.stockQuantity, null);
      assert.equal(o.eligible, false);
    }
  }
  assert.ok(
    job.results.every((r) => r.attempts?.some((a) => a.evidence)),
    'Capture browser evidence even when suppliers are blocked',
  );
  for (const line of job.results)
    for (const attempt of line.attempts ?? []) {
      if (attempt.evidence) {
        const r = await fetch(
          `http://127.0.0.1:4310/api/searches/${job.id}/evidence/${attempt.evidence.screenshot}`,
        );
        assert.equal(r.status, 200);
        await r.arrayBuffer();
      }
    }
  assert.ok(
    job.results[0]!.offers.some(
      (o) =>
        o.supplier === 'partstown' &&
        normalizePart(o.partNumber) === normalizePart('S1-33101975102') &&
        ['public_catalog', 'authenticated'].includes(o.access ?? ''),
    ),
    'Expected a verified real board catalog observation',
  );
  await page.evaluate(() => document.querySelector('#state')!.scrollIntoView());
  await page.screenshot({ path: '.local/step5-acceptance.png' });
  console.log(
    JSON.stringify(
      {
        passed: true,
        jobId: job.id,
        parentId: parent.id,
        state: job.state,
        results: job.results.map((r) => ({
          name: r.name,
          attempts: r.attempts?.map((a) => ({
            supplier: a.supplier,
            status: a.status,
            code: a.code,
          })),
          offers: r.offers.map((o) => ({
            supplier: o.supplier,
            partNumber: o.partNumber,
            price: o.price,
            access: o.access,
            priceBasis: o.priceBasis,
            stockQuantity: o.stockQuantity,
          })),
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await closeBrowser();
  await app.close();
}
