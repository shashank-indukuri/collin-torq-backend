import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.js';
import {inputSchema} from '../src/domain.js';
import {SupplierError,type lookup} from '../src/suppliers.js';
import {Worker} from '../src/worker.js';
import {supplierCredentials} from '../src/supplier-credentials.js';

const evidence={url:'https://example.test/item',screenshot:'evidence.png',observedAt:new Date().toISOString()};
const credentials={username:'test-user',password:'test-secret',zip:'22201',storeNumber:'461',rememberSession:true};
const wait=async(store:Store,id:string)=>{const end=Date.now()+3000;while(Date.now()<end){const j=store.get(id)!;if(!['queued','running'].includes(j.state))return j;await new Promise(r=>setTimeout(r,10));}throw new Error('worker timeout');};

test('local supplier credentials require a private file and fail closed when missing or malformed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'torq-creds-'));const path=join(dir,'credentials.json');
 try{
  await writeFile(path,JSON.stringify({johnstone:credentials}),{mode:0o600});
  assert.deepEqual(await supplierCredentials('johnstone',path),credentials);
  await chmod(path,0o644);assert.equal(await supplierCredentials('johnstone',path),null);
  await chmod(path,0o600);await writeFile(path,'not-json');assert.equal(await supplierCredentials('johnstone',path),null);
  assert.equal(await supplierCredentials('partstown',join(dir,'missing.json')),null);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('AUTH_REQUIRED signs in once and retries the same exact supplier query once',async()=>{
 const store=new Store(':memory:');const {job}=store.create(inputSchema.parse({mode:'live',stopAfter:'sourcing',suppliers:['johnstone'],lines:[{name:'board',manufacturer:'York',partNumber:'S1-33101975102'}]}));
 let lookups=0,logins=0;const fn:typeof lookup=async()=>{lookups++;if(lookups===1)throw new SupplierError('AUTH_REQUIRED','expired');return {offers:[],evidence};};
 try{
  const worker=new Worker(store,undefined,fn,async()=>({...credentials}),async(supplier,received)=>{logins++;assert.equal(supplier,'johnstone');assert.equal(received.password,'test-secret');return {supplier,state:'authenticated',url:'https://www.johnstonesupply.com/',message:'Signed in'};});
  worker.enqueue(job.id);const done=await wait(store,job.id);
  assert.equal(logins,1);assert.equal(lookups,2);assert.equal(done.results[0]?.attempts?.[0]?.status,'no_match');assert.equal(done.state,'needs_permission');
 }finally{store.db.close();}
});

test('failed automatic sign-in does not retry the supplier query or expose credentials',async()=>{
 const store=new Store(':memory:');const {job}=store.create(inputSchema.parse({mode:'live',stopAfter:'sourcing',suppliers:['partstown'],lines:[{name:'board',manufacturer:'York',partNumber:'S1-33101975102'}]}));
 let lookups=0,logins=0;const fn:typeof lookup=async()=>{lookups++;throw new SupplierError('AUTH_REQUIRED','expired');};
 let passed:{username:string;password:string}|undefined;
 try{
  const worker=new Worker(store,undefined,fn,async()=>({...credentials}),async(supplier,received)=>{logins++;passed=received;return {supplier,state:'challenge',url:'https://www.partstown.com/login',message:'Complete supplier verification.'};});
  worker.enqueue(job.id);const done=await wait(store,job.id);
  assert.equal(logins,1);assert.equal(lookups,1);assert.equal(passed?.username,'');assert.equal(passed?.password,'');
  assert.equal(done.results[0]?.errors[0]?.code,'SITE_CHALLENGE');assert.doesNotMatch(JSON.stringify(done),/test-secret|test-user/);
 }finally{store.db.close();}
});
