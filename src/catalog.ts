import {catalogIdentity} from './catalog-identity.js';
import {offerSchema,normalizePart,type RawOffer,type QueryInspection} from './domain.js';
/** Absence must belong to the exact search, never a product's empty recommendation widget. */
export function supplierSearchNoMatch(supplier:'johnstone'|'partstown',url:string,headings:string[],partNumber:string,body=''){
 try{
  const u=new URL(url);const host=supplier==='johnstone'?'www.johnstonesupply.com':'www.partstown.com';
  const query=u.searchParams.get(supplier==='johnstone'?'searchPhrase':'q');
  const explicit=supplier==='johnstone'?body.split(/Popular Products/i)[0]!.match(/Search was unable to find any results for\s*"([^"\n]+)"/i)?.[1]:undefined;
  const absence=headings.some(h=>/no products matched|no results found|unable to find any results|there are no products matching|we could not find any matches/i.test(h))||Boolean(explicit&&normalizePart(explicit)===normalizePart(partNumber));
  return u.protocol==='https:'&&u.hostname===host&&u.pathname==='/search'&&Boolean(partNumber.trim())&&normalizePart(query??'')===normalizePart(partNumber)&&absence;
 }catch{return false;}
}
// Reviewed Parts Town labels, scoped to the main product before recommendations.
// This is catalog evidence; authentication/account pricing is tracked separately.
export function partsTownCatalog(body:string,manufacturer:string,partNumber:string):RawOffer|null{
 const primary=body.split(/FREQUENTLY BOUGHT TOGETHER|ALSO OF INTEREST/i)[0]!;
 const identity=catalogIdentity(body,'partstown');
 if(!identity||identity.manufacturer.toLowerCase()!==manufacturer.trim().toLowerCase()||normalizePart(identity.partNumber)!==normalizePart(partNumber))return null;
 const price=primary.match(/My Price:\s*\$\s*([\d,]+\.\d{2})/i)?.[1];
 const each=/Units:\s*Each\b/i.test(primary);
 return offerSchema.parse({...identity,supplierSku:identity.supplierSku||null,
 price:price?Number(price.replaceAll(',','')):null,currency:/\bUSD\b/.test(body)?'USD':null,unit:each?'each':null,packSize:each?1:null,
 branch:null,stockQuantity:null,pickupReady:null,stockText:/\bIn Stock\b/i.test(primary)?'Product page says In Stock; local branch stock is unverified.':'Product inventory unverified.',
 shippingText:primary.match(/Ships from[^\n\r]+/i)?.[0]?.trim()??null,condition:null});
}

/** Grainger renders unrelated suggestions on an exact-query no-results page.
 * Require both the query-specific document title and visible suggestion heading;
 * a stale title, unrelated recommendation, or query input cannot prove absence. */
export function graingerNoExactResults(url:string,title:string,body:string,partNumber:string){
 try{
  const u=new URL(url);if(u.hostname!=='www.grainger.com'||u.pathname!=='/search'||normalizePart(u.searchParams.get('searchQuery')??'')!==normalizePart(partNumber))return false;
  const missing=title.match(/^No results found for:\s*["“]([^"”]+)["”]\s*-\s*Grainger Industrial Supply$/i)?.[1];
  const suggested=body.match(/Suggested results for\s*["“]([^"”]+)["”]/i)?.[1];
  return Boolean(missing&&suggested&&normalizePart(missing)===normalizePart(partNumber)&&normalizePart(suggested)===normalizePart(partNumber));
 }catch{return false;}
}

/** Reviewed Johnstone product labels, bounded before substitutions and recommendations. */
export function johnstoneCatalog(body:string):RawOffer|null{
 const identity=catalogIdentity(body,'johnstone');if(!identity)return null;
 const pricing=body.split(/My Johnstone Supply Price\s*\n/)[1]?.split(/\nAvailability\s*\n/)[0];
 const prices=pricing?.match(/\$[\d,]+\.\d{2}/g)??[];
 return offerSchema.parse({...identity,price:prices.length===1?Number(prices[0]!.replace(/[$,]/g,'')):null,
 currency:null,unit:null,packSize:null,branch:null,stockQuantity:null,pickupReady:null,stockText:pricing?.match(/Available in[^\n]+|In Stock/i)?.[0]??'Branch inventory unverified.',shippingText:null,condition:null});
}

/** Grainger main-product identifiers, excluding recommendation sections. Prices
 * are left unknown here because the purchase panel can follow recommendations. */
export function graingerProductIdentity(body:string):RawOffer|null{
 const identity=catalogIdentity(body,'grainger');if(!identity)return null;
 return offerSchema.parse({...identity,
 price:null,currency:null,unit:null,packSize:null,branch:null,stockQuantity:null,pickupReady:null,stockText:'Branch inventory unverified.',shippingText:null,condition:null});
}

export function graingerCatalog(body:string,manufacturer:string,partNumber:string):RawOffer|null{
 const raw=graingerProductIdentity(body);return raw&&raw.manufacturer.toLowerCase()===manufacturer.trim().toLowerCase()&&normalizePart(raw.partNumber)===normalizePart(partNumber)?raw:null;
}
/** A complete returned query set is inspectable, unlike an arbitrary slice or recommendations. */
export function inspectedGraingerNoMatch(queryUrl:string,body:string,partNumber:string,products:QueryInspection['products']):QueryInspection|null{
 try{
  const u=new URL(queryUrl);const query=body.match(/Showing results for\s*"([^"\n]+)"/i)?.[1];
  const count=Number(body.match(/Showing results for[^\n]*\n\s*(?:Available\s+)?(\d+) products?/i)?.[1]??0);
  if(u.hostname!=='www.grainger.com'||!u.pathname.startsWith('/category/')||normalizePart(u.searchParams.get('searchQuery')??'')!==normalizePart(partNumber)||!query||normalizePart(query)!==normalizePart(partNumber)||count<1||count>5||products.length!==count||new Set(products.map(p=>p.sourceUrl)).size!==count)return null;
  if(products.some(p=>p.evidence.url!==p.sourceUrl||!p.evidence.screenshot||!Number.isFinite(Date.parse(p.evidence.observedAt))||!p.manufacturer.trim()||!p.partNumber.trim()||normalizePart(p.partNumber)===normalizePart(partNumber)||!/^https:\/\/www\.grainger\.com\/product\/[^/]+/.test(p.sourceUrl)))return null;
  return {kind:'inspected_query_results',queryUrl,returnedCount:count,products};
 }catch{return null;}
}
