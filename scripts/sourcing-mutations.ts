import { mutateSource } from './mutation-locate.js';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
const source = await readFile('src/worker.ts', 'utf8');
const suite = await readFile('tests/sourcing.test.ts', 'utf8');
for (const m of [
  {
    name: 'captured evidence erased when supplier job starts',
    from: '...(job.sourceCapture?{}:{guide:undefined,parts:undefined,capturedParts:undefined})',
    to: 'guide:undefined,parts:undefined,capturedParts:undefined',
    pattern: 'supplier failures override no-match',
  },
  {
    name: 'supplier errors treated as permission-ready no-match scope',
    from: "state:errors ? 'partial' : permissionNeeded ? 'needs_permission' : 'completed'",
    to: "state:errors ? 'needs_permission' : permissionNeeded ? 'needs_permission' : 'completed'",
    pattern: 'supplier failures override no-match',
  },
]) {
  const mutated_m = mutateSource(source, m.from, m.to);
  assert.ok(mutated_m !== null, m.name);
  const id = randomUUID();
  const modulePath = `src/.source-mutant-${id}.ts`;
  const testPath = `tests/.source-mutant-${id}.test.ts`;
  try {
    await writeFile(modulePath, mutated_m!);
    await writeFile(testPath, suite.replace('../src/worker.js', `../src/.source-mutant-${id}.js`));
    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
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
    });
    assert.ok(
      result.code !== 0 && /AssertionError|ERR_ASSERTION/.test(result.output),
      `Regression did not catch ${m.name}\n${result.output}`,
    );
    console.log(`PASS regression rejected: ${m.name}`);
  } finally {
    await Promise.all([rm(modulePath, { force: true }), rm(testPath, { force: true })]);
  }
}
