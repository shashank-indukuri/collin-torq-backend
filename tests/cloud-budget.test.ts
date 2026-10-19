import {test} from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),moduleUrl=pathToFileURL(join(root,'src/cloud-provider.ts')).href,loader=pathToFileURL(join(root,'node_modules/tsx/dist/loader.mjs')).href;
async function probe(script:string,budget:string){
 const cwd=await mkdtemp(join(tmpdir(),'torq-cloud-budget-'));
 try{await promisify(execFile)(process.execPath,['--import',loader,'--input-type=module','--eval',`import assert from 'node:assert/strict';let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw new Error('UNEXPECTED_NETWORK')};const cloud=await import(${JSON.stringify(moduleUrl)});${script}`],{cwd,env:{...process.env,MODEL_PROVIDER:'openai',OPENAI_MODEL:'gpt-6-luna',OPENAI_API_KEY:'test-not-a-real-key',OPENAI_ENV_FILE:'',CLOUD_BUDGET_USD:budget},timeout:15000});}
 finally{await rm(cwd,{recursive:true,force:true});}
}
test('zero and malformed spending limits reject before any provider request',async()=>{
 for(const budget of ['0','not-a-number'])await probe(`await assert.rejects(cloud.openaiRequest('responses',{max_output_tokens:1024,input:'test'}),/CLOUD_SPENDING_CAP_REACHED/);assert.equal(networkCalls,0);`,budget);
});
test('oversized input and output cannot reach the provider',async()=>{
 await probe(`await assert.rejects(cloud.openaiRequest('responses',{max_output_tokens:4097}),/CLOUD_OUTPUT_LIMIT/);await assert.rejects(cloud.openaiRequest('responses',{input:'x'.repeat(129000)}),/CLOUD_INPUT_LIMIT/);assert.equal(networkCalls,0);`,'0.5');
});
test('concurrent requests reserve worst-case spend before billing, then reconcile usage',async()=>{
 await probe(`globalThis.fetch=async()=>{networkCalls++;await new Promise(r=>setTimeout(r,100));return new Response(JSON.stringify({usage:{input_tokens:100,output_tokens:100},output:[]}));};const results=await Promise.allSettled([cloud.openaiRequest('responses',{max_output_tokens:4096,input:'a'}),cloud.openaiRequest('responses',{max_output_tokens:4096,input:'b'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(networkCalls,1);const state=await cloud.cloudBudget();assert.ok(state.reservedOrSpentUsd>0&&state.reservedOrSpentUsd<0.001);`,'0.003');
});
test('ambiguous transport failures retain the reservation and cannot trigger unlimited retries',async()=>{
 await probe(`globalThis.fetch=async()=>{networkCalls++;throw new Error('timeout')};await assert.rejects(cloud.openaiRequest('responses',{max_output_tokens:4096,input:'a'}),/RESERVATION_RETAINED/);await assert.rejects(cloud.openaiRequest('responses',{max_output_tokens:4096,input:'a'}),/SPENDING_CAP/);assert.equal(networkCalls,1);assert.ok((await cloud.cloudBudget()).reservedOrSpentUsd>0);`,'0.003');
});
test('strict schemas convert nested discriminated unions and require nullable fields',async()=>{
 await probe(`const schema=cloud.strictSchema({type:'object',properties:{facts:{type:'array',items:{oneOf:[{type:'object',properties:{field:{const:'price'},value:{type:'string'}},required:['field']},{type:'object',properties:{field:{const:'unit'},value:{type:'string'}}}]}}},default:{}});assert.equal(schema.default,undefined);assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['facts']);assert.equal(schema.properties.facts.items.oneOf,undefined);assert.equal(schema.properties.facts.items.anyOf.length,2);assert.deepEqual(schema.properties.facts.items.anyOf[0].required,['field','value']);assert.equal(networkCalls,0);`,'0');
});
