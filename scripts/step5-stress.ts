import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {createApp} from '../src/server.js';
import {lookup} from '../src/suppliers.js';
import {exclusive,getBrowser} from '../src/browser.js';
import {config} from '../src/config.js';
import {suppliers,normalizePart} from '../src/domain.js';
import type {Job} from '../src/store.js';

// Owns the normal local backend/browser. Stop npm start before running.
// Force is process-local test instrumentation, never an API request option.
let forceRecovery=false;let lookupCount=0;
const {app,store}=createApp(undefined,undefined,async(id,input,line,supplier,alternatives)=>{lookupCount++;return lookup(id,input,line,supplier,alternatives,{forceRecovery});});
const base=`http://127.0.0.1:${config.port}`;
const report:{startedAt:string;passed:boolean;cases:{name:string;jobId:string;durationMs:number;attempts:unknown[]}[];failure?:string}={startedAt:new Date().toISOString(),passed:false,cases:[]};
async function save(){await writeFile('.local/step5-stress-report.json',JSON.stringify(report,null,2));}
async function post(path:string,body:unknown,key?:string){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(key?{'idempotency-key':key}:{})},body:JSON.stringify(body)});assert.ok(r.ok,`${path}: ${r.status} ${await r.clone().text()}`);return await r.json() as Job;}
async function done(id:string){const end=Date.now()+360000;let last='';while(Date.now()<end){const j=store.get(id)!;if(j.message!==last){console.log(j.message);last=j.message;}if(!['queued','running'].includes(j.state)){await exclusive(async()=>{});return store.get(id)!;}await new Promise(r=>setTimeout(r,200));}throw new Error('Stress job deadline exceeded');}
async function evidence(j:Job){for(const a of j.results.flatMap(l=>l.attempts??[])){assert.ok(a.evidence);const r=await fetch(`${base}/api/searches/${j.id}/evidence/${a.evidence.screenshot}`);assert.equal(r.status,200);assert.ok((await r.arrayBuffer()).byteLength>1000);}}
const board={name:'defrost control',manufacturer:'York',partNumber:'S1-33101975102',quantity:1};const capacitor={name:'capacitor',manufacturer:'York',partNumber:'S1-02425893000',quantity:1};
const input=(scope:readonly string[]=suppliers,lines=[board])=>({mode:'live',stopAfter:'sourcing',suppliers:scope,lines,allowAlternatives:false});
async function scenario(name:string,body:unknown,check:(j:Job)=>void|Promise<void>){const started=Date.now();console.log('CASE',name);const job=await post('/api/searches',body);const j=await done(job.id);await check(j);await evidence(j);report.cases.push({name,jobId:j.id,durationMs:Date.now()-started,attempts:j.results.flatMap(l=>l.attempts??[]).map(a=>({supplier:a.supplier,query:a.query,status:a.status,code:a.code,recovery:a.recovery}))});await save();console.log('PASS',name);return j;}
function exact(j:Job){assert.equal(j.state,'completed');for(const l of j.results){assert.equal(l.errors.length,0);assert.equal(l.attempts?.length,j.input.suppliers.length);assert.ok(l.attempts.every(a=>a.status==='found'));assert.ok(l.offers.every(o=>o.match==='exact'&&normalizePart(o.partNumber)===normalizePart(board.partNumber)&&!o.synthetic&&!o.eligible&&o.stockQuantity===null&&o.pickupReady===null));}}
await app.listen({host:'127.0.0.1',port:config.port});
await save();
try{
 await getBrowser();
 const terminal=createInterface({input:process.stdin,output:process.stdout});await terminal.question('READY: connect supplier accounts through the local login API, then enter RUN: ');terminal.close();
 for(let round=1;round<=2;round++)await scenario(`normal exact and absent / round ${round}`,input(suppliers,[board,capacitor]),j=>{assert.equal(j.state,'needs_permission');assert.ok(j.results.every(l=>l.errors.length===0));assert.ok(j.results[0]!.attempts?.every(a=>a.status==='found'));assert.ok(j.results[1]!.attempts?.every(a=>a.status==='no_match'));});
 forceRecovery=true;
 for(let round=1;round<=2;round++)for(const supplier of suppliers)await scenario(`forced local model / ${supplier} / round ${round}`,input([supplier]),j=>{exact(j);assert.deepEqual(j.results[0]!.attempts?.[0]?.recovery,{attempted:true,navigationVerified:true});});
 const originalModel=config.model;
 try{config.model='torq-deliberately-missing-model:regression';await scenario('Ollama missing model fails closed',input(['partstown']),j=>{assert.equal(j.state,'partial');assert.equal(j.results[0]!.offers.length,0);assert.equal(j.results[0]!.attempts?.[0]?.status,'error');assert.equal(j.results[0]!.attempts?.[0]?.recovery?.navigationVerified,false);});}finally{config.model=originalModel;}
 const originalTimeout=config.modelTimeout;
 try{config.modelTimeout=50;await scenario('recovery timeout fails closed and releases ownership',input(['partstown']),j=>{assert.equal(j.state,'partial');assert.equal(j.results[0]!.offers.length,0);assert.equal(j.results[0]!.attempts?.[0]?.status,'error');});}finally{config.modelTimeout=originalTimeout;}
 forceRecovery=false;await scenario('normal search succeeds after recovery failures',input(['partstown']),exact);
 // Race many identical submissions while real browser work is running.
 const before=lookupCount;const key='step5-stress-'+Date.now();const responses=await Promise.all(Array.from({length:20},()=>post('/api/searches',input(['partstown']),key)));
 assert.equal(new Set(responses.map(j=>j.id)).size,1);const duplicate=await done(responses[0]!.id);exact(duplicate);assert.equal(lookupCount-before,1);await evidence(duplicate);report.cases.push({name:'20 duplicate concurrent API requests execute one lookup',jobId:duplicate.id,durationMs:0,attempts:duplicate.results.flatMap(l=>l.attempts??[])});await save();
 forceRecovery=true;const cancelStart=lookupCount;const cancelJob=await post('/api/searches',input());
 while(lookupCount===cancelStart)await new Promise(r=>setTimeout(r,30));
 await post(`/api/searches/${cancelJob.id}/cancel`,{});await exclusive(async()=>{});
 assert.equal(store.get(cancelJob.id)?.state,'cancelled');assert.equal(lookupCount-cancelStart,1);report.cases.push({name:'cancel during real model navigation stops subsequent suppliers',jobId:cancelJob.id,durationMs:0,attempts:[]});await save();
 forceRecovery=false;await scenario('normal search succeeds after cancellation',input(['partstown']),exact);
 report.passed=true;await save();console.log('ALL STEP 5 STRESS CASES PASSED',JSON.stringify(report,null,2));
}catch(e){report.failure=e instanceof Error?e.message:String(e);await save();await app.close();throw e;}
if(process.argv.includes('--serve')){console.log('Stress instrumentation disabled. Normal local backend remains available.');for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0));});}
else await app.close();
