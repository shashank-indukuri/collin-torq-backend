// Real-Chrome check of the arrival-panel quantity binding. No model calls.
// Fixture layout follows the reviewed Grainger product page: recommendation
// cards each carry their own Qty input, the main purchase panel carries one.
import Fastify from 'fastify';
import assert from 'node:assert/strict';
import { closeBrowser, exclusive, getBrowser } from '../src/browser.js';
import { panelQuantityValue } from '../src/sourcing-agent.js';

const card = (sku: string, price: string) =>
  `<div class="card"><p>Item ${sku}</p><p>Web Price $${price}/ each</p><label>Qty <input type="number" id="input-qty-${sku}-1" aria-label="Quantity input" value="1"></label><button>Add to Cart</button></div>`;
const panel = (qty: string) =>
  `<section class="purchase"><p>Web Price</p><p>$336.85/ each</p><label>Qty <input type="number" id="input-qty-42FL31-1" aria-label="Quantity input" value="${qty}"></label><div><p>Ship</p><p>Pickup</p><p>Expected to arrive Tue. Oct 20.</p><p>Ship to 22201 | Change</p></div></section>`;
const pages: Record<string, string> = {
  main: `<h1>YORK Defrost Control Board Kit</h1><div class="recs">${card('50PP04', '558.83')}${card('30D645', '19.99')}</div>${panel('1')}`,
  changed: `<h1>YORK Defrost Control Board Kit</h1>${panel('3')}`,
  duplicate: `${panel('1')}<aside>${panel('1')}</aside>`,
  carouselOnly: `<div class="recs">${card('50PP04', '558.83')}${card('30D645', '19.99')}<p>Expected to arrive Tue. Oct 20.</p></div>`,
};
const app = Fastify();
app.get('/:name', async (req, reply) =>
  reply.type('text/html').send(pages[(req.params as { name: string }).name] ?? '<p>missing</p>'),
);
await app.listen({ host: '127.0.0.1', port: 4313 });
try {
  await exclusive(async () => {
    const sh = await getBrowser();
    const page = await sh.browser.context.newPage();
    const quote = 'Expected to arrive Tue. Oct 20.';
    const read = async (name: string) => {
      await page.goto(`http://127.0.0.1:4313/${name}`);
      return panelQuantityValue(page, quote);
    };
    assert.equal(await read('main'), '1', 'main panel input, not a recommendation');
    assert.equal(await read('changed'), '3', 'reads the live value');
    assert.equal(await read('duplicate'), null, 'two panels print the phrase');
    assert.equal(await read('carouselOnly'), null, 'several inputs share the ancestor');
    assert.equal(await panelQuantityValue(page, 'Not on the page'), null);
    await page.close();
  });
  console.log('PASS arrival-panel quantity binding (5 checks)');
} finally {
  await closeBrowser();
  await app.close();
}
