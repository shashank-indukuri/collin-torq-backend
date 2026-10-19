// Opens Grainger in the backend's own Chrome profile so a person can clear a
// verification page by hand. It never interacts with the challenge itself: it
// only polls the page text and exits once the product page renders.
import { closeBrowser, exclusive, getBrowser } from '../src/browser.js';

const url =
  'https://www.grainger.com/product/YORK-Defrost-Control-Board-Kit-42FL31?searchQuery=S1-33101975102';
const deadline = Date.now() + 15 * 60 * 1000;
try {
  await exclusive(async () => {
    const sh = await getBrowser();
    const page = await sh.browser.context.newPage();
    await sh.browser.context.setActivePage(page);
    await page.goto(url);
    console.log('OPENED', url);
    for (;;) {
      const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
      if (
        !/Verification Required|Slide right to secure/i.test(text) &&
        /S1-331-01975-102/.test(text)
      ) {
        console.log('CLEARED product page rendered');
        return;
      }
      if (Date.now() > deadline) {
        console.log('TIMEOUT verification still shown after 15 minutes');
        return;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  });
} finally {
  await closeBrowser();
}
