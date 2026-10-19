import Fastify from 'fastify';
import { z } from 'zod';
import assert from 'node:assert/strict';
import { exclusive, getBrowser, recover, closeBrowser } from '../src/browser.js';
import { registerFixtures } from '../src/fixture.js';
import { usage } from '../src/ollama.js';
const app = Fastify(); registerFixtures(app);
await app.listen({host:'127.0.0.1',port:4311});
try {
  await exclusive(async () => {
    let sh = await getBrowser();
    const page = await sh.browser.context.newPage();
    await sh.browser.context.setActivePage(page);
    const url = 'http://127.0.0.1:4311/fixtures/johnstone?q=S1-33101975102&recovery=1';
    await page.goto(url);
    // Real Browser Use + Ollama executes recovery, not a canned action.
    const recovery = process.argv.includes('--stagehand-only')
      ? (await page.locator('#reveal').click(), {successful:true})
      : await recover(url, 'Click the Show availability button once, then finish.', ['127.0.0.1']);
    sh = await getBrowser();
    const resumed = (await sh.browser.context.pages()).find(p => p.pageId === page.pageId);
    assert.ok(resumed, 'Shared page survived Browser Use disconnect');
    await sh.browser.context.setActivePage(resumed);
    assert.equal(await resumed.evaluate(() => (document.querySelector('#details') as HTMLElement).hidden), false);
    if(!process.argv.includes('--stagehand-only')) console.log('PASS Browser Use/Ollama action and shared-browser handoff', recovery.successful);
    const schema = z.object({partNumber:z.string(),price:z.number(),stockQuantity:z.number()});
    const result = await sh.extract('Read the manufacturer partNumber, price, and stockQuantity from the product details JSON on this page. Copy exactly.',schema);
    assert.equal(result.data.partNumber,'S1-33101975102'); assert.equal(result.data.price,196.72); assert.equal(result.data.stockQuantity,0);
    console.log('PASS Stagehand/Ollama structured extraction', JSON.stringify(result.data));
    await resumed.goto(url);
    await sh.act('Click the button labelled Show availability once.');
    assert.equal(await resumed.evaluate(() => (document.querySelector('#details') as HTMLElement).hidden), false);
    console.log('PASS Stagehand/Ollama semantic browser action');
    await resumed.screenshot({path:'.local/smoke.png'});
    console.log(JSON.stringify({stagehandUsage:usage,paidServicesEnabled:false}));
  });
} finally { await closeBrowser(); await app.close(); }
