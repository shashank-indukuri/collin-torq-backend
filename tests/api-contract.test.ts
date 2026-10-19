import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Ajv2020} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {openapi} from '../src/openapi.js';
import {inputSchema,assess} from '../src/domain.js';
import {fixtureOffer} from '../src/fixture.js';
import {Store} from '../src/store.js';

test('published job contract accepts extended offers and runtime metadata, and rejects invalid currency',()=>{
 const ajv=new Ajv2020({strict:false,allErrors:true});addFormats.default(ajv);
 const validate=ajv.compile({$ref:'#/components/schemas/Job',components:openapi.components});
 const store=new Store(':memory:');
 try{
  const {job}=store.create(inputSchema.parse({mode:'fixture',lines:[{name:'control board',manufacturer:'York',partNumber:'S1-33101975102'}]}));
  const offer=assess(fixtureOffer('johnstone','control board')!,job.input.lines[0]!,'johnstone',{url:'https://example.test/item',screenshot:'fixture.png',observedAt:new Date().toISOString()},true);
  const completed=store.update(job.id,{state:'completed',execution:{provider:'ollama',model:'fixture',supplierEngine:'legacy',startedAt:new Date().toISOString()},results:[{name:'control board',quantity:1,offers:[offer],errors:[]}]},'Fixture contract');
  assert.equal(validate(completed),true,JSON.stringify(validate.errors));
  const invalid=structuredClone(completed) as any;invalid.results[0].offers[0].currency='EUR';assert.equal(validate(invalid),false);
  const incomplete=structuredClone(completed) as any;delete incomplete.results[0].offers[0].supplier;assert.equal(validate(incomplete),false);
 }finally{store.db.close();}
});
