import { mutateSource } from './mutation-locate.js';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
const source = await readFile('src/capture.ts', 'utf8');
const suite = await readFile('tests/capture.test.ts', 'utf8');
for (const m of [
  {
    name: 'changed candidate evidence accepted',
    from: 'if(JSON.stringify(candidate)!==JSON.stringify(shown))',
    to: 'if(false)',
    pattern: 'revalidation rejects changed/missing PDF',
  },
  {
    name: 'cancellation overwritten after evidence revalidation',
    from: 'if(latest.updatedAt!==body.expectedUpdatedAt||latest.state!==job.state||JSON.stringify(latest.input)!==JSON.stringify(job.input))',
    to: 'if(false)',
    pattern: 'cancellation during evidence revalidation',
  },
]) {
  const mutated_m = mutateSource(source, m.from, m.to);
  assert.ok(mutated_m !== null, `Mutation location changed: ${m.name}`);
  const suffix = randomUUID();
  const modulePath = `src/.capture-mutant-${suffix}.ts`;
  const testPath = `tests/.capture-mutant-${suffix}.test.ts`;
  try {
    await writeFile(modulePath, mutated_m!);
    await writeFile(
      testPath,
      suite.replace('../src/capture.js', `../src/.capture-mutant-${suffix}.js`),
    );
    const { code, output } = await new Promise<{ code: number | null; output: string }>(
      (resolve, reject) => {
        const child = spawn(process.execPath, [
          '--import',
          'tsx',
          '--test',
          `--test-name-pattern=${m.pattern}`,
          testPath,
        ]);
        let output = '';
        child.stdout.on('data', (d) => (output += d));
        child.stderr.on('data', (d) => (output += d));
        child.on('error', reject);
        child.on('exit', (code) => resolve({ code, output }));
      },
    );
    assert.ok(
      code !== 0 && /AssertionError|ERR_ASSERTION/.test(output),
      `Regression did not catch mutation: ${m.name}\n${output}`,
    );
    console.log(`PASS regression rejected: ${m.name}`);
  } finally {
    await Promise.all([rm(modulePath, { force: true }), rm(testPath, { force: true })]);
  }
}
