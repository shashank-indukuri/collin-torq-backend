import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {agentLookup} from '../src/sourcing-agent.js';
import {closeBrowser,exclusive} from '../src/browser.js';
import {inputSchema} from '../src/domain.js';
const app=Fastify();
const unknown=process.env.AGENT_FIXTURE_SCENARIO==='unknown_currency_zero_stock',stock=unknown?0:3,noMatch=process.env.AGENT_FIXTURE_SCENARIO==='no_match';
const suffix=randomUUID(),path='/catalog-'+suffix;
app.get('/',async(_,reply)=>reply.type('text/html').send(`<h1>Wholesale parts catalog</h1><form action="/search-${suffix}"><label>Search by manufacturer number <input type="search" name="term"></label><button type="submit">Find parts</button></form>`));
app.get('/search-'+suffix,async(_,reply)=>reply.type('text/html').send(noMatch?'<h1>No results</h1>':`<h1>Search results</h1><article>York TEST-123 Defrost Board <a href="${path}">Inspect product</a></article><article>Another board WRONG-999</article>`));
app.get(path,async(_,reply)=>reply.type('text/html').send(`<h1>York TEST-123 Defrost Board</h1><main><p>Manufacturer: York</p><p>Manufacturer part: TEST-123</p><p>Price: ${unknown?'':'USD '}$17.25 each</p>${unknown?'<p>Currency and condition not specified.</p>':'<p>Condition: new</p>'}<button type="button" onclick="document.querySelector('section').hidden=false">Check branch availability</button><section hidden><h2>Branch stock</h2><p>Arlington Branch #100 | Address: 100 Test St, Arlington VA 22201 | Quantity: ${stock} | ${unknown?'Out of stock':'Ready for pickup now'}</p></section><button type="button" onclick="window.cartTouched=true">Add to cart</button></main>`));
await app.listen({host:'127.0.0.1',port:4312});
const input=inputSchema.parse({mode:'live',origin:{address:'Arlington VA 22201'},suppliers:['johnstone'],lines:[{name:'defrost board',manufacturer:'York',partNumber:'TEST-123',quantity:1}]});
try{
 const result=await exclusive(()=>agentLookup(randomUUID(),input,input.lines[0]!,'johnstone',false,{entryUrl:'http://127.0.0.1:4312/'}));
 await writeFile('.local/agent-acceptance.json',JSON.stringify(result,null,2),{mode:0o600});
 if(noMatch){assert.equal(result.offers.length,0);assert.ok(result.evidence);console.log('PASS query-bound no-match without an identifier in the visible message');}
 else{assert.equal(result.offers[0]?.match,'exact');assert.equal(result.offers[0]?.price,17.25);assert.equal(result.offers[0]?.commercial?.branches[0]?.stockQuantity,stock);
 assert.equal(result.offers[0]?.currency,unknown?null:'USD');assert.equal(result.offers[0]?.condition,unknown?null:'new');
 const {getBrowser}=await import('../src/browser.js');const active=await (await getBrowser()).browser.context.activePage();assert.ok(active);
 assert.equal(await active.evaluate(()=>Boolean((window as unknown as {cartTouched?:boolean}).cartTouched)),false);
 console.log('PASS goal-driven discovery, unknown URLs, pricing and hidden branch panel');}
}finally{await closeBrowser();await app.close();}
