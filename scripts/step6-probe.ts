import { createApp } from '../src/server.js';
import { getBrowser, saveEvidence } from '../src/browser.js';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
const { app, store } = createApp();
await app.listen({ host: '127.0.0.1', port: 4310 });
await getBrowser();
const terminal = createInterface({ input: process.stdin, output: process.stdout });
await terminal.question('READY: authenticate Johnstone, then RUN: ');
terminal.close();
const job = store.get('85e29717-d8d0-4b37-934a-873692a1148b')!;
if (!process.argv.includes('--skip-catalog'))
  for (const offer of job.results[0]!.offers) {
    const sh = await getBrowser();
    const page = (await sh.browser.context.activePage()) ?? (await sh.browser.context.newPage());
    await sh.browser.context.setActivePage(page);
    await page.goto(offer.sourceUrl);
    await new Promise((r) => setTimeout(r, 1500));
    const observation = await page.evaluate(() => ({
      body: document.body.innerText,
      links: Array.from(document.querySelectorAll('a[href]'))
        .filter((a) => (a as HTMLElement).innerText.trim())
        .map((a) => ({ text: (a as HTMLElement).innerText, href: (a as HTMLAnchorElement).href })),
      controls: Array.from(document.querySelectorAll('button,input,select')).map((a) => ({
        tag: a.tagName,
        text: (a as HTMLElement).innerText,
        type: a.getAttribute('type'),
        name: a.getAttribute('name'),
        id: a.id,
        placeholder: a.getAttribute('placeholder'),
        label: a.getAttribute('aria-label'),
      })),
    }));
    await writeFile(
      `.local/step6-probe-${offer.supplier}.json`,
      JSON.stringify(
        {
          url: await page.url(),
          observedAt: new Date().toISOString(),
          ...observation,
          evidence: await saveEvidence(randomUUID(), 'step6-' + offer.supplier),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log('PROBED', offer.supplier);
  }
console.log('PROBE COMPLETE; enter read-only probe commands.');
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
const commands = createInterface({ input: process.stdin, output: process.stdout });
for await (const command of commands) {
  const sh = await getBrowser();
  const page = (await sh.browser.context.activePage())!;
  const { probeAction } = await import('./step6-probe-actions.js?' + Date.now());
  await probeAction(page, command);
  await new Promise((r) => setTimeout(r, 1500));
  const snapshot = await page.evaluate(() => ({
    url: location.href,
    body: document.body.innerText,
    controls: Array.from(
      document.querySelectorAll('input,button,select,[role="radio"],[role="dialog"]'),
    )
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({
        tag: e.tagName,
        text: (e as HTMLElement).innerText,
        id: e.id,
        type: e.getAttribute('type'),
        name: e.getAttribute('name'),
        value: (e as HTMLInputElement).value,
        label: e.getAttribute('aria-label'),
        html: e.outerHTML.slice(0, 1000),
      })),
    purchaseAncestors: (() => {
      let e = document.querySelector('#input-qty-42FL31-1')?.parentElement;
      const out = [];
      for (let i = 0; e && i < 8; i++, e = e.parentElement)
        out.push({
          tag: e.tagName,
          id: e.id,
          text: e.innerText.slice(0, 7000),
          html: e.outerHTML.slice(0, 1000),
        });
      return out;
    })(),
    links: Array.from(document.querySelectorAll('a[href]'))
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ text: e.textContent, href: (e as HTMLAnchorElement).href })),
  }));
  await writeFile(`.local/step6-action-${command}.json`, JSON.stringify(snapshot, null, 2), {
    mode: 0o600,
  });
  console.log('ACTION', command, 'SAVED');
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
