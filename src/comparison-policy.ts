import {normalizePart,type Offer} from './domain.js';
import {distanceMiles,type GeoResolution} from './geocoding.js';
import {source1YorkIdentity} from './identity.js';
export type Evidence={url:string;screenshot:string;observedAt:string};
export type CommercialObservation={status:'observed'|'unavailable';manufacturer:string;partNumber:string;requestedQuantity:number;
 price:{amount:number|null;currency:'USD'|null;unit:'each'|'pack'|null;packSize:number|null;condition:'new'|'refurbished'|null;basis:'public_displayed'|'account_unverified';text:string};
 shipping:{quantity:number|null;quantityBasis:'each'|'unknown';arrivalDate:string|null;destinationZip:string|null;quantityConfirmed:boolean;text:string};
 branches:{id:string;name:string;address:string;stockQuantity:number|null;quantityBasis:'each'|'unknown';pickupReady:boolean|null;location?:GeoResolution;distanceMiles?:number;evidence:Evidence}[];
 evidence:Evidence;issues:string[]};
export type ComparisonChoice={supplier:Offer['supplier'];partNumber:string;sourceUrl:string;materialSubtotal:number|null;branchId?:string;distanceMiles?:number;arrivalDate?:string;evidence:Evidence};
export function compareOffers(offers:Offer[],requested:{manufacturer?:string;partNumber?:string;quantity:number},origin:GeoResolution,now=Date.now()){
 const cheapest:ComparisonChoice[]=[],closest:ComparisonChoice[]=[],shipping:ComparisonChoice[]=[],excluded:{supplier:string;reasons:string[]}[]=[];
 const fresh=(e:Evidence)=>{const age=now-Date.parse(e.observedAt);return Boolean(e.screenshot)&&age>=-60000&&age<=15*60*1000;};
 const originZip=origin.address.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1];
 for(const offer of offers){
  const o=offer.commercial;const reasons:string[]=[];
  if(offer.synthetic||offer.match!=='exact'||!requested.partNumber||normalizePart(offer.partNumber)!==normalizePart(requested.partNumber))reasons.push('Exact non-synthetic identity required; unapproved alternatives are excluded.');
  if(!requested.manufacturer||(offer.manufacturer.trim().toLowerCase()!==requested.manufacturer.trim().toLowerCase()&&!source1YorkIdentity(offer.supplier,offer.manufacturer,offer.partNumber,requested.manufacturer,requested.partNumber)))reasons.push('Requested manufacturer does not match the verified identity.');
  if(!o||o.status!=='observed'||!fresh(o.evidence)||o.requestedQuantity!==requested.quantity||normalizePart(o.partNumber)!==normalizePart(offer.partNumber)||o.manufacturer.trim().toLowerCase()!==offer.manufacturer.trim().toLowerCase()||o.evidence.url!==offer.sourceUrl)reasons.push('Fresh product-bound commercial evidence is missing or mismatched.');
  const specConflicts=o?.issues.filter(issue=>issue.startsWith('Requested specification conflict:'))??[];
  if(specConflicts.length){excluded.push({supplier:offer.supplier,reasons:specConflicts});continue;}
  if(reasons.length){excluded.push({supplier:offer.supplier,reasons});continue;}
  const observed=o!;
  const p=observed.price;const pack=p.packSize;
  const unitKnown=(p.unit==='each'&&pack===1)||(p.unit==='pack'&&Number.isInteger(pack)&&pack!>0);
  const cents=p.amount===null?null:Math.round(p.amount*100),totalCents=unitKnown&&cents!==null?Math.ceil(requested.quantity/pack!)*cents:NaN;
  const total=unitKnown&&cents!==null&&Number.isSafeInteger(cents)&&Number.isSafeInteger(totalCents)&&cents>=0&&p.currency==='USD'?totalCents/100:null;
  const required=unitKnown?Math.ceil(requested.quantity/pack!)*pack!:requested.quantity;
  const sufficientBranches=observed.branches.filter(b=>unitKnown&&fresh(b.evidence)&&b.pickupReady===true&&b.quantityBasis==='each'&&Number.isSafeInteger(b.stockQuantity)&&b.stockQuantity!==null&&b.stockQuantity>=required);
  const shipQuantity=observed.shipping.quantityBasis==='each'&&Number.isSafeInteger(observed.shipping.quantity)&&observed.shipping.quantity!==null&&observed.shipping.quantity>=required;
  const choice:ComparisonChoice={supplier:offer.supplier,partNumber:offer.partNumber,sourceUrl:offer.sourceUrl,materialSubtotal:total,evidence:observed.evidence};
  if(total!==null&&p.condition==='new'&&(shipQuantity||sufficientBranches.length))cheapest.push(choice);
  else reasons.push('Cheapest needs USD purchase units, new condition and sufficient evidenced quantity; tax/freight are excluded.');
  for(const branch of sufficientBranches){if(origin.status==='resolved'&&origin.point&&branch.location?.status==='resolved'&&branch.location.point)closest.push({...choice,branchId:branch.id,distanceMiles:distanceMiles(origin.point,branch.location.point),evidence:branch.evidence});}
  if(!sufficientBranches.some(b=>b.location?.point)||!origin.point)reasons.push('Closest needs sufficient ready pickup stock, a resolved branch location and origin.');
  const arrival=observed.shipping.arrivalDate;
  if(arrival&&/^\d{4}-\d{2}-\d{2}$/.test(arrival)&&Number.isFinite(Date.parse(arrival))&&new Date(arrival).toISOString().slice(0,10)===arrival&&arrival>=new Date(now).toISOString().slice(0,10)&&observed.shipping.quantityConfirmed&&originZip&&observed.shipping.destinationZip===originZip)shipping.push({...choice,arrivalDate:arrival});
  else reasons.push('Fastest needs a future arrival date for the requested quantity and destination ZIP; dispatch text is insufficient.');
  if(reasons.length)excluded.push({supplier:offer.supplier,reasons});
 }
 const winners=(options:ComparisonChoice[],value:(o:ComparisonChoice)=>number)=>{const sorted=[...options].sort((a,b)=>value(a)-value(b)||a.supplier.localeCompare(b.supplier)||(a.branchId??'').localeCompare(b.branchId??''));return sorted.length?sorted.filter(o=>value(o)===value(sorted[0]!)):[];};
 return {evaluatedAt:new Date(now).toISOString(),cheapest:{basis:'material_subtotal_excludes_tax_freight',winners:winners(cheapest,o=>o.materialSubtotal!)},closest:{basis:origin.basis==='census_zcta_reference'?'approximate_straight_line_from_zip_area':'straight_line_miles',winners:winners(closest,o=>o.distanceMiles!)},fastestShipping:{basis:'supplier_estimated_arrival_date',winners:winners(shipping,o=>Date.parse(o.arrivalDate!))},excluded,limitations:['Winners are limited to verified observations; incomplete supplier coverage can hide a better option.','Product identity does not confirm installed-equipment compatibility.','Shipping dates are supplier estimates; distance is not driving time.','Price and inventory evidence expires for ranking after 15 minutes.']};
}
