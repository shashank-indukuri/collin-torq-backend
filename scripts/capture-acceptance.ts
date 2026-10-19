import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { getBrowser, closeBrowser } from '../src/browser.js';
import type { Job } from '../src/store.js';
const { app, store } = createApp();
await app.listen({ host: '127.0.0.1', port: 4310 });
async function until(check: () => Promise<boolean>, label: string) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
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
    'step 4 intake',
  );
  const input = await page.evaluate(() =>
    JSON.parse((document.querySelector('#request') as HTMLTextAreaElement).value),
  );
  assert.equal(input.stopAfter, 'capture');
  assert.equal(input.model, 'E1RD036S06B');
  await page.locator('#run').click();
  await until(
    () => page.evaluate(() => Boolean(document.querySelector('#capture-review'))),
    'capture review',
  );
  let job: Job = JSON.parse(
    await page.evaluate(() => document.querySelector('#raw')!.textContent!),
  );
  assert.equal(job.state, 'needs_input');
  assert.equal(job.capturedParts, undefined);
  assert.equal(
    await page.evaluate(
      () => (document.querySelector('#capture-submit') as HTMLButtonElement).disabled,
    ),
    true,
  );
  await page.evaluate(() => {
    const s = document.querySelector('#capture-line-0') as HTMLSelectElement;
    s.value = '0';
    s.dispatchEvent(new Event('change'));
  });
  assert.equal(
    await page.evaluate(
      () => (document.querySelector('#capture-submit') as HTMLButtonElement).disabled,
    ),
    true,
  );
  await page.evaluate(() => {
    const s = document.querySelector('#capture-line-1') as HTMLSelectElement;
    s.value = '0';
    s.dispatchEvent(new Event('change'));
  });
  assert.equal(
    await page.evaluate(
      () => (document.querySelector('#capture-submit') as HTMLButtonElement).disabled,
    ),
    false,
  );
  await page.locator('#capture-submit').click();
  await until(
    () => page.evaluate(() => Boolean(document.querySelector('#captured'))),
    'capture completed',
  );
  job = JSON.parse(await page.evaluate(() => document.querySelector('#raw')!.textContent!));
  assert.equal(job.state, 'completed');
  assert.equal(job.capturedParts?.modelBasis, 'test_model');
  assert.equal(job.capturedParts.installedCompatibilityVerified, false);
  assert.deepEqual(
    job.capturedParts.lines.map((l) => l.partNumber),
    ['S1-33101975102', 'S1-02425893000'],
  );
  assert.equal(job.capturedParts.lines[1]!.specifications.capacitanceMfd, '40/5');
  assert.equal(job.capturedParts.lines[1]!.specifications.voltage, null);
  assert.equal(store.get(job.id)?.capturedParts?.guideSha256, job.capturedParts.guideSha256);
  assert.deepEqual(job.results, []);
  const response = await fetch(
    `http://127.0.0.1:4310${job.capturedParts.lines[0]!.evidence.documentUrl}`,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  await page.evaluate(() => document.querySelector('#captured')!.scrollIntoView());
  await page.screenshot({ path: '.local/step4-acceptance.png' });
  console.log(
    JSON.stringify(
      {
        passed: true,
        jobId: job.id,
        model: job.capturedParts.model,
        modelBasis: job.capturedParts.modelBasis,
        partNumbers: job.capturedParts.lines.map((l) => l.partNumber),
        checks: [
          'real PDF evidence',
          'explicit selection required for each line',
          'unknown specifications preserved',
          'test-model basis explicit',
          'UI → API → SQLite capture',
          'no supplier search',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await closeBrowser();
  await app.close();
}
