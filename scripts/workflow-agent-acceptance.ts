import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {getBrowser,closeBrowser,recoverWorkflow} from '../src/browser.js';
const app=Fastify(),token=randomUUID();
app.get('/',async(_,reply)=>reply.type('text/html').send(`<h1>York TEST-123 control</h1><button type="button" id="random-${token}" onclick="document.querySelector('section').hidden=false">Inspect local pickup inventory</button><section hidden><p>Arlington #100 Quantity Available: 3</p></section><button onclick="window.cartTouched=true">Add to cart</button>`));
await app.listen({host:'127.0.0.1',port:4312});
try{
 const sh=await getBrowser(),page=await sh.browser.context.newPage();await sh.browser.context.setActivePage(page);await page.goto('http://127.0.0.1:4312/');
 const result=await recoverWorkflow('Open the local pickup inventory panel, then stop. Use read_document control IDs with click_or_fill_control, not browser DOM element indices.','127.0.0.1',[]);
 const resumed=await getBrowser(),active=(await resumed.browser.context.activePage())!;
 const actual=await active.evaluate(()=>({visible:!(document.querySelector('section') as HTMLElement).hidden,cartTouched:Boolean((window as unknown as {cartTouched:boolean}).cartTouched)}));
 await writeFile('.local/workflow-agent-acceptance.json',JSON.stringify({result,actual},null,2),{mode:0o600});
 assert.equal(actual.visible,true);assert.equal(actual.cartTouched,false);console.log('PASS Browser Use discovered an unknown control and opened inventory; cart untouched');
}finally{await closeBrowser();await app.close();}
