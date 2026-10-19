import type {Page} from '@browserbasehq/stagehand';
import {catalogIdentity} from './catalog-identity.js';
import {normalizePart,type Offer,type SearchInput} from './domain.js';
import type {CommercialObservation,Evidence} from './comparison-policy.js';
import {getBrowser,saveEvidence} from './browser.js';
const blank=(offer:Offer,quantity:number,evidence:Evidence):CommercialObservation=>({status:'observed',manufacturer:offer.manufacturer,partNumber:offer.partNumber,requestedQuantity:quantity,price:{amount:null,currency:null,unit:null,packSize:null,condition:null,basis:offer.priceBasis??'account_unverified',text:''},shipping:{quantity:null,quantityBasis:'unknown',arrivalDate:null,destinationZip:null,quantityConfirmed:false,text:''},branches:[],evidence,issues:[]});
export function requestedSpecConflicts(requested:string,listing:string){
 const conflicts:string[]=[];
 const value=(text:string,pattern:RegExp)=>{const match=text.match(pattern);return match?Number(match[1]):null;};
 const requestedAmps=value(requested,/\b(\d+(?:\.\d+)?)\s*(?:A|AMPS?|AMPERES?)\b/i),listedAmps=value(listing,/\b(\d+(?:\.\d+)?)\s*(?:A|AMPS?|AMPERES?)\b/i);
 if(requestedAmps!==null&&listedAmps!==null&&requestedAmps!==listedAmps)conflicts.push(`amperage ${requestedAmps}A requested, ${listedAmps}A listed`);
 const requestedVolts=value(requested,/\b(\d+(?:\.\d+)?)\s*V(?:AC|DC)?\b/i),listedVolts=value(listing,/\b(\d+(?:\.\d+)?)\s*V(?:AC|DC)?\b/i);
 if(requestedVolts!==null&&listedVolts!==null&&requestedVolts!==listedVolts)conflicts.push(`voltage ${requestedVolts}V requested, ${listedVolts}V listed`);
 const requestedClass=requested.match(/\bclass\s+([A-Z0-9-]+)\b/i)?.[1]?.toUpperCase(),listedClass=listing.match(/\bclass\s+([A-Z0-9-]+)\b/i)?.[1]?.toUpperCase();
 if(requestedClass&&listedClass&&requestedClass!==listedClass)conflicts.push(`fuse class ${requestedClass} requested, class ${listedClass} listed`);
 return conflicts;
}
export function parseArrival(text:string,observedAt:string){
 const match=text.match(/Expected to arrive\s+(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\.?\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?\./i);if(!match)return null;
 const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];const now=new Date(observedAt),month=months.indexOf(match[2]!.toLowerCase());
 let year=match[4]?Number(match[4]):now.getUTCFullYear();if(!match[4]&&month<now.getUTCMonth())year++;
 const date=new Date(Date.UTC(year,month,Number(match[3]))),days=(date.getTime()-Date.parse(now.toISOString().slice(0,10)))/86400000;
 if(date.getUTCMonth()!==month||days<0||days>180||(match[1]&&date.getUTCDay()!==['sun','mon','tue','wed','thu','fri','sat'].indexOf(match[1].toLowerCase())))return null;
 return date.toISOString().slice(0,10);
}
export function parseGraingerBranches(text:string,evidence:Evidence):CommercialObservation['branches']{
 const panel=text.split(/Change Branch\s*\n/)[1];if(!panel)return [];
 const branches:CommercialObservation['branches']=[];
 const pattern=/([^\n]+) Branch #(\d+)\s*\n([^\n]+)\n([^\n]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)([\s\S]*?)(?=\n[^\n]+ Branch #\d+\s*\n|\nCancel\n|$)/g;
 for(const match of panel.matchAll(pattern)){
  const block=match[5]!,future=/Available for pickup\s+(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\./i.test(block);
  const quantity=block.match(/(?:Quantity Available|In Stock)\s*:\s*(\d+)/i)?.[1];
  branches.push({id:match[2]!,name:match[1]!+' Branch #'+match[2],address:match[3]+', '+match[4],stockQuantity:quantity?Number(quantity):null,quantityBasis:quantity?'each':'unknown',pickupReady:future?false:/Ready for pickup now|Available for pickup today/i.test(block)?true:null,evidence});
 }
 return [...new Map(branches.map(b=>[b.id,b])).values()].slice(0,30);
}
export function parseCommercial(offer:Offer,quantity:number,body:string,purchaseText:string,quantityValue:string,evidence:Evidence,requestedDescription=''):CommercialObservation{
 const result=blank(offer,quantity,evidence),identity=catalogIdentity(body,offer.supplier);
 if(!identity||normalizePart(identity.partNumber)!==normalizePart(offer.partNumber)||identity.manufacturer.trim().toLowerCase()!==offer.manufacturer.trim().toLowerCase())return {...result,status:'unavailable',issues:['Product identity changed while inspecting commercial information.']};
 for(const conflict of requestedSpecConflicts(requestedDescription,offer.description))result.issues.push(`Requested specification conflict: ${conflict}. Verify the part number or requested rating before sourcing.`);
 if(offer.supplier==='partstown'){
  const primary=body.split(/FREQUENTLY BOUGHT TOGETHER|ALSO OF INTEREST/i)[0]!;
  const price=primary.match(/My Price:\s*\$\s*([\d,]+\.\d{2})/i)?.[1];const each=/Units:\s*Each\b/i.test(primary);
  result.price={...result.price,amount:price?Number(price.replaceAll(',','')):null,currency:/\bUSD\b/.test(body)?'USD':null,unit:each?'each':null,packSize:each?1:null,condition:/Condition:\s*New\b/i.test(primary)?'new':/Condition:\s*Refurbished\b/i.test(primary)?'refurbished':null,text:primary.slice(0,4000)};
  const available=primary.match(/Quantity Available:\s*(\d+)\b/i)?.[1];result.shipping={...result.shipping,quantity:available&&/Ship It!\s*\nIn Stock/i.test(primary)?Number(available):null,quantityBasis:each?'each':'unknown',text:'Shipping inventory: '+(available??'unknown')+'. '+(primary.match(/Ships from[^\n]+/i)?.[0]??'')};
  result.issues.push('Shipping inventory is not local branch stock. No destination-specific arrival date is displayed.');
 }
 if(offer.supplier==='johnstone'){
  const primary=body.split(/\nSimilar items\n|\nFrequently bought with\n/i)[0]!;
  const pricing=primary.split(/My Johnstone Supply Price\s*\n/)[1]?.split(/\nAvailability\n/)[0]??'';const prices=pricing.match(/\$[\d,]+\.\d{2}/g)??[];
  result.price.amount=prices.length===1?Number(prices[0]!.replace(/[$,]/g,'')):null;result.price.text=pricing;
  const branch=body.match(/Get Directions\s*\n([^\n]+) - #(\d+)\s*\n\s*([^\n]+)\n([^\n]+,\s*[A-Z]{2}\s+\d{5})/);
  if(branch)result.branches.push({id:branch[2]!,name:branch[1]+' #'+branch[2],address:branch[3]!.replace(/,\s*Fleet Industrial Park/i,'')+', '+branch[4],stockQuantity:null,quantityBasis:'unknown',pickupReady:null,evidence});
  result.issues.push(/Requesting price|Loading/i.test(pricing)?'Supplier price panel did not finish loading within the bounded wait.':'Purchase unit, currency or branch inventory remains unverified.');
 }
 if(offer.supplier==='grainger'){
  const price=purchaseText.match(/Web Price\s*\n\$([\d,]+\.\d{2})\s*\/\s*each\b/i)?.[1];
  result.price={...result.price,amount:price?Number(price.replaceAll(',','')):null,currency:/\bUSD\b/.test(purchaseText)?'USD':null,unit:price?'each':null,packSize:price?1:null,text:purchaseText};
  result.shipping={...result.shipping,arrivalDate:parseArrival(purchaseText,evidence.observedAt),destinationZip:purchaseText.match(/Ship to (\d{5})\b/)?.[1]??null,quantityConfirmed:quantity===1&&quantityValue==='1',text:purchaseText};
  result.branches=parseGraingerBranches(body,evidence);
  result.issues.push('Web price is public catalog pricing. Currency, condition and numeric shipping stock are not stated in the reviewed panel.','Only branches displayed by the supplier were inspected; future pickup is not immediate in-stock pickup.');
  if(quantity!==1)result.issues.push('Arrival quote is not independently bound to a changed quantity; only the reviewed default quantity of one is supported.');
 }
 return result;
}
export async function graingerPanel(page:Page,sku:string){
 return page.evaluate((id)=>{
  const input=document.getElementById(`input-qty-${id}-1`) as HTMLInputElement|null;let node=input?.parentElement;let text='';
  for(let i=0;node&&i<14;i++,node=node.parentElement){const t=node.innerText;if(node.querySelectorAll('input[id^="input-qty-"]').length>1)break;if(t.includes('Web Price'))text=t;if(t.includes('Shipping/Pickup')){text=t;break;}}
  return {text,quantityValue:input?.value??'',body:document.body?.innerText??''};
 },sku);
}
async function visibleControl(page:Page,selector:string){
 for(let i=0;i<20;i++){if(await page.evaluate(s=>{const e=document.querySelector(s);return Boolean(e&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height);},selector))return;await new Promise(r=>setTimeout(r,300));}
 throw new Error('Commercial control did not become visible: '+selector);
}
export async function collectCommercial(jobId:string,offer:Offer,line:SearchInput['lines'][number],origin:SearchInput['origin']):Promise<CommercialObservation>{
 const sh=await getBrowser(),page=(await sh.browser.context.activePage())!;const issues:string[]=[];
 if(offer.supplier==='grainger'){
  const sku=offer.supplierSku;if(!sku||!/^[A-Z0-9]+$/.test(sku))throw new Error('Main product SKU unavailable for commercial panel binding');
  const zip=origin?.address.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1];
  try{
   await page.locator('#rta-options-ship-1').click();
   const initial=await graingerPanel(page,sku);
   if(zip&&!initial.text.includes('Ship to '+zip)){
    await page.locator('button[aria-label^="Change zipcode"]').click();await page.locator('#rta-zip').fill(zip);await page.locator('button[aria-label="Save ZIP Code"]').click();
   }
   // Quantity controls are product-bound; changing them never submits a cart.
   if((await graingerPanel(page,sku)).quantityValue!==String(line.quantity)){await page.locator(`#input-qty-${sku}-1`).fill(String(line.quantity));await page.locator('h1').click();}
  }catch{issues.push('Shipping context controls could not be verified; destination and quantity checks still apply.');}
  let panel=await graingerPanel(page,sku);
  for(let i=0;i<20;i++){if(panel.text.includes('Web Price')&&(!zip||panel.text.includes('Ship to '+zip))&&/Expected to arrive|not available|Call for/i.test(panel.text))break;await new Promise(r=>setTimeout(r,400));panel=await graingerPanel(page,sku);}
  const evidence=await saveEvidence(jobId,'grainger-step6-shipping');const result=parseCommercial(offer,line.quantity,panel.body,panel.text,panel.quantityValue,evidence,line.name);
  try{
   await page.locator('#rta-options-pickup-1').click();await visibleControl(page,'button[aria-label^="Change pickup branch"]');await page.locator('button[aria-label^="Change pickup branch"]').click();
   await visibleControl(page,'[data-testid="fab-search"]');
   if(zip){await page.locator('[data-testid="fab-search"]').fill(zip);await page.keyPress('Enter');}
   let body=await page.evaluate(()=>document.body.innerText);for(let i=0;i<15&&!/Branches Nearby/.test(body);i++){await new Promise(r=>setTimeout(r,400));body=await page.evaluate(()=>document.body.innerText);}
   const branchEvidence=await saveEvidence(jobId,'grainger-step6-branches');result.branches=parseGraingerBranches(body,branchEvidence);
   if(!result.branches.length)issues.push('Branch inventory panel could not be parsed; no pickup conclusion was made.');
  }catch(error){console.warn('[step6] branch inspection failed:',error instanceof Error?error.message:'Unknown inspection failure');issues.push('Branch lookup unavailable; pickup stock remains unknown.');}
  result.issues.push(...issues);return result;
 }
 let body=await page.evaluate(()=>document.body.innerText);
 if(offer.supplier==='johnstone')for(let i=0;i<12&&/Requesting price/.test(body);i++){await new Promise(r=>setTimeout(r,500));body=await page.evaluate(()=>document.body.innerText);}
 const evidence=await saveEvidence(jobId,offer.supplier+'-step6-commercial');return parseCommercial(offer,line.quantity,body,'','',evidence,line.name);
}
