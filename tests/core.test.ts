import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { inputSchema, assess, rank } from '../src/domain.js';
import { fixtureOffer } from '../src/fixture.js';
import { createApp } from '../src/server.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const input = inputSchema.parse({lines:[{name:'board',manufacturer:'York',partNumber:'S1-33101975102',quantity:2}]});
const evidence={url:'http://127.0.0.1:4310/fixtures/johnstone',screenshot:'proof.png',observedAt:new Date().toISOString()};
test('matching part number from another manufacturer is not an exact match',()=>{
  const raw=fixtureOffer('johnstone','control board')!;raw.manufacturer='Unrelated';
  const result=assess(raw,input.lines[0],'johnstone',evidence,true);
  assert.equal(result.match,'unverified');assert.equal(result.eligible,false);assert.equal(rank([result],2).cheapest,null);
});
test('manufacturer casing and surrounding whitespace do not change exact identity',()=>{
 const raw=fixtureOffer('johnstone','control board')!;
 assert.equal(assess({...raw,manufacturer:'  YORK '},{...input.lines[0]!,manufacturer:' York '},'partstown',evidence,false).match,'exact');
 assert.equal(assess({...raw,manufacturer:'York Other'},input.lines[0]!,'partstown',evidence,false).match,'unverified');
});
test('unknown stock and future pickup do not become immediate pickup',()=>{
  const raw=fixtureOffer('johnstone','control board')!;
  const result=assess(raw,input.lines[0],'johnstone',evidence,true);
  assert.equal(result.match,'exact');assert.equal(result.total,393.44);assert.equal(rank([result],2).pickup.length,0);
  raw.stockQuantity=null;raw.pickupReady=true;
  assert.equal(rank([assess(raw,input.lines[0],'johnstone',evidence,true)],2).pickup.length,0);
});
test('package quantity changes total and unknown units exclude ranking',()=>{
  const raw=fixtureOffer('johnstone','control board')!;raw.packSize=3;raw.unit='pack';
  assert.equal(assess(raw,input.lines[0],'johnstone',evidence,true).total,196.72);
  raw.unit='foot';assert.equal(assess(raw,input.lines[0],'johnstone',evidence,true).eligible,false);
});
test('alternative candidates are never promoted to exact or eligible',()=>{
  const result=assess(fixtureOffer('partstown','control board')!,input.lines[0],'partstown',evidence,true,true);
  assert.equal(result.match,'alternative');assert.equal(result.eligible,false);
});
test('price with insufficient or unknown availability cannot win cheapest sourcing',()=>{
  const raw=fixtureOffer('johnstone','control board')!;raw.pickupReady=true;raw.stockQuantity=1;
  const short=assess(raw,input.lines[0],'johnstone',evidence,true);
  assert.equal(short.total,393.44);assert.equal(short.eligible,false);assert.equal(rank([short],2).cheapest,null);
  raw.stockQuantity=2;const sufficient=assess(raw,input.lines[0],'johnstone',evidence,true);
  assert.equal(sufficient.eligible,true);assert.equal(rank([sufficient],2).cheapest?.partNumber,raw.partNumber);
});
test('idempotency reuses identical requests and rejects a changed body',()=>{
  const store=new Store(':memory:');
  const a=store.create(input,'request-1');const b=store.create(input,'request-1');
  assert.equal(a.job.id,b.job.id);assert.equal(b.reused,true);
  assert.throws(()=>store.create({...input,model:'changed'},'request-1'),/IDEMPOTENCY_CONFLICT/);store.db.close();
});
test('jobs and permission decisions survive closing and reopening SQLite',()=>{
  const dir=mkdtempSync(join(tmpdir(),'torq-test-'));const path=join(dir,'test.sqlite');
  try{let store=new Store(path);const {job}=store.create(input,'durable');store.update(job.id,{state:'needs_permission',input:{...input,allowAlternatives:false}});store.db.close();
    store=new Store(path);assert.equal(store.get(job.id)?.state,'needs_permission');assert.equal(store.get(job.id)?.input.allowAlternatives,false);assert.equal(store.create(input,'durable').job.id,job.id);store.db.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('API rejects cross-origin writes and invalid input, enforces permission state',async()=>{
  const {app,worker,store}=createApp(new Store(':memory:'));
  worker.enqueue=()=>{};
  try{
    const blocked=await app.inject({method:'POST',url:'/api/searches',headers:{origin:'https://untrusted.example'},payload:input});assert.equal(blocked.statusCode,403);
    const invalid=await app.inject({method:'POST',url:'/api/searches',payload:{lines:[]}});assert.equal(invalid.statusCode,400);
    const r=await app.inject({method:'POST',url:'/api/searches',headers:{'idempotency-key':'stable'},payload:input});assert.equal(r.statusCode,202);
    const id=r.json().id;
    const repeat=await app.inject({method:'POST',url:'/api/searches',headers:{'idempotency-key':'stable'},payload:input});assert.equal(repeat.json().id,id);
    const premature=await app.inject({method:'POST',url:`/api/searches/${id}/alternatives`,payload:{allow:true}});assert.equal(premature.statusCode,409);
    store.update(id,{state:'needs_permission'});
    const denied=await app.inject({method:'POST',url:`/api/searches/${id}/alternatives`,payload:{allow:false}});assert.equal(denied.json().state,'completed');assert.equal(denied.json().input.allowAlternatives,false);
    const missing=await app.inject({url:'/api/searches/missing'});assert.equal(missing.statusCode,404);
  }finally{await app.close();}
});
