import assert from 'node:assert/strict';
import { getBrowser, recover, closeBrowser } from '../src/browser.js';
try {
  let sh = await getBrowser();
  const page = await sh.browser.context.newPage();
  await sh.browser.context.setActivePage(page);
  const url = 'https://www.johnstonesupply.com/search?searchPhrase=S1-33101975102';
  await page.goto(url);
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .filter((a) => (a as HTMLAnchorElement).href.includes('/product-view'))
      .slice(0, 6)
      .map((a) => ({ url: (a as HTMLAnchorElement).href, text: (a.textContent ?? '').trim() })),
  );
  assert.ok(links.length, 'Need observed Johnstone product links');
  console.log('Allowed candidates', JSON.stringify(links));
  const targetId = page.pageId;
  const result = await recover(
    url,
    'Open the Source 1 Defrost Control product for exact manufacturer part S1-33101975102. The catalog item is L41-755. Use open_product only.',
    ['www.johnstonesupply.com'],
    { kind: 'product', partNumber: 'S1-33101975102', candidates: links },
  );
  sh = await getBrowser();
  const current = await sh.browser.context.activePage();
  assert.equal(current?.pageId, targetId);
  const body = await current!.evaluate(() => document.body.innerText);
  assert.ok(body.includes('S1-33101975102'));
  assert.match(await current!.url(), /product-view/);
  assert.equal(result.successful, true);
  console.log(
    'PASS real Browser Use + local Qwen chose a bounded product, original tab retained, Stagehand reattached, exact visible part verified',
    await current!.url(),
  );
} finally {
  await closeBrowser();
}
