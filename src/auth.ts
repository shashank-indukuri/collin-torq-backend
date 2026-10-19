import type {Page} from '@browserbasehq/stagehand';
import {z} from 'zod';
import {getBrowser} from './browser.js';
export const loginSchema=z.object({username:z.string().min(1).max(200),password:z.string().min(1).max(500),zip:z.string().regex(/^\d{5}$/).default('22201'),storeNumber:z.string().regex(/^\d{1,5}$/).optional(),rememberSession:z.boolean().default(true)}).strict();
export async function signedInControl(page:Page){try{return await page.evaluate(()=>Array.from(document.querySelectorAll('a,button')).some(e=>/^(sign out|log out|logout)$/i.test((e.textContent??'').trim())));}catch{return false;}}
export const credentialSuppliers=['johnstone','partstown'] as const;
export type ConnectionResult={supplier:string;state:'authenticated'|'needs_store_selection'|'challenge'|'credentials_rejected'|'unverified';url:string;message:string};
export async function loginSupplier(supplier:typeof credentialSuppliers[number],raw:z.infer<typeof loginSchema>):Promise<ConnectionResult>{
 const credentials=loginSchema.parse(raw);const sh=await getBrowser();const page=await sh.browser.context.newPage();await sh.browser.context.setActivePage(page);
 const home=supplier==='johnstone'?'https://www.johnstonesupply.com/':'https://www.partstown.com/login';
 await page.goto(home);
 const visible=async(selector:string)=>page.evaluate((s)=>{const e=document.querySelector(s);return Boolean(e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);},selector);
 const until=async(check:()=>Promise<boolean>,ms=10000)=>{const end=Date.now()+ms;while(Date.now()<end){try{if(await check())return true;}catch{/* Navigation can replace the login document. */}await new Promise(r=>setTimeout(r,400));}return false;};
 try{
  if(await signedInControl(page))return {supplier,state:'authenticated',url:await page.url(),message:'Existing signed-in supplier session verified.'};
  if(supplier==='johnstone'){
   if(await visible('#headerBtnSignIn'))await page.locator('#headerBtnSignIn').click();
   if(await until(()=>visible('#modalSignInZipPostalInput'),3000)){
    await page.locator('#modalSignInZipPostalInput').fill(credentials.zip);await page.locator('#modalSignInBtnStep2').click();
   }
   if(credentials.storeNumber&&await until(()=>visible('#modalSignInStore'),5000)){
    const selected=await until(()=>page.evaluate((number)=>{const select=document.querySelector('#modalSignInStore') as HTMLSelectElement|null;const option=Array.from(select?.options??[]).find(o=>o.value===number||new RegExp('#'+number+'(?:\\D|$)').test(o.textContent??''));if(!select||!option)return false;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));return true;},credentials.storeNumber!),10000);
    if(!selected)return {supplier,state:'needs_store_selection',url:await page.url(),message:'The requested account store was not offered for that ZIP.'};
   }
   if(!await until(()=>visible('#modalSignInUsername'))){return {supplier,state:'needs_store_selection',url:await page.url(),message:'Johnstone requires a store selection or a different account ZIP before credentials can be submitted. Use the open Chrome tab to identify the account store.'};}
   await page.locator('#modalSignInUsername').fill(credentials.username);await page.locator('#modalSignInPassword').fill(credentials.password);
   if(credentials.rememberSession)await page.evaluate(()=>{const e=document.querySelector('#modalSignInRemember') as HTMLInputElement|null;if(e){e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));}});
   await page.locator('#modalSignInBtn').click();
  }else{
   if(!await until(()=>visible('#j_username')))throw new Error('Login form unavailable');
   await page.locator('#j_username').fill(credentials.username);await page.locator('#j_password').fill(credentials.password);
   await page.evaluate((remember)=>{const input=document.querySelector('#j_password')!;const form=input.closest('form');const button=form?.querySelector('button[type="submit"]') as HTMLButtonElement|null;if(!button)throw new Error('Login submit unavailable');if(remember){for(const e of form!.querySelectorAll('input[type="checkbox"]')){const c=e as HTMLInputElement;const label=document.querySelector(`label[for="${c.id}"]`);if(/remember/i.test(c.name+' '+(label?.textContent??''))){c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));}}}button.click();},credentials.rememberSession);
  }
  const authenticated=()=>signedInControl(page);
  const success=await until(authenticated,15000);
  const text=await page.evaluate(()=>document.body.innerText);
  const state=success?'authenticated':/verify you are human|captcha|verification code|one.time code|two.factor|access denied/i.test(text)?'challenge':/incorrect|invalid password|invalid username|login failed|not recognized|unable to log|not found|bad credentials/i.test(text)?'credentials_rejected':'unverified';
  return {supplier,state,url:await page.url(),message:success?'Signed-in control verified in the supplier page. Session remains in the dedicated local Chrome profile.':state==='challenge'?'Supplier requires a human challenge or verification; complete it in the dedicated Chrome tab.':state==='credentials_rejected'?'Supplier rejected the supplied login; credentials were not retried.':'Login submission finished but a signed-in control was not verified. Inspect the dedicated Chrome tab.'};
 }catch{return {supplier,state:'unverified',url:await page.url(),message:'Login could not be verified. Inspect the dedicated Chrome tab; no success or account pricing was inferred.'};}
 finally{
  // Never save credentials in app state, browser-use conversations, screenshots or model prompts.
  credentials.password='';credentials.username='';
  try{await page.evaluate(()=>{for(const e of document.querySelectorAll('input[type="password"]'))(e as HTMLInputElement).value='';});}catch{}
 }
}

export async function supplierSession(supplier:typeof credentialSuppliers[number]):Promise<ConnectionResult>{
 const sh=await getBrowser();const host=supplier==='johnstone'?'www.johnstonesupply.com':'www.partstown.com';
 const pages=await sh.browser.context.pages();
 for(const page of pages){try{if(new URL(await page.url()).hostname===host&&await signedInControl(page))return {supplier,state:'authenticated',url:await page.url(),message:'Signed-in supplier control verified.'};}catch{}}
 const page=await sh.browser.context.newPage();await page.goto(`https://${host}/`);await new Promise(r=>setTimeout(r,1200));
 if(await signedInControl(page))return {supplier,state:'authenticated',url:await page.url(),message:'Persisted signed-in supplier session verified.'};
 return {supplier,state:'unverified',url:`https://${host}/`,message:'No signed-in supplier page verified.'};
}
