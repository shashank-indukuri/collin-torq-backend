import {test} from 'node:test';
import assert from 'node:assert/strict';
import {graingerNoExactResults,johnstoneCatalog,graingerCatalog} from '../src/catalog.js';
import {assess,inputSchema} from '../src/domain.js';
const number='S1-33101975102';
const requested=inputSchema.parse({lines:[{name:'board',manufacturer:'York',partNumber:number}]}).lines[0]!;
const evidence={url:'https://www.johnstonesupply.com/product-view?pID=L41-755',screenshot:'test.png',observedAt:new Date().toISOString()};
const body=`Defrost Control\nDescription: CONTROL, DEFROST;\nOrder #: L41-755\nMfg. #: ${number}\nBrand: Source 1\nSubstitutions\nCustomer Part #: \nMy Johnstone Supply Price\nAvailable in 1-2 Days\n$196.72\n-\n+\nAdd to Cart\nAvailability\nStore Qty\nAlexandria - #461 Available in 1-2 Days\nSubstitutions\nUniversal control\n$104.99`;
test('Johnstone reads primary identity and one account price without using recommended product price or stock',()=>{
 const raw=johnstoneCatalog(body)!;assert.equal(raw.partNumber,number);assert.equal(raw.manufacturer,'Source 1');assert.equal(raw.price,196.72);
 assert.equal(raw.stockQuantity,null);assert.equal(raw.pickupReady,null);assert.equal(raw.currency,null);assert.equal(raw.unit,null);
 const result=assess(raw,requested,'johnstone',evidence,false);assert.equal(result.match,'exact');assert.equal(result.manufacturer,'Source 1');assert.equal(result.identityEvidence?.basis,'oem_service_brand');assert.equal(result.eligible,false);
});
test('OEM service-brand relationship never accepts different numbers, unrelated brands, suppliers or non-S1 identifiers',()=>{
 const raw=johnstoneCatalog(body)!;
 for(const value of [{...raw,partNumber:'S1-33101975001'},{...raw,manufacturer:'Unrelated'},{...raw,partNumber:'ABC'}])assert.equal(assess(value,requested,'johnstone',evidence,false).match,'unverified');
 assert.equal(assess(raw,requested,'grainger',evidence,false).match,'unverified');
 assert.equal(assess(raw,{...requested,manufacturer:'Coleman'},'johnstone',evidence,false).match,'unverified');
 assert.equal(assess({...raw,partNumber:'ABC'},{...requested,partNumber:'ABC'},'johnstone',evidence,false).match,'unverified');
 assert.equal(assess(raw,requested,'johnstone',evidence,false,true).match,'alternative');
});
test('Johnstone ambiguous pricing remains unknown and a recommendation cannot supply missing primary identity',()=>{
 assert.equal(johnstoneCatalog(body.replace('$196.72','$196.72\n$210.00'))!.price,null);
 assert.equal(johnstoneCatalog(body.replace('Mfg. #: '+number,'')),null);
 assert.equal(johnstoneCatalog(body.replace('My Johnstone Supply Price','Price unavailable'))!.price,null);
});
const capacitor='S1-02425893000';const url='https://www.grainger.com/search?searchQuery='+capacitor;
const title=`No results found for: "${capacitor}" - Grainger Industrial Supply`;
const suggestions=`Suggested results for "${capacitor}"\nTRUE Start Component Kit: Mfr Part # 880328\nLENNOX Pressure Switch: Mfr Part # 63K93`;
test('Grainger exact-query no-results page with unrelated suggestions is a conclusive query no-match, without model recovery',()=>{
 assert.equal(graingerNoExactResults(url,title,suggestions,capacitor),true);
});
test('stale title, mismatched query, missing heading, category URLs and error pages do not prove Grainger no-match',()=>{
 for(const [u,t,b] of [[url,title.replace(capacitor,number),suggestions],[url,title,suggestions.replace(capacitor,number)],[url,title,'Access denied'],[url.replace(capacitor,number),title,suggestions],['https://evil.example/search?searchQuery='+capacitor,title,suggestions],[url.replace('/search?','/category?'),title,suggestions],[url,'Search - Grainger',suggestions]])assert.equal(graingerNoExactResults(u!,t!,b!,capacitor),false);
});

const graingerBoard=`YORK, Mfr Part # S1-331-01975-102, Defrost Control Board Kit - 42FL31|S1-331-01975-102 - Grainger
YORK Defrost Control Board Kit: Mfr Part # S1-331-01975-102
Item 42FL31Mfr. Model S1-331-01975-102
Product TypeDefrost Control BoardBrandYORKCountry of OriginUSA (subject to change)
Customers Also Purchased
YORK Fan Control Board
Item 50PP04Mfr. Model S1-031-01264-002
Web Price
$558.83/ each`;
test('Grainger parses primary heading and model independently and ignores recommendation price',()=>{
 const raw=graingerCatalog(graingerBoard,'York',number)!;assert.equal(raw.partNumber,'S1-331-01975-102');assert.equal(raw.supplierSku,'42FL31');assert.equal(raw.price,null);assert.equal(raw.stockQuantity,null);
 assert.equal(graingerCatalog(graingerBoard,'York','S1-031-01264-002'),null);
 assert.equal(graingerCatalog(graingerBoard.replace('BrandYORK','BrandUnrelated'),'York',number),null);
 assert.equal(graingerCatalog(graingerBoard.replace('Mfr. Model S1-331-01975-102','Mfr. Model OTHER'),'York',number),null);
 assert.equal(graingerCatalog(graingerBoard.replace('Item 42FL31Mfr. Model S1-331-01975-102',''),'York',number),null);
});

