import type { Page } from '@browserbasehq/stagehand';
import { writeFile } from 'node:fs/promises';
export async function probeAction(page: Page, command: string) {
  if (command === 'grainger')
    await page.goto('https://www.grainger.com/product/YORK-Defrost-Control-Board-Kit-42FL31');
  if (command === 'johnstone')
    await page.goto('https://www.johnstonesupply.com/product-view?pID=L41-755');
  if (command === 'store') await page.goto('https://www.johnstonesupply.com/store461');
  if (command === 'partstown')
    await page.goto('https://www.partstown.com/p/york/yorks1-33101975102');
  if (command === 'zip') await page.locator('button[aria-label^="Change zipcode"]').click();
  if (command === 'fill22201') await page.locator('#rta-zip').fill('22201');
  if (command === 'submitzip') await page.locator('button[aria-label="Save ZIP Code"]').click();
  if (command === 'pickup') await page.locator('#rta-options-pickup-1').click();
  if (command === 'ship') await page.locator('#rta-options-ship-1').click();
  if (command === 'branches')
    await page.locator('button[aria-label^="Change pickup branch"]').click();
  if (command === 'branch22201') {
    await page.locator('[data-testid="fab-search"]').fill('22201');
    await page.keyPress('Enter');
  }
  if (command === 'qty2') {
    await page.locator('#input-qty-42FL31-1').fill('2');
    await page.locator('h1').click();
  }
  if (command === 'panels') {
    const value = await page.evaluate(() => {
      let e = document.querySelector('#input-qty-42FL31-1')?.parentElement;
      const out = [];
      for (let i = 0; e && i < 18; i++, e = e.parentElement)
        out.push({
          tag: e.tagName,
          id: e.id,
          inputs: e.querySelectorAll('input[id^="input-qty-"]').length,
          text: e.innerText.slice(0, 9000),
          html: e.outerHTML.slice(0, 200),
        });
      return out;
    });
    await writeFile('.local/step6-grainger-panels.json', JSON.stringify(value, null, 2));
  }
  if (command === 'offers')
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('a,button')).find((e) =>
        /more purchase options for shipping/i.test(e.textContent ?? ''),
      ) as HTMLElement | undefined;
      if (!b) throw new Error('Shipping options unavailable');
      b.click();
    });
}
