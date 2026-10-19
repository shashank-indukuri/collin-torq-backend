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
  const ui = await sh.browser.context.newPage();
  await ui.goto('http://127.0.0.1:4310');
  await until(
    () =>
      ui.evaluate(() =>
        Boolean((document.querySelector('#request') as HTMLTextAreaElement)?.value),
      ),
    'step 2 intake',
  );
  await ui.locator('#step2').click();
  await until(
    () =>
      ui.evaluate(
        () =>
          JSON.parse((document.querySelector('#request') as HTMLTextAreaElement).value)
            .stopAfter === 'guide',
      ),
    'step 2 selected',
  );
  const input = await ui.evaluate(() =>
    JSON.parse((document.querySelector('#request') as HTMLTextAreaElement).value),
  );
  assert.equal(input.model, 'York - E1RD036');
  assert.equal(input.stopAfter, 'guide');
  await ui.locator('#run').click();
  await until(
    () =>
      ui.evaluate(
        () => document.querySelector('#state')?.textContent?.startsWith('needs_input') ?? false,
      ),
    'prefix confirmation rendered',
  );
  let job: Job = JSON.parse(await ui.evaluate(() => document.querySelector('#raw')!.textContent!));
  assert.equal(job.guide?.status, 'needs_model_confirmation');
  assert.equal(job.results.length, 0);
  assert.equal(store.get(job.id)?.guide?.guide?.sha256, job.guide?.guide?.sha256);
  const response = await fetch(`http://127.0.0.1:4310${job.guide!.guide!.evidenceUrl}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  await ui.evaluate(() => document.querySelector('#job')!.scrollIntoView());
  await ui.screenshot({ path: '.local/guide-prefix-acceptance.png' });
  // Deliberately supply a suffix absent from the document; UI must remain paused.
  await ui.evaluate(() => {
    const el = document.querySelector('#request') as HTMLTextAreaElement;
    const body = JSON.parse(el.value);
    body.model = 'E1RD036S46B';
    el.value = JSON.stringify(body, null, 2);
  });
  await ui.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Submit edited request as clarification')!
      .click(),
  );
  await until(
    () =>
      ui.evaluate(() => {
        const text = document.querySelector('#raw')?.textContent;
        if (!text) return false;
        const job = JSON.parse(text);
        return (
          job.input.model === 'E1RD036S46B' &&
          job.state === 'needs_input' &&
          job.guide?.status === 'not_found'
        );
      }),
    'wrong suffix rejected in UI',
  );
  // This is a test assertion of a listed model, not a claim that Collin confirmed it.
  await ui.evaluate(() => {
    const el = document.querySelector('#request') as HTMLTextAreaElement;
    const body = JSON.parse(el.value);
    body.model = 'E1RD036S06B';
    el.value = JSON.stringify(body, null, 2);
  });
  await ui.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Submit edited request as clarification',
    );
    if (!b) throw new Error('Missing clarification control');
    b.click();
  });
  await until(
    () =>
      ui.evaluate(
        () => document.querySelector('#state')?.textContent?.startsWith('completed') ?? false,
      ),
    'listed model coverage rendered',
  );
  job = JSON.parse(await ui.evaluate(() => document.querySelector('#raw')!.textContent!));
  assert.equal(job.guide?.status, 'guide_found');
  assert.equal(job.guide.cacheHit, true);
  assert.equal(job.results.length, 0);
  assert.equal(store.get(job.id)?.state, 'completed');
  console.log(
    'PASS Step 2 UI → API → real guide PDF → SQLite → model clarification → verified cached model coverage',
    job.id,
  );
} finally {
  await closeBrowser();
  await app.close();
}
