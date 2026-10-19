import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {agentLookup,SourcingAgentError} from '../src/sourcing-agent.js';
import {supplierCredentials} from '../src/supplier-credentials.js';
import {loginSupplier} from '../src/auth.js';
import {inputSchema,supplierSchema} from '../src/domain.js';
import {closeBrowser,exclusive} from '../src/browser.js';
const supplier=supplierSchema.parse(process.argv[2]??'johnstone'),jobId=randomUUID();
const input=inputSchema.parse({mode:'live',stopAfter:'comparison',origin:{address:'Arlington VA 22201'},suppliers:[supplier],lines:[{name:'defrost control board',manufacturer:'York',partNumber:'S1-33101975102',quantity:1}]});
const started=Date.now();
try{
 const result=await exclusive(async()=>{
  try{return await agentLookup(jobId,input,input.lines[0]!,supplier,false);}
  catch(error){
   if(!(error instanceof SourcingAgentError)||error.code!=='AUTH_REQUIRED'||supplier==='grainger')throw error;
   const credentials=await supplierCredentials(supplier);if(!credentials)throw error;
   try{const login=await loginSupplier(supplier,credentials);if(login.state!=='authenticated')throw new Error('Automatic supplier sign-in was not verified');}
   finally{credentials.username='';credentials.password='';}
   return await agentLookup(jobId,input,input.lines[0]!,supplier,false);
  }
 });
 const report={jobId,supplier,elapsedMs:Date.now()-started,result};await writeFile(`.local/agent-live-${supplier}.json`,JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({jobId,supplier,elapsedMs:report.elapsedMs,offers:result.offers.length,price:result.offers[0]?.price,branches:result.offers[0]?.commercial?.branches,issues:result.offers[0]?.commercial?.issues}));
}finally{await closeBrowser();}
