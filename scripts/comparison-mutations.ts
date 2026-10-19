import assert from 'node:assert/strict';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const cases=[
 {module:'comparison-policy',name:'wrong destination wins delivery',from:'&&observed.shipping.destinationZip===originZip',to:'',pattern:'shipping must match'},
 {module:'comparison-policy',name:'stale evidence wins',from:'age>=-60000&&age<=15*60*1000',to:'true',pattern:'stale, future-dated'},
 {module:'comparison-policy',name:'future pickup becomes ready stock',from:'b.pickupReady===true&&',to:'',pattern:'unknown condition'},
 {module:'comparison-policy',name:'infinite branch quantity becomes sufficient stock',from:'Number.isSafeInteger(b.stockQuantity)&&',to:'',pattern:'numeric inventory corruption'},
 {module:'comparison',name:'expired comparison retains winners',from:'Date.parse(job.comparison.expiresAt)>now',to:'true',pattern:'expired comparison views'},
 {module:'commercial',name:'neighboring product price and ETA contaminate the main panel',from:"if(node.querySelectorAll('input[id^=\"input-qty-\"]').length>1)break;",to:'',pattern:'unfamiliar Grainger hierarchy'},
 {module:'geocoding',name:'different Census street accepted',from:'if(street(address)!==street(match.matchedAddress))',to:'if(false)',pattern:'Census requires one matching street'},
];
for(const c of cases){const source=await readFile(`src/${c.module}.ts`,'utf8');assert.ok(source.includes(c.from),'Mutation target missing: '+c.name);const id=randomUUID(),module=`src/.comparison-mutant-${id}.ts`,test=`tests/.comparison-mutant-${id}.test.ts`;
 try{await writeFile(module,source.replace(c.from,c.to));await writeFile(test,(await readFile('tests/comparison.test.ts','utf8')).replaceAll(`../src/${c.module}.js`,`../src/.comparison-mutant-${id}.js`));
  const result=await new Promise<{code:number|null;text:string}>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','--test','--test-name-pattern='+c.pattern,test]);let text='';child.stdout.on('data',d=>text+=d);child.stderr.on('data',d=>text+=d);child.on('error',reject);child.on('close',code=>resolve({code,text}));});
  assert.ok(result.code!==0&&/AssertionError|ERR_ASSERTION/.test(result.text),'Mutation survived: '+c.name+'\n'+result.text);console.log('PASS regression caught:',c.name);
 }finally{await Promise.all([rm(module,{force:true}),rm(test,{force:true})]);}
}
