import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {z} from 'zod';
import type {GuideRequest,GuideResolution} from './guides.js';
import {normalizeModel} from './guides.js';
import {searchWeb,chooseLinks,readWebDocument,downloadPublicPdf,structured} from './discovery.js';
export type Pages={page:number;text:string}[];
const quote=z.object({page:z.number().int().positive(),text:z.string().min(1).max(1500)});
export const generalGuideAnalysis=z.object({manufacturer:z.string().min(1),manufacturerEvidence:quote,title:z.string(),documentNumber:z.string(),revision:z.string(),models:z.array(z.object({model:z.string().min(1).max(120),evidence:quote})).max(100),warnings:z.array(z.string()).max(10)});
type Analysis=z.infer<typeof generalGuideAnalysis>;
const manifestSchema=z.object({schemaVersion:z.literal(2),sha256:z.string().regex(/^[a-f0-9]{64}$/),sourceUrl:z.url(),retrievedAt:z.iso.datetime(),analysis:generalGuideAnalysis});
export type GeneralGuideDependencies={discover?:(request:GuideRequest)=>Promise<string[]>;download?:(url:string)=>Promise<Buffer>;extractPdf?:(path:string)=>Promise<Pages>;analyze?:(pages:Pages,request:GuideRequest)=>Promise<Analysis>};
const key=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const literal=(quoteText:string,text:string)=>text.replace(/\s+/g,' ').toLowerCase().includes(quoteText.replace(/\s+/g,' ').toLowerCase());
export function validateGuideAnalysis(raw:Analysis,pages:Pages,request:GuideRequest){
 const analysis=generalGuideAnalysis.parse(raw);const page=(n:number)=>pages.find(p=>p.page===n)?.text??'';
 if(key(analysis.manufacturer)!==key(request.manufacturer)||!literal(analysis.manufacturerEvidence.text,page(analysis.manufacturerEvidence.page))||!literal(analysis.manufacturer,analysis.manufacturerEvidence.text))throw new Error('GUIDE_MANUFACTURER_EVIDENCE_MISSING');
 const models=analysis.models.filter(m=>literal(m.evidence.text,page(m.evidence.page))&&/model|applicab|parts\s+(?:list|catalog)|unit/i.test(m.evidence.text)&&(m.evidence.text.match(/[a-z0-9]+(?:[.-][a-z0-9]+)*/gi)??[]).some(token=>normalizeModel(token)===normalizeModel(m.model)));
 if(!models.length)throw new Error('GUIDE_MODEL_COVERAGE_UNVERIFIED');return {...analysis,models};
}
async function extractPdf(path:string):Promise<Pages>{const {stdout}=await promisify(execFile)(resolve('.venv/bin/python'),[resolve('python/read_guide.py'),path],{timeout:30000,maxBuffer:4*1024*1024});return z.object({pages:z.array(z.object({page:z.number().int().positive(),text:z.string()})).min(1).max(100)}).parse(JSON.parse(stdout)).pages;}
async function discover(request:GuideRequest){
 const urls:string[]=[];
 // Door order follows the flow. Dealer portals require an administrator-provided
 // integration; public searches never receive supplier credentials.
 for(const scope of ['', 'site:johnstonesupply.com', 'site:partstown.com']){
  const search=await searchWeb(`${request.manufacturer} ${request.model} parts list guide pdf ${scope}`);
  const links=await chooseLinks(search,`Manufacturer-authored parts guide for ${request.manufacturer} ${request.model}; prefer manufacturer-hosted PDF, then supplier model/guide pages`,2);
  for(const link of links){if(/\.pdf(?:\?|$)/i.test(link.url)){urls.push(link.url);continue;}
   try{const doc=await readWebDocument(link.url);for(const pdf of await chooseLinks(doc,`PDF parts guide covering ${request.model}`,2))if(/\.pdf(?:\?|$)/i.test(pdf.url))urls.push(pdf.url);}catch{/* Other observed candidates can still be inspected. */}
  }
  if(urls.length>=3)break;
 }
 return [...new Set(urls)].slice(0,4);
}
async function analyze(pages:Pages,request:GuideRequest){
 // Keep complete selected pages: do not truncate table rows midway and then infer alignment.
 const selected=pages.filter(p=>p.page===1||p.text.toUpperCase().includes(request.model.toUpperCase())||/model|parts list/i.test(p.text)).slice(0,10);
 let size=0;const bounded=selected.filter(p=>(size+=p.text.length)<=44000);
 return structured(generalGuideAnalysis,'Identify the manufacturer and EXPLICIT applicable full model listings in this parts guide. Each model needs a literal page quote containing its model token and an applicability/table/title heading. Incidental mentions and replacement examples are not coverage. Include manufacturer evidence. Do not invent suffixes. Return empty models if applicability is uncertain. Document metadata unavailable in the pages must be "not stated". Preserve warnings about serial ranges, revisions and missing pages.',{requested:request,pages:bounded});
}
async function record(directory:string,hash:string,deps:GeneralGuideDependencies){
 const saved=manifestSchema.parse(JSON.parse(await readFile(join(directory,hash+'.general.json'),'utf8')));if(saved.sha256!==hash)throw new Error('GUIDE_HASH_MISMATCH');
 const bytes=await readFile(join(directory,hash+'.pdf'));if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('GUIDE_INTEGRITY_FAILED');
 const pages=await (deps.extractPdf??extractPdf)(join(directory,hash+'.pdf'));return {saved,pages};
}
export async function generalGuidePages(directory:string,hash:string,deps:GeneralGuideDependencies={}){try{return (await record(directory,hash,deps)).pages;}catch{return null;}}
export async function resolveGeneralGuide(directory:string,requested:GuideRequest,deps:GeneralGuideDependencies={}):Promise<GuideResolution>{
 const model=normalizeModel(requested.model,requested.manufacturer);const result:GuideResolution={status:'not_found',requested,normalizedModel:model,cacheHit:false,attempts:[],guide:null,message:'No guide with verified model coverage was found. Supply the full model or exact part number.'};
 const apply=(saved:z.infer<typeof manifestSchema>,pages:Pages)=>{
  const a=validateGuideAnalysis(saved.analysis,pages,requested);const coveredModels=[...new Set(a.models.map(m=>normalizeModel(m.model)))],matchingModels=coveredModels.filter(m=>m===model||m.startsWith(model));if(!matchingModels.length)return false;
  const exact=coveredModels.includes(model);const declared=Math.max(pages.length,...pages.flatMap(p=>Array.from(p.text.matchAll(/\b\d+\s+of\s+(\d+)\b/gi),m=>Number(m[1]))));
  result.guide={sourceUrl:saved.sourceUrl,manufacturer:a.manufacturer,publisher:a.manufacturer,title:a.title,documentNumber:a.documentNumber,revision:a.revision,sha256:saved.sha256,retrievedAt:saved.retrievedAt,hostType:'unverified_public_source',discoveryMethod:'agent',evidenceUrl:`/api/guides/${saved.sha256}/document`,pageCount:pages.length,coveredModels,matchingModels,modelEvidence:a.models.filter(m=>matchingModels.includes(normalizeModel(m.model))).map(m=>m.evidence),applicability:exact?'exact_model_listed':'prefix_only',warnings:[...a.warnings,...(declared>pages.length?[`Incomplete guide: ${pages.length} pages; printed numbering declares ${declared}.`]:[]),'Public source ownership and current supersessions require review.','Model coverage does not verify serial-number applicability or installed modifications.','Requested part extraction and supplier availability have not run.']};
  result.status=exact?'guide_found':'needs_model_confirmation';result.message=exact?'The full model is explicitly listed in the discovered guide. Review source evidence before capturing parts.':'The guide lists longer matching models. Confirm the complete nameplate model; no suffix was assumed.';return true;
 };
 let files:string[]=[];try{files=(await readdir(directory)).filter(f=>/^[a-f0-9]{64}\.general\.json$/.test(f)).slice(0,200);}catch{}
 for(const file of files){try{const {saved,pages}=await record(directory,file.slice(0,64),deps);if(apply(saved,pages)){result.cacheHit=true;result.attempts.push({door:'saved_guides',status:'hit',detail:'PDF checksum and literal coverage evidence revalidated.'});return result;}}catch{/* Never accept damaged or unrelated cached evidence. */}}
 result.attempts.push({door:'saved_guides',status:'miss',detail:'No verified cached model coverage.'},{door:'shop_dealer_portal',status:'not_implemented',detail:'A shop-specific dealer portal has not been configured.'});
 try{
  const urls=await (deps.discover??discover)(requested);result.attempts.push({door:'public_guide_agent',status:urls.length?'hit':'miss',detail:`${urls.length} observed candidate PDF links from manufacturer/open-web and supplier model-page searches. Authenticated dealer/model-to-part portals are not claimed.`});
  for(const url of urls.slice(0,4)){try{
   const bytes=await (deps.download??downloadPublicPdf)(url);if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('GUIDE_NOT_PDF');const sha256=createHash('sha256').update(bytes).digest('hex');await mkdir(directory,{recursive:true,mode:0o700});const path=join(directory,sha256+'.pdf');await writeFile(path,bytes,{mode:0o600});const pages=await (deps.extractPdf??extractPdf)(path);const analysis=validateGuideAnalysis(await (deps.analyze??analyze)(pages,requested),pages,requested);const saved=manifestSchema.parse({schemaVersion:2,sha256,sourceUrl:url,retrievedAt:new Date().toISOString(),analysis});
   if(!apply(saved,pages))continue;const temp=join(directory,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(saved),{mode:0o600});await rename(temp,join(directory,sha256+'.general.json'));return result;
  }catch(error){result.attempts.push({door:'candidate_pdf',status:'error',detail:error instanceof Error?error.message:'Guide validation failed'});}}
 }catch(error){result.status='unavailable';result.attempts.push({door:'public_guide_agent',status:'error',detail:error instanceof Error?error.message:'Discovery failed'});result.message='Guide discovery could not finish. No model coverage or part number was inferred.';}
 return result;
}
