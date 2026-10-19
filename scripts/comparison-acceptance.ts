import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {createApp} from '../src/server.js';
import {getBrowser,exclusive} from '../src/browser.js';
import {lookup} from '../src/suppliers.js';
import type {Job} from '../src/store.js';
let forceRecovery=false;
const {app,store}=createApp(undefined,undefined,async(id,input,line,supplier,alt)=>lookup(id,input,line,supplier,alt,{forceRecovery}));
const base='http://127.0.0.1:4310',report:{passed:boolean;startedAt:string;cases:unknown[];failure?:string}={passed:false,startedAt:new Date().toISOString(),cases:[]};
const save=()=>writeFile('.local/step6-live-report.json',JSON.stringify(report,null,2),{mode:0o600});
async function post(path:string,body:unknown){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok,`${r.status}: ${await r.clone().text()}`);return r.json() as Promise<Job>;}
async function done(id:string){const until=Date.now()+360000;let last='';while(Date.now()<until){const job=store.get(id)!;if(job.message!==last){console.log(job.message);last=job.message;}if(!['queued','running'].includes(job.state)){await exclusive(async()=>{});return store.get(id)!;}await new Promise(r=>setTimeout(r,400));}throw new Error('Comparison deadline exceeded');}
async function evidence(job:Job){const files=new Set(job.results.flatMap(l=>[...l.attempts!.flatMap(a=>a.evidence?[a.evidence.screenshot]:[]),...l.offers.flatMap(o=>o.commercial?[o.commercial.evidence.screenshot,...o.commercial.branches.map(b=>b.evidence.screenshot)]:[])]));for(const file of files){const r=await fetch(`${base}/api/searches/${job.id}/evidence/${file}`);assert.equal(r.status,200);assert.ok((await r.arrayBuffer()).byteLength>1000);}return files.size;}
await app.listen({host:'127.0.0.1',port:4310});await save();
try{
 await getBrowser();const terminal=createInterface({input:process.stdin,output:process.stdout});await terminal.question('READY: authenticate Johnstone, then RUN: ');terminal.close();
 const before=store.get(process.env.COMPARISON_SOURCE_JOB_ID??'85e29717-d8d0-4b37-934a-873692a1148b')!;assert.ok(before.sourceCapture);
 const request={expectedUpdatedAt:before.updatedAt,requestId:randomUUID()};const created=await post(`/api/searches/${before.id}/compare`,request);const replay=await post(`/api/searches/${before.id}/compare`,request);assert.equal(created.id,replay.id);
 const job=await done(created.id);await writeFile('.local/step6-live-job.json',JSON.stringify(job,null,2),{mode:0o600});assert.equal(job.state,'needs_input');assert.equal(job.comparison?.status,'needs_verification');assert.equal(job.comparison?.origin.basis,'census_zcta_reference');assert.deepEqual(store.get(before.id),before);assert.deepEqual(job.capturedParts,before.capturedParts);assert.equal(job.alternativeReview,undefined);
 assert.ok(job.results[0]!.attempts!.every(a=>a.status==='found'));assert.ok(job.results[1]!.attempts!.every(a=>a.status==='no_match'));
 const board=job.results[0]!;const pt=board.offers.find(o=>o.supplier==='partstown')!.commercial!;assert.equal(pt.status,'observed');assert.ok(pt.shipping.quantity!>=1);assert.equal(pt.branches.length,0);assert.equal(pt.price.condition,null);
 const grainger=board.offers.find(o=>o.supplier==='grainger')!.commercial!;assert.equal(grainger.shipping.destinationZip,'22201');assert.equal(grainger.shipping.quantityConfirmed,true);assert.ok(grainger.shipping.arrivalDate);assert.ok(grainger.price.amount!>0);assert.ok(grainger.branches.length>0);assert.ok(grainger.branches.every(b=>b.pickupReady!==true&&b.stockQuantity===null));
 const ranked=job.comparison!.lines[0]!.rankings;assert.equal(ranked.cheapest.winners.length,0);assert.equal(ranked.closest.winners.length,0);assert.equal(ranked.fastestShipping.winners[0]!.supplier,'grainger');assert.equal(job.comparison!.lines[1]!.rankings.fastestShipping.winners.length,0);
 const johnstone=board.offers.find(o=>o.supplier==='johnstone')!.commercial!;assert.ok(johnstone.branches[0]!.location?.point);assert.ok(store.getBranch('johnstone','461'));assert.ok(store.getBranch('grainger',grainger.branches[0]!.id));
 report.cases.push({name:'fresh capture-based three-supplier comparison, replay, origin, branch cache, honest unknowns and real ETA',jobId:job.id,evidenceFiles:await evidence(job),arrival:grainger.shipping.arrivalDate,branches:grainger.branches.length});await save();console.log('PASS full real comparison',job.id);
 const quantityJob=await done((await post('/api/searches',{mode:'live',stopAfter:'comparison',origin:{address:'Arlington, VA 22201'},suppliers:['grainger'],lines:[{name:'defrost control',manufacturer:'York',partNumber:'S1-33101975102',quantity:2}]})).id);assert.equal(quantityJob.state,'needs_input');assert.equal(quantityJob.comparison!.lines[0]!.rankings.fastestShipping.winners.length,0);assert.equal(quantityJob.results[0]!.offers[0]!.commercial!.shipping.quantityConfirmed,false);report.cases.push({name:'changed quantity does not reuse the default one-unit arrival quote',jobId:quantityJob.id,evidenceFiles:await evidence(quantityJob)});await save();console.log('PASS quantity guard');
 const normal=await done((await post('/api/searches',{mode:'live',suppliers:['johnstone','partstown','grainger'],lines:[{name:'defrost control',manufacturer:'York',partNumber:'S1-33101975102'}]})).id);assert.equal(normal.state,'completed');assert.ok(normal.results[0]!.attempts!.every(a=>a.status==='found'));assert.ok(normal.results[0]!.offers.every(o=>!o.commercial));report.cases.push({name:'Step 5 all-three-supplier regression after comparison panels',jobId:normal.id,evidenceFiles:await evidence(normal)});await save();
 for(const supplier of ['johnstone','partstown','grainger'] as const){
 forceRecovery=true;let model:Job;try{model=await done((await post('/api/searches',{mode:'live',suppliers:[supplier],lines:[{name:'defrost control',manufacturer:'York',partNumber:'S1-33101975102'}]})).id);}finally{forceRecovery=false;}
 assert.equal(model.state,'completed');assert.equal(model.results[0]!.attempts![0]!.recovery?.navigationVerified,true);assert.equal(model.results[0]!.offers[0]!.match,'exact');report.cases.push({name:`real Browser Use/Ollama ${supplier} recovery after comparison`,jobId:model.id,evidenceFiles:await evidence(model)});await save();console.log('PASS real model recovery',supplier);
 }
 report.passed=true;await save();console.log('ALL STEP 6 LIVE CASES PASSED');
}catch(error){report.failure=error instanceof Error?error.message:String(error);await save();await app.close();throw error;}
if(process.argv.includes('--serve')){for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0));});console.log('Normal backend remains available; force disabled.');}else await app.close();
