import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:4310',journey=JSON.parse(await readFile('.local/guided-live-e2e.json','utf8'));
assert.equal(journey.passed,true);
const capturedId=journey.cases[0].jobId,sourceId=journey.cases[1].jobId,id=journey.jobId;
const cases:{name:string;status:number;outcome?:string}[]=[];
async function post(path:string,body:unknown,status:number){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const value=await r.json() as any;assert.equal(r.status,status,JSON.stringify(value));return value;}
const health=await fetch(base+'/api/health').then(r=>r.json()) as any;
for(const [name,manufacturer,model,expected] of [['prefix ambiguity','York','E1RD036','needs_model_confirmation'],['exact guide coverage','York','E1RD036S06B','guide_found'],['wrong suffix','York','E1RD036S46B','not_found'],['unsupported manufacturer','Carrier','UNKNOWN-123','not_found']]){
 const value=await post('/api/guides/resolve',{manufacturer,model},200);assert.equal(value.status,expected);cases.push({name:name!,status:200,outcome:value.status});
}
let value=await post('/api/searches',{mode:'live',lines:[{name:'board',manufacturer:'York',partNumber:'TEST-123',quantity:0}]},400);cases.push({name:'invalid quantity rejected before supplier work',status:400,outcome:value.error});
value=await post(`/api/searches/${capturedId}/source`,{expectedCapturedAt:'2000-01-01T00:00:00Z',suppliers:['johnstone']},409);cases.push({name:'stale captured handoff rejected',status:409,outcome:value.error});
const captured=await fetch(`${base}/api/searches/${capturedId}`).then(r=>r.json()) as any;
value=await post(`/api/searches/${capturedId}/alternatives/review`,{expectedUpdatedAt:captured.updatedAt,allow:true},409);cases.push({name:'alternative review blocked before complete exact sourcing',status:409,outcome:value.error});
value=await post(`/api/searches/${sourceId}/alternatives`,{allow:true},409);cases.push({name:'unsafe generic alternative path cannot bypass captured specifications',status:409,outcome:value.error});
const reviewed=await fetch(`${base}/api/searches/${id}`).then(r=>r.json()) as any;
value=await post(`/api/searches/${id}/alternatives/review`,{expectedUpdatedAt:reviewed.alternativeReview.requestBasisUpdatedAt,allow:true},200);assert.equal(value.alternativeReview.requestedAt,reviewed.alternativeReview.requestedAt);assert.deepEqual(value.results,reviewed.results);assert.ok(!['queued','running'].includes(value.state));cases.push({name:'repeated consent reuses review without re-running suppliers',status:200});
value=await post(`/api/searches/${id}/alternatives/review`,{expectedUpdatedAt:reviewed.alternativeReview.requestBasisUpdatedAt,allow:true,installedVoltageVac:440},409);cases.push({name:'conflicting replay cannot change specifications',status:409,outcome:value.error});
value=await post(`/api/searches/${id}/compare`,{expectedUpdatedAt:reviewed.updatedAt},409);cases.push({name:'nested comparison rejected',status:409,outcome:value.error});
const after=await fetch(base+'/api/health').then(r=>r.json()) as any;assert.equal(after.usage.calls,health.usage.calls);
await writeFile('.local/journey-api-negative.json',JSON.stringify({passed:true,cases,modelCalls:after.usage.calls-health.usage.calls},null,2),{mode:0o600});console.log('PASS',cases.length,'real API clarification, failure and replay checks; no backend inference');
