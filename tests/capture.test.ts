import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../src/server.js';
import {GuideResolver} from '../src/guides.js';
import {Store,type Job} from '../src/store.js';
import {captureParts,CaptureError} from '../src/capture.js';
const pages=[{page:1,text:'Johnson Controls Unitary Products 035-21220-001 Rev. E (0409) 1 of 4'},
 {page:2,text:'FIG ITEM DESCRIPTION E1RD018S06B E1RD024S06B E1RD030S06B E1RD036S06B\n1 6 Control, Defrost S1-33101975102 S1-33101975102 S1-33101975102 S1-33101975102 <\nCapacitor, Run (40/5MFD) [RC] --- --- --- S1-02425893000'}];
const input={mode:'live',stopAfter:'capture',model:'E1RD036S06B',lines:[{name:'control board',manufacturer:'York'},{name:'capacitor',manufacturer:'York'}]};
async function until(store:Store,id:string){const end=Date.now()+3000;while(Date.now()<end){const job=store.get(id)!;if(!['running','queued'].includes(job.state))return job;await new Promise(r=>setTimeout(r,10));}throw new Error('Worker timeout');}
function body(job:Job){return {expectedUpdatedAt:job.updatedAt,expectedGuideSha256:job.parts!.sha256!,modelBasis:'test_model',selections:[{lineIndex:0,candidateIndex:0},{lineIndex:1,candidateIndex:0}]};}
async function setup(fn:(ctx:{app:ReturnType<typeof createApp>['app'];store:Store;guides:GuideResolver;job:Job;path:string})=>Promise<void>,documentPages=pages){
 const dir=await mkdtemp(join(tmpdir(),'torq-capture-'));const path=join(dir,'jobs.sqlite');
 const guides=new GuideResolver(dir,{fetch:async()=>new Response('%PDF-1.4\nsynthetic transport'),extractPdf:async()=>structuredClone(documentPages)});
 const store=new Store(path);const {app}=createApp(store,guides);
 try{const r=await app.inject({method:'POST',url:'/api/searches',payload:input});const job=await until(store,r.json().id);assert.equal(job.state,'needs_input');await fn({app,store,guides,job,path});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
}
test('capture selects server-side candidates, preserves unknown specs/evidence and never searches suppliers',()=>setup(async({app,store,job,path})=>{
 const r=await app.inject({method:'POST',url:`/api/searches/${job.id}/capture`,payload:body(job)});assert.equal(r.statusCode,200);
 const saved=r.json() as Job;assert.equal(saved.state,'completed');assert.equal(saved.capturedParts?.modelBasis,'test_model');
 assert.deepEqual(saved.capturedParts?.lines.map(l=>l.partNumber),['S1-33101975102','S1-02425893000']);
 assert.equal(saved.capturedParts?.lines[1]?.specifications.capacitanceMfd,'40/5');assert.equal(saved.capturedParts?.lines[1]?.specifications.voltage,null);
 assert.equal(saved.capturedParts?.lines[0]?.evidence.modelColumn,4);assert.equal(saved.capturedParts?.installedCompatibilityVerified,false);assert.equal(saved.capturedParts?.alternativeSpecificationsVerified,false);assert.deepEqual(saved.results,[]);
 const again=await app.inject({method:'POST',url:`/api/searches/${job.id}/capture`,payload:body(job)});assert.equal(again.statusCode,200);assert.equal(again.json().capturedParts.capturedAt,saved.capturedParts?.capturedAt);
 const changed=await app.inject({method:'POST',url:`/api/searches/${job.id}/capture`,payload:{...body(job),modelBasis:'user_confirmed_model'}});assert.equal(changed.statusCode,409);
 const reopened=new Store(path);try{assert.deepEqual(reopened.get(job.id)?.capturedParts,store.get(job.id)?.capturedParts);}finally{reopened.db.close();}
}));
for(const [name,patch,code] of [
 ['missing line selection',{selections:[{lineIndex:0,candidateIndex:0}]},'SELECT_EACH_LINE_ONCE'],
 ['duplicate line selections',{selections:[{lineIndex:0,candidateIndex:0},{lineIndex:0,candidateIndex:0}]},'SELECT_EACH_LINE_ONCE'],
 ['out-of-range candidate',{selections:[{lineIndex:0,candidateIndex:5},{lineIndex:1,candidateIndex:0}]},'INVALID_COMPONENT_SELECTION'],
 ['out-of-range line',{selections:[{lineIndex:0,candidateIndex:0},{lineIndex:9,candidateIndex:0}]},'INVALID_COMPONENT_SELECTION'],
 ['stale job snapshot',{expectedUpdatedAt:'2020-01-01T00:00:00.000Z'},'STALE_JOB'],
 ['stale guide hash',{expectedGuideSha256:'0'.repeat(64)},'STALE_GUIDE'],
] as const)test(`${name} cannot be captured`,()=>setup(async({app,store,job})=>{
 const r=await app.inject({method:'POST',url:`/api/searches/${job.id}/capture`,payload:{...body(job),...patch}});
 assert.equal(r.statusCode,409);assert.equal(r.json().error,code);assert.equal(store.get(job.id)?.capturedParts,undefined);
}));
test('capture rejects supplied identifiers/specs instead of trusting client values',()=>setup(async({app,job})=>{
 for(const patch of [{partNumber:'S1-FORGED'},{modelBasis:'guessed'},{selections:[{lineIndex:0,candidateIndex:0,voltage:440}]}]) {
  const r=await app.inject({method:'POST',url:`/api/searches/${job.id}/capture`,payload:{...body(job),...patch}});assert.equal(r.statusCode,400);
 }
}));
test('cancelled jobs and absent extraction cannot be captured',()=>setup(async({app,store,job})=>{
 for(const state of ['cancelled','queued','failed'] as const){store.update(job.id,{state});assert.equal((await app.inject({method:'POST',url:`/api/searches/${job.id}/capture`,payload:body(store.get(job.id)!)})).json().error,'PARTS_NOT_READY');}
 store.update(job.id,{state:'needs_input',parts:undefined});assert.equal((await app.inject({method:'POST',url:`/api/searches/${job.id}/capture`,payload:body(job)})).json().error,'PARTS_NOT_READY');
}));
test('revalidation rejects changed/missing PDF evidence and changed candidate evidence',()=>setup(async({store,guides,job})=>{
 const request=body(job);
 await assert.rejects(()=>captureParts(store,{resolve:guides.resolve.bind(guides),pages:async()=>null},job.id,request),e=>e instanceof CaptureError&&e.code==='GUIDE_EVIDENCE_UNAVAILABLE');
 const changed=structuredClone(job.parts!);changed.lines[0]!.candidates[0]!.partNumber='S1-FORGED';
 store.update(job.id,{parts:changed});await assert.rejects(()=>captureParts(store,guides,job.id,body(store.get(job.id)!)),e=>e instanceof CaptureError&&e.code==='CANDIDATE_EVIDENCE_CHANGED');
}));
test('cancellation during evidence revalidation wins over capture completion',()=>setup(async({store,guides,job})=>{
 await assert.rejects(()=>captureParts(store,{resolve:guides.resolve.bind(guides),pages:async(hash)=>{store.update(job.id,{state:'cancelled'});return guides.pages(hash);}},job.id,body(job)),e=>e instanceof CaptureError&&e.code==='STALE_JOB');
 assert.equal(store.get(job.id)?.state,'cancelled');assert.equal(store.get(job.id)?.capturedParts,undefined);
}));

test('fresh unreadable rows cannot be resolved by selecting a remaining candidate',()=>setup(async({store,guides,job})=>{
 const broken=structuredClone(pages);broken[1]!.text+='\nCapacitor, Start --- ---';
 await assert.rejects(()=>captureParts(store,{resolve:guides.resolve.bind(guides),pages:async()=>broken},job.id,body(job)),e=>e instanceof CaptureError&&e.code==='INVALID_COMPONENT_SELECTION');
 assert.equal(store.get(job.id)?.capturedParts,undefined);
}));

test('an explicit second candidate is saved instead of silently picking the first',async()=>{
 const both=structuredClone(pages);both[1]!.text+='\nCapacitor, Start --- --- --- S1-02425062000';
 await setup(async({store,guides,job})=>{
  assert.equal(job.parts?.lines[1]?.candidates.length,2);
  const request=body(job);request.selections[1]!.candidateIndex=1;
  const result=await captureParts(store,guides,job.id,request);
  assert.equal(result.capturedParts?.lines[1]?.partNumber,'S1-02425062000');
  assert.equal(result.capturedParts?.lines[1]?.description,'Capacitor, Start');
 },both);
});
test('changed guide identity or failed model revalidation prevents capture',()=>setup(async({store,guides,job})=>{
 for(const status of ['not_found','guide_found'] as const){
  const guide=structuredClone(job.guide!);guide.status=status;guide.guide!.sha256='0'.repeat(64);
  await assert.rejects(()=>captureParts(store,{resolve:async()=>guide,pages:guides.pages.bind(guides)},job.id,body(job)),e=>e instanceof CaptureError&&e.code==='GUIDE_REVALIDATION_FAILED');
 }
 assert.equal(store.get(job.id)?.capturedParts,undefined);
}));
