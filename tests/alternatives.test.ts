import {tmpdir} from 'node:os';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,rm,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {alternativeSources,parseSupplierReplacement,parseOemCapacitor,verifyReplacement,startAlternativeReview,reviewAlternatives,type ReferenceSnapshot,parseOemSubstitute,replacementChain,rememberAlternativeReference,cachedAlternativeReference} from '../src/alternatives.js';
import {Store,type Job} from '../src/store.js';
import {inputSchema,assess} from '../src/domain.js';
import {fixtureOffer} from '../src/fixture.js';
import {createApp} from '../src/server.js';
import type {lookup} from '../src/suppliers.js';
import {SupplierError} from '../src/suppliers.js';
import {config} from '../src/config.js';
const old='S1-02425893000',target='S1-02425893700';
const evidence={url:'https://www.partstown.com/p/york/yorks1-02425893700',screenshot:'test.png',observedAt:new Date().toISOString()};
const cross={url:alternativeSources.crossReference,heading:'York Coleman '+target+' Dual Run Capacitor',text:'Replaces Old York Coleman Part Numbers\nS1-02425893000\nS1-02424053700\nOther Part Numbers\nRound'};
const oem={url:alternativeSources.oemSpecifications,heading:'Capacitor, Run Dual, 40/5 mfd, 370V, Round',text:'SKU\nS1-02425893700\nSpecifications\nSubstitute SKU\tS1-CAP4405040DR\nBrand\tSource 1'};
const successor='S1-CAP4405040DR';
const successorSource={url:alternativeSources.oemSubstituteSpecifications,heading:'Round Dual Run Capacitor, 40/5 MFD, 440V',text:'SKU S1-CAP4405040DR\nSpecifications\nDimension\t3Hx3Wx5D\nBrand\tSource 1'};
const specs=parseOemCapacitor(oem,target)!;
function fixture(store:Store){
 const input=inputSchema.parse({mode:'live',suppliers:['johnstone','partstown','grainger'],lines:[{name:'board',manufacturer:'York',partNumber:'S1-33101975102'},{name:'capacitor',manufacturer:'York',partNumber:old}]});
 const {job}=store.create(input);const lines=input.lines.map((l,lineIndex)=>({lineIndex,requestedName:l.name,quantity:1,manufacturer:'York',partNumber:l.partNumber!,description:l.name,componentSelection:'explicit' as const,specifications:{capacitanceMfd:lineIndex?'40/5':null,voltage:null},evidence:{page:2,model:'E1RD036S06B',modelColumn:4,header:'header',row:'row',cells:[],sourceUrl:'https://example.test/guide.pdf',documentUrl:'/guide.pdf',sha256:'a'.repeat(64),revision:'E'}}));
 const capturedParts:NonNullable<Job['capturedParts']>={status:'captured',model:'E1RD036S06B',modelBasis:'test_model',capturedAt:new Date().toISOString(),guideSha256:'a'.repeat(64),requestSignature:'signature',currentSupersessionsVerified:false,installedCompatibilityVerified:false,alternativeSpecificationsVerified:false,warnings:['Test model only'],lines};
 return store.update(job.id,{state:'needs_permission',sourceCapture:{jobId:'parent',capturedAt:capturedParts.capturedAt,guideSha256:capturedParts.guideSha256,modelBasis:'test_model',phase:'exact'},capturedParts,results:input.lines.map((l,i)=>({name:l.name,quantity:1,offers:i?[]:[assess(fixtureOffer('johnstone','control board')!,input.lines[0]!,'johnstone',evidence,true)],errors:[],attempts:input.suppliers.map(supplier=>({supplier,phase:'exact',status:i?'no_match':'found',query:l.partNumber!,observedAt:new Date().toISOString(),evidence}))}))});
}
const source=async(_id:string,key:keyof typeof alternativeSources):Promise<ReferenceSnapshot>=>({...(key==='crossReference'?cross:key==='oemSpecifications'?oem:successorSource),sha256:'b'.repeat(64),evidence});
const mockLookup:typeof lookup=async(id,input,line,supplier)=>{assert.ok([target,successor].includes(line.partNumber!));const raw={...fixtureOffer('johnstone','capacitor')!,partNumber:line.partNumber!};return {offers:[assess(raw,line,supplier,evidence,false)],evidence};};
test('replacement claim requires the exact old identifier inside an explicit replacement list on the reviewed supplier source',()=>{
 assert.ok(parseSupplierReplacement(cross,old,target));
 for(const changed of [{...cross,url:'https://evil.example'},{...cross,heading:'Unrelated capacitor'},{...cross,heading:'York '+target+'1 capacitor'},{...cross,text:'Frequently bought together '+old},{...cross,text:cross.text.replace(old,old+'1')},{...cross,text:'Replaces Old York Coleman Part Numbers\nOther Part Numbers\n'+old}])assert.equal(parseSupplierReplacement(changed,old,target),null);
});
test('OEM specifications must belong to the candidate SKU and primary heading, never recommendations',()=>{
 assert.equal(specs.capacitanceMfd,'40/5');assert.equal(specs.voltageVac,370);
 assert.equal(parseOemCapacitor({...oem,text:oem.text.replace('SKU\n','SKU ')},target)?.voltageVac,370);
 assert.equal(parseOemCapacitor({...oem,text:oem.text.replace(target,old)},target),null);
 assert.equal(parseOemCapacitor({...oem,heading:'Related products',text:oem.text+'40/5 mfd 370V Round'},target),null);
 assert.equal(parseOemCapacitor({...oem,url:'https://other.example'},target),null);
});
test('voltage/capacitance conflicts reject candidates; supplier claims and unknowns can never approve installation',()=>{
 const claims=[parseSupplierReplacement(cross,old,target)!];
 assert.equal(verifyReplacement(old,'40/5',440,specs,claims).status,'rejected');
 assert.equal(verifyReplacement(old,'45/5',370,specs,claims).status,'rejected');
 const result=verifyReplacement(old,'40/5',undefined,specs,claims);assert.equal(result.status,'needs_review');assert.equal(result.checks.find(c=>c.field==='voltage')?.status,'missing');
 assert.equal(verifyReplacement(old,'40/5',370,specs,claims).status,'needs_review');assert.equal(result.rankingEligible,false);assert.equal(result.installedCompatibilityVerified,false);
 assert.equal(verifyReplacement(old,'40/5',370,specs,[{...claims[0]!,authority:'oem'}]).status,'needs_review');
});
test('review permission is scoped, stale-safe and idempotent; caller cannot inject candidate destinations',()=>{
 const store=new Store(':memory:');try{const j=fixture(store);const body={expectedUpdatedAt:j.updatedAt,allow:true as const};const queued=startAlternativeReview(store,j.id,body);assert.equal(queued.state,'queued');assert.equal(startAlternativeReview(store,j.id,body).id,j.id);
 assert.throws(()=>startAlternativeReview(store,j.id,{...body,installedVoltageVac:370}),/ALTERNATIVE_REVIEW_CONFLICT/);
 assert.throws(()=>startAlternativeReview(store,j.id,{...body,url:'https://evil.example'}));
 assert.throws(()=>startAlternativeReview(store,j.id,{...body,allow:false}));
 assert.throws(()=>startAlternativeReview(store,j.id,{...body,expectedUpdatedAt:'2020-01-01T00:00:00Z'}),/STALE_JOB/);
 }finally{store.db.close();}
});
test('an unresolved exact supplier error cannot be misrepresented as permission to search alternatives',()=>{
 const store=new Store(':memory:');try{const j=fixture(store);j.results[1]!.attempts![0]!.status='error';store.save(j);assert.throws(()=>startAlternativeReview(store,j.id,{expectedUpdatedAt:j.updatedAt,allow:true}),/EXACT_SCOPE_INCOMPLETE/);}finally{store.db.close();}
});
test('documented candidate supplier checks preserve original capture/results and cannot become exact or rankable',async()=>{
 const store=new Store(':memory:');try{const j=fixture(store);startAlternativeReview(store,j.id,{expectedUpdatedAt:j.updatedAt,allow:true});await reviewAlternatives(store,j.id,mockLookup,source);const done=store.get(j.id)!;
 assert.deepEqual(done.capturedParts,j.capturedParts);assert.deepEqual(done.results,j.results);assert.equal(done.state,'needs_input');assert.equal(done.alternativeReview?.lines.length,1);
 const c=done.alternativeReview!.lines[0]!.candidates[0]!;assert.equal(c.attempts.length,3);assert.equal(c.claims[0]!.authority,'supplier');assert.equal(c.specifications?.voltageVac,370);assert.equal(c.verification.status,'needs_review');assert.ok(c.offers.every(o=>o.match==='alternative'&&!o.eligible&&o.total===null));
 }finally{store.db.close();}
});
test('a reported 440 V installation skips all supplier operations for the rejected 370 V candidate',async()=>{
 const store=new Store(':memory:');try{const j=fixture(store);startAlternativeReview(store,j.id,{expectedUpdatedAt:j.updatedAt,allow:true,installedVoltageVac:440});const queried:string[]=[];
 await reviewAlternatives(store,j.id,async(...args)=>{queried.push(args[2].partNumber!);return mockLookup(...args);},source);
 const review=store.get(j.id)!.alternativeReview!;assert.equal(review.lines[0]!.candidates[0]!.verification.status,'rejected');assert.equal(review.lines[0]!.candidates[0]!.attempts.length,0);assert.deepEqual(queried,[successor,successor,successor]);assert.equal(review.lines[0]!.candidates[1]!.verification.status,'needs_review');assert.deepEqual(store.get(j.id)!.results,j.results);
 }finally{store.db.close();}
});
test('alternative recovery failures retain failed-navigation evidence and cannot become no-match',async()=>{
 const store=new Store(':memory:');try{const j=fixture(store);startAlternativeReview(store,j.id,{expectedUpdatedAt:j.updatedAt,allow:true});await reviewAlternatives(store,j.id,async()=>{throw new SupplierError('RECOVERY_FAILED','Injected local model failure',evidence,{attempted:true,navigationVerified:false});},source);
 const done=store.get(j.id)!;assert.equal(done.state,'partial');for(const candidate of done.alternativeReview!.lines[0]!.candidates){assert.equal(candidate.offers.length,0);assert.equal(candidate.attempts.length,3);assert.ok(candidate.attempts.every(a=>a.status==='error'&&a.recovery?.attempted&&a.recovery.navigationVerified===false));}
 }finally{store.db.close();}
});
test('reference failure stops supplier lookup and an individual supplier error produces partial review',async()=>{
 const store=new Store(':memory:');try{let j=fixture(store);startAlternativeReview(store,j.id,{expectedUpdatedAt:j.updatedAt,allow:true});let calls=0;
 await reviewAlternatives(store,j.id,async()=>{calls++;throw new Error('Unexpected lookup');},async()=>{throw new Error('Reference challenge');});assert.equal(calls,0);assert.equal(store.get(j.id)?.state,'partial');
 j=fixture(store);startAlternativeReview(store,j.id,{expectedUpdatedAt:j.updatedAt,allow:true});await reviewAlternatives(store,j.id,async(id,input,line,supplier,alt)=>{if(supplier==='johnstone')throw new SupplierError('AUTH_REQUIRED','Reconnect');return mockLookup(id,input,line,supplier,alt);},source);
 assert.equal(store.get(j.id)?.state,'partial');assert.equal(store.get(j.id)?.alternativeReview?.lines[0]?.candidates[0]?.attempts[0]?.status,'error');
 }finally{store.db.close();}
});
test('cancellation while reading references prevents supplier checks and later state writes',async()=>{
 const store=new Store(':memory:');try{const j=fixture(store);startAlternativeReview(store,j.id,{expectedUpdatedAt:j.updatedAt,allow:true});let calls=0;await reviewAlternatives(store,j.id,async()=>{calls++;throw new Error('Unexpected');},async(id,key)=>{store.update(id,{state:'cancelled'});return source(id,key);});assert.equal(store.get(j.id)?.state,'cancelled');assert.equal(calls,0);assert.deepEqual(store.get(j.id)?.results,j.results);}finally{store.db.close();}
});
test('review API is queued without changing exact input; reference endpoint verifies content integrity',async()=>{
 const store=new Store(':memory:');const {app,worker}=createApp(store);worker.enqueue=()=>{};const j=fixture(store);const text=JSON.stringify({heading:oem.heading,text:oem.text}),hash=createHash('sha256').update(text).digest('hex');const dir=join(config.dataDir,'evidence',j.id);
 try{const response=await app.inject({method:'POST',url:`/api/searches/${j.id}/alternatives/review`,payload:{allow:true,expectedUpdatedAt:j.updatedAt}});assert.equal(response.statusCode,202);assert.equal(response.json().input.allowAlternatives,false);
 const review=store.get(j.id)!.alternativeReview!;review.references=[{...oem,sha256:hash,evidence}];store.update(j.id,{alternativeReview:review});await mkdir(dir,{recursive:true});await writeFile(join(dir,hash+'.json'),text);
 const url=`/api/searches/${j.id}/alternative-references/${hash}`;assert.equal((await app.inject({url})).statusCode,200);await writeFile(join(dir,hash+'.json'),'tampered');assert.equal((await app.inject({url})).statusCode,409);
 assert.equal((await app.inject({url:`/api/searches/${j.id}/alternative-references/${'c'.repeat(64)}`})).statusCode,404);
 const longFile='reference-'.repeat(15)+'proof.png';review.references[0]!.evidence.screenshot=longFile;store.update(j.id,{alternativeReview:review});await writeFile(join(dir,longFile),'PNG test fixture');assert.equal((await app.inject({url:`/api/searches/${j.id}/evidence/${longFile}`})).statusCode,200);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('OEM substitute edges form a directed complete chain and cannot erase weaker supplier evidence',()=>{
 const first=parseSupplierReplacement(cross,old,target)!;const second=parseOemSubstitute(oem)!;
 assert.equal(parseOemCapacitor(successorSource,successor)?.dimensionsText,'3Hx3Wx5D');
 assert.equal(parseOemCapacitor({...successorSource,heading:'Capacitor, Run Dual, 40/5 MFD, 440V, Round'},successor)?.voltageVac,440);
 assert.equal(second.authority,'oem');assert.equal(second.to,successor);
 assert.deepEqual(replacementChain(old,successor,[first,second]),[first,second]);
 assert.deepEqual(replacementChain(old,successor,[second]),[]);
 assert.deepEqual(replacementChain(successor,old,[first,second]),[]);
 assert.deepEqual(replacementChain(old,successor,[first,{...second,to:old}]),[]);
 assert.equal(parseOemSubstitute({...oem,text:oem.text.replace('Substitute SKU','Related product')}),null);
 assert.equal(parseOemSubstitute({...oem,text:oem.text.replace(successor,successor+'X')}),null);
 const result=verifyReplacement(old,'40/5',370,parseOemCapacitor(successorSource,successor),[first,second],successor);
 assert.equal(result.status,'needs_review');assert.equal(result.checks.find(c=>c.field==='replacement_reference')?.status,'passed');assert.equal(result.checks.find(c=>c.field==='oem_replacement_authority')?.status,'missing');
 assert.equal(verifyReplacement(old,'40/5',370,specs,[first],successor).checks.find(c=>c.field==='replacement_reference')?.status,'missing');
});

test('reviewed alphanumeric Source 1 SKU is an identity alias only for the same exact documented York part',()=>{
 const raw={...fixtureOffer('johnstone','capacitor')!,manufacturer:'Source 1',partNumber:successor};
 const requested={name:'candidate',manufacturer:'York',partNumber:successor,quantity:1};
 const exact=assess(raw,requested,'johnstone',evidence,false);assert.equal(exact.match,'exact');assert.equal(exact.manufacturer,'Source 1');assert.ok(exact.identityEvidence);
 assert.equal(assess({...raw,partNumber:successor+'X'},{...requested,partNumber:successor+'X'},'johnstone',evidence,false).match,'unverified');
 assert.equal(assess(raw,{...requested,partNumber:target},'johnstone',evidence,false).match,'unverified');
});

test('reference cache retains observed date, marks stale-live status and rejects altered, old or wrong-SKU snapshots',async()=>{
 const cacheDir=await mkdtemp(join(tmpdir(),'torq-reference-cache-'));const original=randomUUID(),destination=randomUUID();const folder=join(config.dataDir,'evidence',original);const dest=join(config.dataDir,'evidence',destination);
 const observedAt=new Date().toISOString();const text=JSON.stringify({heading:oem.heading,text:oem.text});const reference:ReferenceSnapshot={...oem,sha256:createHash('sha256').update(text).digest('hex'),evidence:{url:oem.url,screenshot:'source.png',observedAt}};
 try{
  await mkdir(folder,{recursive:true});await writeFile(join(folder,'source.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFRsAAAAASUVORK5CYII=','base64'));
  await rememberAlternativeReference(original,'oemSpecifications',reference,cacheDir);const cached=await cachedAlternativeReference(destination,'oemSpecifications','Live source returned 500',cacheDir);assert.equal(cached.cacheHit,true);assert.ok(cached.evidence.screenshot.length<100);assert.equal(cached.evidence.observedAt,observedAt);assert.equal(cached.refreshWarning,'Live source returned 500');assert.equal(cached.sha256,reference.sha256);
  await writeFile(join(cacheDir,'oemSpecifications.json'),JSON.stringify({id:original,reference:{...reference,text:'altered'}}));await assert.rejects(cachedAlternativeReference(destination,'oemSpecifications','failure',cacheDir));
  await writeFile(join(cacheDir,'oemSpecifications.json'),JSON.stringify({id:original,reference:{...reference,evidence:{...reference.evidence,observedAt:new Date(Date.now()-86400001).toISOString()}}}));await assert.rejects(cachedAlternativeReference(destination,'oemSpecifications','failure',cacheDir));
  await assert.rejects(rememberAlternativeReference(original,'oemSpecifications',{...reference,text:reference.text.replace(target,old)},cacheDir));
 }finally{await rm(cacheDir,{recursive:true,force:true});await rm(folder,{recursive:true,force:true});await rm(dest,{recursive:true,force:true});}
});

test('alternative review reauthenticates expired supplier sessions once per supplier and preserves exact results',async()=>{
 const {Worker}=await import('../src/worker.js');const {exclusive}=await import('../src/browser.js');
 const store=new Store(':memory:');let job=fixture(store);const original=structuredClone(job.results);startAlternativeReview(store,job.id,{expectedUpdatedAt:job.updatedAt,allow:true});
 const calls=new Map<string,number>();let logins=0;const received:{username:string;password:string}[]=[];
 const lookupWithExpiry:typeof lookup=async(_id,_input,_line,supplier)=>{const n=(calls.get(supplier)??0)+1;calls.set(supplier,n);if(supplier!=='grainger'&&n===1)throw new SupplierError('AUTH_REQUIRED','expired alternative session');return {offers:[],evidence};};
 try{
  const worker=new Worker(store,undefined,lookupWithExpiry,async()=>({username:'fixture-user',password:'fixture-secret',zip:'22201',rememberSession:true}),async(supplier,credentials)=>{logins++;received.push(credentials);return {supplier,state:'authenticated',url:'https://example.test/',message:'Verified fixture session'};},source);
  worker.enqueue(job.id);await exclusive(async()=>{});job=store.get(job.id)!;
  assert.equal(logins,2);assert.equal(calls.get('johnstone'),3);assert.equal(calls.get('partstown'),3);assert.equal(calls.get('grainger'),2);
  assert.ok(job.alternativeReview?.lines[0]?.candidates.every(c=>c.attempts.every(a=>a.status==='no_match')));assert.deepEqual(job.results,original);
  assert.ok(received.every(c=>!c.username&&!c.password));assert.doesNotMatch(JSON.stringify(job),/fixture-secret|fixture-user/);
 }finally{store.db.close();}
});

test('cancellation during alternative credential lookup prevents sign-in and subsequent supplier operations',async()=>{
 const {Worker}=await import('../src/worker.js');const {exclusive}=await import('../src/browser.js');const store=new Store(':memory:');const job=fixture(store);startAlternativeReview(store,job.id,{expectedUpdatedAt:job.updatedAt,allow:true});
 let lookups=0,logins=0;const credentials={username:'fixture-user',password:'fixture-secret',zip:'22201',rememberSession:true};
 const expired:typeof lookup=async()=>{lookups++;throw new SupplierError('AUTH_REQUIRED','expired');};
 try{
  const worker=new Worker(store,undefined,expired,async()=>{store.update(job.id,{state:'cancelled'},'Cancelled by test');return credentials;},async supplier=>{logins++;return {supplier,state:'authenticated',url:'https://example.test/',message:'Unexpected sign-in'};},source);
  worker.enqueue(job.id);await exclusive(async()=>{});assert.equal(store.get(job.id)?.state,'cancelled');assert.equal(lookups,1);assert.equal(logins,0);assert.equal(credentials.password,'');assert.equal(credentials.username,'');
 }finally{store.db.close();}
});
