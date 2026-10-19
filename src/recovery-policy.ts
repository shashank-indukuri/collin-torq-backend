export const recoveryHosts=['www.johnstonesupply.com','www.partstown.com','www.grainger.com'] as const;
export type ProductRecovery={kind:'product';partNumber:string;manufacturer?:string;candidates:{url:string;text:string}[]};
/** Dedicated application browser only. Saved evidence outlives these read-only tabs. */
export async function retainRecoveryPage(pages:{pageId:string;close:()=>Promise<unknown>}[],targetId:string){
 if(!pages.some(p=>p.pageId===targetId))throw new Error('Recovery lost the original supplier tab');
 for(const page of pages)if(page.pageId!==targetId)await page.close();
}
export function safeProductUrl(value:string,host:string){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!==host||u.port||value.includes('#')||u.username||u.password)return false;
 if([...u.searchParams.keys()].some(k=>/redirect|return|next|target|url|callback|continue/i.test(k)))return false;
 if(/cart|checkout|order|login|logout|signout|account|delete|remove/i.test(u.pathname+u.search))return false;
 return (host==='www.johnstonesupply.com'&&/^\/product-view\/?$/.test(u.pathname))||(host==='www.grainger.com'&&/^\/product\/[^/]+\/?$/.test(u.pathname))||(host==='www.partstown.com'&&( /^\/p\/[^/]+\/[^/]+\/?$/.test(u.pathname)||/^\/york\/yorks1-[a-z0-9-]+\/?$/i.test(u.pathname)));
 }catch{return false;}
}
export function validateProductRecovery(url:string,domains:string[],goal:ProductRecovery){
 const u=new URL(url);if(u.protocol!=='https:'||!recoveryHosts.includes(u.hostname as typeof recoveryHosts[number])||domains.length!==1||domains[0]!==u.hostname)throw new Error('Recovery requires a single supported supplier domain');
 if(!goal.partNumber.trim()||!goal.candidates.length||goal.candidates.length>12||goal.candidates.some(c=>!safeProductUrl(c.url,u.hostname)))throw new Error('Recovery requires a bounded list of verified read-only product links');
}

export function findExactProductLink(links:{href:string;text:string;context?:string}[],currentUrl:string,partNumber:string){
 const current=new URL(currentUrl);if(safeProductUrl(currentUrl,current.hostname))return undefined;
 const normalized=(v:string)=>v.toUpperCase().replace(/[\s-]/g,'');const wanted=normalized(partNumber);
 return links.find(link=>safeProductUrl(link.href,current.hostname)&&wanted&&((link.text+' '+(link.context??'')).match(/[a-z0-9]+(?:[-][a-z0-9]+)*/gi)??[]).some(token=>normalized(token)===wanted));
}
