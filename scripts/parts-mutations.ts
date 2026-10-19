import assert from 'node:assert/strict';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const source=await readFile('src/parts.ts','utf8');const suite=await readFile('tests/parts.test.ts','utf8');
for(const m of [
  {name:'part read from adjacent model column',from:'const column=models.indexOf(model);',to:'const column=(models.indexOf(model)+1)%models.length;',pattern:'part number comes from'},
  {name:'not-applicable marker accepted as a part',from:"if(value==='---')",to:'if(false)',pattern:'part number comes from'},
  {name:'broad control-board request silently confirmed',from:"requiresConfirmation:normalize(request.name)==='control board'||normalize(request.name)==='board',",to:'requiresConfirmation:false,',pattern:'control board is a reviewed'},
  {name:'missing table cell allowed to shift alignment',from:'cells.length!==models.length||',to:'',pattern:'missing cell cannot'},
]) {
  assert.ok(source.includes(m.from),`Mutation location changed: ${m.name}`);
  const suffix=randomUUID();const modulePath=`src/.parts-mutant-${suffix}.ts`;const testPath=`tests/.parts-mutant-${suffix}.test.ts`;
  try {
    await writeFile(modulePath,source.replace(m.from,m.to));await writeFile(testPath,suite.replace('../src/parts.js',`../src/.parts-mutant-${suffix}.js`));
    const {code,output}=await new Promise<{code:number|null;output:string}>((resolve,reject)=>{
      const child=spawn(process.execPath,['--import','tsx','--test',`--test-name-pattern=${m.pattern}`,testPath]);let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('exit',code=>resolve({code,output}));
    });
    assert.ok(code!==0&&/AssertionError|ERR_ASSERTION/.test(output),`Regression did not catch mutation: ${m.name}\n${output}`);
    console.log(`PASS regression rejected: ${m.name}`);
  }finally{await Promise.all([rm(modulePath,{force:true}),rm(testPath,{force:true})]);}
}
