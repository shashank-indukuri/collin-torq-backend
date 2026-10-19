import {productIdentityScript} from './catalog-identity.js';
import {browserEndpoint,waitForBrowserEndpoint,reconnectableBrowser,rememberBrowserRuntime,closeRecordedBrowser} from './browser-runtime.js';
import {retainRecoveryPage,validateProductRecovery,type ProductRecovery} from './recovery-policy.js';
import {randomUUID} from 'node:crypto';
import { localBrowser, Stagehand, type StagehandBrowser } from '@browserbasehq/stagehand';
import {runRecoveryProcess} from './recovery-process.js';
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openSync, readFileSync, unlinkSync, writeFileSync, closeSync } from 'node:fs';
import { config } from './config.js';
import {modelClient} from './model.js';
import {cloudProxy,closeCloudProxy} from './cloud-provider.js';

// One queue controls all operations, including manual connection sessions and recovery.
let tail: Promise<unknown> = Promise.resolve();
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = tail.then(fn, fn); tail = next.catch(() => {}); return next;
}
let browser: StagehandBrowser | undefined;
let stagehand: Stagehand | undefined;
const lockPath = join(config.dataDir,'browser-owner.lock');
let ownsLock = false;
function acquireLock() {
  for(let attempt=0;attempt<2;attempt++) {
    try { const fd=openSync(lockPath,'wx',0o600);writeFileSync(fd,String(process.pid));closeSync(fd);ownsLock=true;return; }
    catch(e) {
      if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
      const owner=Number(readFileSync(lockPath,'utf8'));
      try { process.kill(owner,0); }
      catch(error) { if((error as NodeJS.ErrnoException).code==='ESRCH'){unlinkSync(lockPath);continue;} throw error; }
      throw new Error(`Browser is owned by process ${owner}. Stop the other backend or test before starting another.`);
    }
  }
  throw new Error('Could not acquire browser ownership');
}
export async function getBrowser() {
  // Stagehand's client can be closed by a failed local-model handoff while the
  // Chrome process is still present. Never hand a cached, dead RPC client to a
  // new supplier request; reset the local connection and relaunch from the
  // persistent Chrome profile instead.
  if (stagehand) {
    try { await stagehand.browser.context.pages(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/RPC client is closed|Stagehand is unavailable|CDP connection.*closed/i.test(message)) throw error;
      try { await closeBrowser(); } catch { /* closeBrowser clears stale handles even when shutdown reports an error */ }
    }
  }
  if (!browser) {
    acquireLock();
    try {
      const profile=join(config.dataDir,'chrome');const runtimePath=join(config.dataDir,'browser-runtime.json');
      const existing=await browserEndpoint(config.chromePort);
      if(existing){
        // A crashed owner can leave initialized extension state that this SDK
        // cannot reinitialize. Gracefully restart only the recorded instance.
        await reconnectableBrowser(runtimePath,profile,config.chromePort,existing);
        await closeRecordedBrowser(existing);
        const deadline=Date.now()+5000;
        while(await browserEndpoint(config.chromePort)){if(Date.now()>=deadline)throw new Error('Verified orphan browser is still running');await new Promise(r=>setTimeout(r,200));}
      }
      {
        browser=await localBrowser.launch({executablePath:config.chromePath,headless:config.headless,port:config.chromePort,
          userDataDir:profile,preserveUserDataDir:true,viewport:{width:1280,height:900},args:['--remote-debugging-address=127.0.0.1']});
        const endpoint=await waitForBrowserEndpoint(config.chromePort);
        await rememberBrowserRuntime(runtimePath,profile,config.chromePort,endpoint);
      }
    }catch(e){try{await browser?.close();}finally{browser=undefined;if(ownsLock){unlinkSync(lockPath);ownsLock=false;}}throw e;}
  }
  if (!stagehand) stagehand = await Stagehand.create({ browser, model: modelClient, cache: false });
  return stagehand;
}
export async function closeBrowser() {
  try { await stagehand?.close(); }
  finally {
    stagehand=undefined;
    try { await browser?.close(); }
    finally {browser=undefined;if(ownsLock){unlinkSync(lockPath);ownsLock=false;}await closeCloudProxy();}
  }
}
export async function recover(url: string, objective: string, domains: string[],goal?:ProductRecovery) {
  if (!config.recovery) throw new Error('Recovery disabled');
  const target = new URL(url);
  const fixture=target.hostname==='127.0.0.1'&&target.pathname.startsWith('/fixtures/');
  if(!fixture){if(!goal)throw new Error('Live recovery requires a typed goal');validateProductRecovery(url,domains,goal);}
  const targetId = (await stagehand?.browser.context.activePage())?.pageId;
  if (!targetId) throw new Error('Recovery requires an active page');
  // Browser Use applies its domain watchdog to every existing tab on attach.
  // Keep only the target in our dedicated application browser before handing off.
  await retainRecoveryPage(await stagehand!.browser.context.pages(),targetId);
  // Candidate metadata is already observed and bounded. Attach Browser Use to a
  // quiet document, avoiding supplier iframe/event storms before the model runs.
  if(goal)await (await stagehand!.browser.context.activePage())!.goto('about:blank');
  // Stop Stagehand RPC before Browser Use attaches. Browser remains application-owned.
  // Clear the cached object before calling close: close can itself fail when
  // the RPC transport has already been torn down. Leaving it cached poisons
  // every later supplier check with "RPC client is closed".
  const recoveryStagehand=stagehand;stagehand=undefined;
  try { await recoveryStagehand?.close(); }
  catch (error) {
    try { await closeBrowser(); } catch { /* reset handles regardless of close outcome */ }
    throw new Error(`Could not hand the browser to recovery because the Stagehand connection was closed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  try{
  const remote=config.modelProvider==='openai'?await cloudProxy():undefined;
  const result = await runRecoveryProcess({cdpUrl:`http://127.0.0.1:${config.chromePort}`,targetId,url,objective,domains,goal,identityScript:goal?productIdentityScript(new URL(goal.candidates[0]!.url).hostname,goal.partNumber,goal.manufacturer):undefined,
    provider:config.modelProvider,proxy:remote,model:remote?config.openaiModel:config.model,host:config.ollamaUrl,context:config.context,maxSteps:config.recoverySteps,timeout:config.modelTimeout/1000},
    {timeoutMs:config.modelTimeout*2,onProgress:phase=>console.info('[recovery]',phase),onLog:output=>{void appendFile(join(config.dataDir,'recovery.log'),output+'\n',{mode:0o600}).catch(()=>{});}});
  if(goal&&result.successful&&result.identityVerification?.matched!==true)throw new Error('Recovery navigation did not verify exact product identity');
  return result;
  }finally{
    const sh=await getBrowser();const page=(await sh.browser.context.pages()).find(p=>p.pageId===targetId);
    if(!page)throw new Error('Recovery lost the original supplier tab');await sh.browser.context.setActivePage(page);
  }
}