test('Grainger table-result product can prove identity through its main model and brand even when heading omits the number',()=>{
 const text=graingerBoard.replace('YORK Defrost Control Board Kit: Mfr Part # S1-331-01975-102','YORK Defrost Control Board Kit: Replacement Part');
 assert.ok(graingerCatalog(text,'York','S1-33101975102'));
 assert.equal(graingerCatalog(text,'York','S1-OTHER'),null);
});

import {inspectedGraingerNoMatch,graingerProductIdentity} from '../src/catalog.js';
import {supplierSearchNoMatch} from '../src/catalog.js';
test('generic no-match text needs the exact supplier query and an absence heading',()=>{
 for(const supplier of ['johnstone','partstown'] as const){
  const host=supplier==='johnstone'?'www.johnstonesupply.com':'www.partstown.com';const key=supplier==='johnstone'?'searchPhrase':'q';const url=`https://${host}/search?${key}=${capacitor}`;
  assert.equal(supplierSearchNoMatch(supplier,url,['No results found'],capacitor),true);
  for(const [u,h] of [[url,['Recommendations']], [url.replace(capacitor,number),['No results found']], [url.replace('/search?','/product-view?'),['No results found']], [url.replace(host,'evil.example'),['No results found']]] as [string,string[]][])assert.equal(supplierSearchNoMatch(supplier,u,h,capacitor),false);
 }
});
test('Johnstone live no-results paragraph must quote this query before popular products',()=>{
 const url='https://www.johnstonesupply.com/search?searchPhrase='+capacitor;
 const text=`Search was unable to find any results for "${capacitor}".\nPopular Products\nUnrelated suggestions`;
 assert.equal(supplierSearchNoMatch('johnstone',url,['Popular Products'],capacitor,text),true);
 assert.equal(supplierSearchNoMatch('johnstone',url,['Popular Products'],capacitor,text.replace(capacitor,number)),false);
 assert.equal(supplierSearchNoMatch('johnstone',url,[],capacitor,'Popular Products\n'+text),false);
});
const queryPart='S1-CAP4405040DR';const categoryUrl='https://www.grainger.com/category/motors/motor-capacitors/motor-run-capacitors?searchQuery='+queryPart;
const queryBody=`Showing results for "${queryPart}"\n2 products\nRound Motor Run Capacitors`;
const proofProducts=[{manufacturer:'TITAN HD',partNumber:'TRCF5',sourceUrl:'https://www.grainger.com/product/TITAN-Capacitor-20UD63',evidence:{...evidence,url:'https://www.grainger.com/product/TITAN-Capacitor-20UD63'}},{manufacturer:'DAYTON',partNumber:'2MEJ7',sourceUrl:'https://www.grainger.com/product/DAYTON-Capacitor-2MEJ7',evidence:{...evidence,url:'https://www.grainger.com/product/DAYTON-Capacitor-2MEJ7'}}];
test('complete small query result sets can prove no exact number only after every returned product identity is inspected',()=>{
 const result=inspectedGraingerNoMatch(categoryUrl,queryBody,queryPart,proofProducts)!;assert.equal(result.returnedCount,2);assert.equal(result.kind,'inspected_query_results');assert.equal(result.products.length,2);
 assert.ok(inspectedGraingerNoMatch(categoryUrl,queryBody.replace('\n2 products','\n\nAvailable\n2 products'),queryPart,proofProducts));
 assert.ok(graingerProductIdentity(graingerBoard));
});
test('query-result inspection cannot hide an unreadable item, pagination, stale query or matching number under another brand',()=>{
 for(const [url,body,products]of [[categoryUrl,queryBody,proofProducts.slice(0,1)],[categoryUrl,queryBody.replace('2 products','20 products'),proofProducts],[categoryUrl,queryBody.replace(queryPart,'OTHER'),proofProducts],[categoryUrl,queryBody,[proofProducts[0]!,{...proofProducts[1]!,partNumber:queryPart}]],[categoryUrl,queryBody,[proofProducts[0]!,proofProducts[0]!]],[categoryUrl,queryBody,[proofProducts[0]!,{...proofProducts[1]!,manufacturer:''}]] ] as const)assert.equal(inspectedGraingerNoMatch(url,body,queryPart,[...products]),null);
 assert.equal(inspectedGraingerNoMatch(categoryUrl,queryBody,queryPart,[proofProducts[0]!,{...proofProducts[1]!,evidence}]),null);
 assert.equal(inspectedGraingerNoMatch(categoryUrl.replace(queryPart,'OTHER'),queryBody,queryPart,proofProducts),null);
});

test('inspected capacitor details keep Brand separate from adjacent specification labels',()=>{
 for(const brand of ['DAYTON','TITAN HD']){const raw=graingerProductIdentity(`${brand} Motor Dual Run Capacitor: Round, 440V AC, 40/5 MFD
Item 2MEJ7 Mfr. Model 2MEJ7
Brand${brand}Housing Height4-1/8 in
Manufacturer Part Number2MEJ7Frequency60/50 Hz`)!;assert.ok(raw);assert.equal(raw.manufacturer,brand);assert.equal(raw.partNumber,'2MEJ7');}
});
