import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { getBrowser, closeBrowser } from '../src/browser.js';
import type { Job } from '../src/store.js';
const {app,store}=createApp();
await app.listen({host:'127.0.0.1',port:4310});
async function until(check:()=>Promise<boolean>,label:string){const end=Date.now()+60000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,300));}throw new Error(`Timed out: ${label}`);}
try{
  const sh=await getBrowser();const ui=await sh.browser.context.newPage();
  await ui.goto('http://127.0.0.1:4310');
  await until(()=>ui.evaluate(()=>Boolean((document.querySelector('#request') as HTMLTextAreaElement)?.value)),'example loaded');
  await ui.locator('#example').click();
  await until(()=>ui.evaluate(()=>JSON.parse((document.querySelector('#request') as HTMLTextAreaElement).value).mode==='fixture'),'fixture loaded');
  await ui.locator('#run').click();
  await until(()=>ui.evaluate(()=>document.querySelector('#state')?.textContent?.startsWith('needs_permission')??false),'permission state rendered');
  let job:Job=JSON.parse(await ui.evaluate(()=>document.querySelector('#raw')!.textContent!));
  assert.equal(job.results[0].offers.length,1);assert.equal(job.results[0].offers[0].match,'exact');
  assert.equal(job.results[1].offers.length,0);
  assert.equal(job.input.allowAlternatives,false);
  // Use the actual UI button and client fetch, not a direct call to the worker.
  await ui.evaluate(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Allow alternatives');if(!b)throw new Error('Missing permission button');b.click();});
  await until(()=>ui.evaluate(()=>document.querySelector('#state')?.textContent?.startsWith('completed')??false),'completion rendered');
  job=JSON.parse(await ui.evaluate(()=>document.querySelector('#raw')!.textContent!));
  assert.equal(job.input.allowAlternatives,true);assert.equal(job.results[1].offers.length,3);
  assert.ok(job.results[1].offers.every(o=>o.match==='alternative'&&o.synthetic&&!o.eligible));
  assert.equal(store.get(job.id)?.state,'completed');
  const ev=job.results[0].offers[0].evidence;
  const r=await fetch(`http://127.0.0.1:4310/api/searches/${job.id}/evidence/${ev}`);
  assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');
  await ui.screenshot({path:'.local/acceptance.png'});
  console.log('PASS UI → API → Stagehand browser → SQLite → alternatives permission → results and evidence',job.id);
}finally{await closeBrowser();await app.close();}
