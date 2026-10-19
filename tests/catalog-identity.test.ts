import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {catalogIdentity,productIdentityScript} from '../src/catalog-identity.js';
const number='S1-33101975102';
const bodies={
 johnstone:`Description: CONTROL, DEFROST;\nOrder #: L41-755\nMfg. #: ${number}\nBrand: Source 1\nSubstitutions\nBrand: Unrelated\nMfg. #: OTHER`,
 partstown:`York ${number} Defrost Control\nManufacturer: York\nManufacturer #: ${number}\nParts Town #: YORKS1\nFREQUENTLY BOUGHT TOGETHER\nManufacturer #: OTHER`,
 grainger:`YORK Defrost Control Board Kit\nItem 42FL31 Mfr. Model S1-331-01975-102\nBrandYORKCountry of OriginUSA\nCustomers Also Viewed\nItem BAD Mfr. Model OTHER`,
};
test('the recovery verifier executes the same dependency-free catalog identity parser for every supplier',()=>{
 for(const supplier of ['johnstone','partstown','grainger'] as const){
  assert.ok(catalogIdentity(bodies[supplier],supplier));
  const script=productIdentityScript(`www.${supplier==='johnstone'?'johnstonesupply':supplier}.com`,number,'York');
  const result=runInNewContext('('+script+')()',{document:{body:{innerText:bodies[supplier]}}});assert.equal(result.matched,true);assert.ok(result.partNumber);
 }
});
test('wrong product, recommendations, unreadable layout and wrong manufacturer cannot stop recovery as successful',()=>{
 const check=(body:string,brand='York')=>runInNewContext('('+productIdentityScript('www.johnstonesupply.com',number,brand)+')()',{document:{body:{innerText:body}}}).matched;
 for(const body of [bodies.johnstone.replace(number,number+'A'),bodies.johnstone.replace(number,'ICM-UDEFROST'),bodies.johnstone.replace('Source 1','Other'),'Related products '+number,'Access denied','<new-layout>'])assert.equal(check(body),false);
 assert.equal(check(bodies.johnstone,'Carrier'),false);
 assert.equal(check(bodies.johnstone.replace('Source 1','York').replace(number,number+'A')),false);
 assert.throws(()=>productIdentityScript('evil.example',number,'York'),/No reviewed recovery identity verifier/);
});
test('request values are serialized as data inside the application-owned verifier',()=>{
 const sandbox={document:{body:{innerText:bodies.johnstone}},attacked:false};
 const script=productIdentityScript('www.johnstonesupply.com','\");attacked=true;//','York');
 assert.equal(runInNewContext('('+script+')()',sandbox).matched,false);assert.equal(sandbox.attacked,false);
});
test('a product navigation with no body yet remains unmatched and can be polled again',()=>{
 const script='('+productIdentityScript('www.partstown.com',number,'York')+')()';
 assert.equal(runInNewContext(script,{document:{body:null}}).matched,false);
 assert.equal(runInNewContext(script,{document:{body:{innerText:bodies.partstown}}}).matched,true);
});