export async function saveEvidence(id: string, label: string) {
  const sh = await getBrowser();
  const page = await sh.browser.context.activePage();
  if (!page) throw new Error('No browser page');
  const folder = join(config.dataDir, 'evidence', id);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const name = label.replace(/[^a-z0-9-]/gi, '-').slice(0,150)+'-'+randomUUID();
  await page.screenshot({ path: join(folder, `${name}.png`),fullPage:true });
  return { screenshot: `${name}.png`, url: await page.url(), observedAt: new Date().toISOString() };
}

/** Broader read-only control recovery; product evidence is re-extracted and
 * validated by the caller after handoff, never trusted from agent success text. */
export async function recoverWorkflow(objective:string,hostName:string,allowedValues:string[]) {
  if(!config.recovery)throw new Error('Recovery disabled');
  const current=await getBrowser(),page=await current.browser.context.activePage();
  if(!page||new URL(await page.url()).hostname!==hostName)throw new Error('Workflow recovery needs an active supplier page');
  const targetId=page.pageId;await retainRecoveryPage(await current.browser.context.pages(),targetId);
  const previous=stagehand;stagehand=undefined;
  try {await previous?.close();}
  catch(error){try{await closeBrowser();}catch{}throw error;}
  try{
    const remote=config.modelProvider==='openai'?await cloudProxy():undefined;
    return await runRecoveryProcess({cdpUrl:`http://127.0.0.1:${config.chromePort}`,targetId,objective,hostName,allowedValues,
      provider:config.modelProvider,model:remote?config.openaiModel:config.model,proxy:remote,host:config.ollamaUrl,context:config.context,maxSteps:Math.min(8,config.agentSteps),timeout:config.modelTimeout/1000},
      {args:['python/workflow_agent.py'],timeoutMs:Math.min(config.agentTimeout,config.modelTimeout*3),onProgress:phase=>console.info('[workflow-recovery]',phase),onLog:output=>{void appendFile(join(config.dataDir,'workflow-recovery.log'),output+'\n',{mode:0o600}).catch(()=>{});}});
  }finally{
    const resumed=await getBrowser(),target=(await resumed.browser.context.pages()).find(p=>p.pageId===targetId);
    if(!target)throw new Error('Workflow recovery lost its supplier tab');await resumed.browser.context.setActivePage(target);
  }
}
