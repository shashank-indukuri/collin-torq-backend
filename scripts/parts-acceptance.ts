import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { GuideResolver } from '../src/guides.js';
import { getBrowser, closeBrowser } from '../src/browser.js';
import type { Job } from '../src/store.js';
const { app, store } = createApp(undefined, new GuideResolver());
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
  for (const model of ['E1RD036', 'E1RD036S46B']) {
    const r = await fetch('http://127.0.0.1:4310/api/guides/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manufacturer: 'York', model, lines: [{ name: 'capacitor' }] }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.parts.status, 'blocked');
    assert.deepEqual(body.parts.lines, []);
  }
  const sh = await getBrowser();
  const page = await sh.browser.context.newPage();
  await page.goto('http://127.0.0.1:4310');
  await until(
    () =>
      page.evaluate(() =>
        Boolean((document.querySelector('#request') as HTMLTextAreaElement)?.value),
      ),
    'default step 3 test intake',
  );
  await page.locator('#step3').click();
  await until(
    () =>
      page.evaluate(
        () =>
          JSON.parse((document.querySelector('#request') as HTMLTextAreaElement).value)
            .stopAfter === 'parts',
      ),
    'step 3 selected',
  );
  const input = await page.evaluate(() =>
    JSON.parse((document.querySelector('#request') as HTMLTextAreaElement).value),
  );
  assert.equal(input.model, 'E1RD036S06B');
  assert.equal(input.stopAfter, 'parts');
  await page.locator('#run').click();
  await until(
    () =>
      page.evaluate(() => {
        const text = document.querySelector('#raw')?.textContent;
        return Boolean(text && JSON.parse(text).parts?.status === 'needs_input');
      }),
    'part ambiguity rendered',
  );
  let job: Job = JSON.parse(
    await page.evaluate(() => document.querySelector('#raw')!.textContent!),
  );
  assert.equal(job.state, 'needs_input');
  assert.equal(job.results.length, 0);
  const board = job.parts!.lines[0]!;
  const capacitor = job.parts!.lines[1]!;
  assert.equal(board.status, 'needs_part_confirmation');
  assert.equal(board.candidates[0]!.partNumber, 'S1-33101975102');
  assert.equal(capacitor.status, 'extracted');
  assert.equal(capacitor.candidates[0]!.partNumber, 'S1-02425893000');
  assert.equal(capacitor.candidates[0]!.specifications.capacitanceMfd, '40/5');
  assert.equal(capacitor.candidates[0]!.specifications.voltage, null);
  for (const line of job.parts!.lines) {
    assert.equal(line.candidates[0]!.evidence.page, 2);
    assert.equal(line.candidates[0]!.evidence.modelColumn, 4);
  }
  assert.equal(store.get(job.id)?.parts?.lines[1]?.candidates[0]?.partNumber, 'S1-02425893000');
  const source = await fetch(
    `http://127.0.0.1:4310${capacitor.candidates[0]!.evidence.documentUrl}`,
  );
  assert.equal(source.status, 200);
  assert.equal(source.headers.get('content-type'), 'application/pdf');
  await page.evaluate(() => document.querySelector('#parts')!.scrollIntoView());
  await page.screenshot({ path: '.local/step3-acceptance.png' });
  await page.evaluate(() => {
    const el = document.querySelector('#request') as HTMLTextAreaElement;
    const body = JSON.parse(el.value);
    body.lines[0].name = 'defrost control';
    body.lines[1].name = 'run capacitor';
    el.value = JSON.stringify(body, null, 2);
  });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Submit edited request as clarification')!
      .click(),
  );
  await until(
    () =>
      page.evaluate(
        () => document.querySelector('#state')?.textContent?.startsWith('completed') ?? false,
      ),
    'clarification completes extraction',
  );
  job = JSON.parse(await page.evaluate(() => document.querySelector('#raw')!.textContent!));
  assert.equal(job.parts?.status, 'extracted');
  assert.equal(job.results.length, 0);
  assert.equal(store.get(job.id)?.state, 'completed');
  console.log(
    JSON.stringify(
      {
        passed: true,
        jobId: job.id,
        model: job.parts.model,
        sha256: job.parts.sha256,
        parts: job.parts.lines.map((l) => ({
          name: l.name,
          partNumber: l.candidates[0]?.partNumber,
          status: l.status,
        })),
        checks: [
          'prefix blocked',
          'wrong suffix blocked',
          'real PDF row and model column',
          'unknown voltage preserved',
          'board terminology confirmation',
          'UI clarification',
          'SQLite persistence',
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
