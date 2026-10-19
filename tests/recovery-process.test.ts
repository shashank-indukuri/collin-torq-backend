import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRecoveryProcess } from '../src/recovery-process.js';
const run = (code: string, timeoutMs = 3000) =>
  runRecoveryProcess({}, { timeoutMs, executable: process.execPath, args: ['-e', code] });
test('recovery accepts a typed result only after the child exits', async () => {
  const start = Date.now();
  const result = await run(
    `console.log('TORQ_RESULT='+JSON.stringify({successful:true,result:null}));setTimeout(()=>{},120)`,
  );
  assert.equal(result.successful, true);
  assert.ok(Date.now() - start >= 120);
});
test('agent success cannot override failed navigation', async () => {
  const r = await run(
    `console.log('TORQ_RESULT='+JSON.stringify({successful:false,agentReportedSuccess:true,result:'I succeeded'}))`,
  );
  assert.equal(r.successful, false);
});
test('Browser Use external-stop callback can return null agent success after verified navigation', async () => {
  const r = await run(
    `console.log('TORQ_RESULT='+JSON.stringify({successful:true,agentReportedSuccess:null,result:'Allowed product opened'}))`,
  );
  assert.equal(r.successful, true);
  assert.equal(r.agentReportedSuccess, null);
});
test('executed candidate indices and tool inventory are typed and bounded', async () => {
  const valid = {
    successful: true,
    result: null,
    visitedCandidateIndices: [2],
    toolNames: ['done', 'open_product'],
  };
  const r = await run(
    'console.log(' + JSON.stringify('TORQ_RESULT=' + JSON.stringify(valid)) + ')',
  );
  assert.deepEqual(r.visitedCandidateIndices, [2]);
  for (const change of [
    { visitedCandidateIndices: [-1] },
    { visitedCandidateIndices: [12] },
    { visitedCandidateIndices: [true] },
    { visitedCandidateIndices: '2' },
    { modelVisitedCandidateIndices: [12] },
    { boundedInspectionIndices: [-1] },
    { toolNames: [1] },
  ])
    await assert.rejects(
      run(
        'console.log(' +
          JSON.stringify('TORQ_RESULT=' + JSON.stringify({ ...valid, ...change })) +
          ')',
      ),
      /invalid result/,
    );
});
test('recovery phase events survive chunked output without becoming result authority', async () => {
  const phases: string[] = [];
  const code = `process.stdout.write('TORQ_PRO');setTimeout(()=>{console.log('GRESS=browser_ready');console.log('TORQ_PROGRESS=<invalid>');console.log('TORQ_RESULT='+JSON.stringify({successful:false,result:null}));},20)`;
  const r = await runRecoveryProcess(
    {},
    {
      timeoutMs: 2000,
      executable: process.execPath,
      args: ['-e', code],
      onProgress: (phase) => phases.push(phase),
    },
  );
  assert.deepEqual(phases, ['browser_ready']);
  assert.equal(r.successful, false);
});
test('malformed, duplicate, missing and string-boolean recovery results fail closed', async () => {
  for (const value of [
    'not-json',
    JSON.stringify({ successful: 'true', result: null }),
    JSON.stringify({ successful: true }),
    JSON.stringify({ successful: true, result: null, agentReportedSuccess: 'yes' }),
  ])
    await assert.rejects(
      run('console.log(' + JSON.stringify('TORQ_RESULT=' + value) + ')'),
      /invalid result/,
    );
  await assert.rejects(run("console.log('nothing')"), /no unique result/);
  await assert.rejects(
    run("console.log('TORQ_RESULT={}') ; console.log('TORQ_RESULT={}')"),
    /no unique result/,
  );
});
test('nonzero exit cannot claim success and missing executable fails promptly', async () => {
  await assert.rejects(
    run(
      `console.log('TORQ_RESULT='+JSON.stringify({successful:true,result:null}));process.exit(1)`,
    ),
    /exit 1/,
  );
  await assert.rejects(
    runRecoveryProcess({}, { timeoutMs: 500, executable: '/does-not-exist' }),
    /ENOENT/,
  );
});
test('timeout kills and reaps recovery before browser ownership can return', async () => {
  const started = Date.now();
  await assert.rejects(run('setInterval(()=>{},1000)', 80), /deadline exceeded/);
  assert.ok(Date.now() - started < 2500);
});
test('oversized model output is bounded and terminates the child', async () => {
  await assert.rejects(
    run("setInterval(()=>process.stdout.write('x'.repeat(100000)),1)"),
    /output limit exceeded/,
  );
});
