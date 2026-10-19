import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
const cases = [
  {
    module: 'catalog-identity',
    suite: 'catalog-identity',
    name: 'recovery stops on a longer part identifier',
    from: 'number===wanted',
    to: 'number?.startsWith(wanted)',
    pattern: 'wrong product',
  },
  {
    module: 'browser-runtime',
    suite: 'browser-runtime',
    name: 'a different browser instance is trusted',
    from: 'r.webSocketDebuggerUrl===endpoint',
    to: 'true',
    pattern: 'same recorded application',
  },
  {
    module: 'recovery-policy',
    suite: 'recovery',
    name: 'longer part identifier accepted as exact',
    from: 'normalized(token)===wanted',
    to: 'normalized(token).startsWith(wanted)',
    pattern: 'longer identifier',
  },
  {
    module: 'catalog',
    suite: 'supplier-coverage',
    name: 'wrong query accepted as no-match',
    from: "normalizePart(query??'')===normalizePart(partNumber)&&absence",
    to: 'absence',
    pattern: 'generic no-match text',
  },
];
for (const mutation of cases) {
  const source = await readFile(`src/${mutation.module}.ts`, 'utf8');
  assert.ok(source.includes(mutation.from));
  const suite = await readFile(`tests/${mutation.suite}.test.ts`, 'utf8');
  const id = randomUUID();
  const module = `src/.stress-mutant-${id}.ts`,
    test = `tests/.stress-mutant-${id}.test.ts`;
  try {
    await writeFile(module, source.replace(mutation.from, mutation.to));
    await writeFile(
      test,
      suite.replaceAll(`../src/${mutation.module}.js`, `../src/.stress-mutant-${id}.js`),
    );
    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        '--import',
        'tsx',
        '--test',
        `--test-name-pattern=${mutation.pattern}`,
        test,
      ]);
      let output = '';
      child.stdout.on('data', (d) => (output += d));
      child.stderr.on('data', (d) => (output += d));
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, output }));
    });
    assert.ok(
      result.code !== 0 && /AssertionError|ERR_ASSERTION/.test(result.output),
      `Mutation survived: ${mutation.name}\n${result.output}`,
    );
    console.log('PASS regression rejected:', mutation.name);
  } finally {
    await Promise.all([rm(module, { force: true }), rm(test, { force: true })]);
  }
}

// Mutate copies, never the live recovery module used by an active browser run.
for (const mutation of [
  {
    from: 'max_history_items=6',
    to: 'max_history_items=3',
    pattern: 'production recovery configuration',
    error: /max_history_items must be/,
    name: 'unsupported Browser Use history limit',
  },
  {
    from: "limit = min(request['maxSteps'], len(goal['candidates']))",
    to: "limit = len(goal['candidates'])",
    pattern: 'bounded post-model inspection',
    error: /AssertionError/,
    name: 'post-model inspection exceeds its visit budget',
  },
]) {
  const id = randomUUID(),
    module = `.local/recover-mutant-${id}.py`,
    test = `tests/.stress-mutant-${id}.test.ts`;
  const source = await readFile('python/recover.py', 'utf8');
  assert.ok(source.includes(mutation.from));
  try {
    await writeFile(module, source.replace(mutation.from, mutation.to));
    await writeFile(
      test,
      (await readFile('tests/recovery-sdk.test.ts', 'utf8')).replaceAll(
        'python/recover.py',
        module,
      ),
    );
    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        '--import',
        'tsx',
        '--test',
        '--test-name-pattern=' + mutation.pattern,
        test,
      ]);
      let output = '';
      child.stdout.on('data', (d) => (output += d));
      child.stderr.on('data', (d) => (output += d));
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, output }));
    });
    assert.ok(
      result.code !== 0 && mutation.error.test(result.output),
      'Mutation survived: ' + mutation.name,
    );
    console.log('PASS regression rejected:', mutation.name);
  } finally {
    await Promise.all([rm(module, { force: true }), rm(test, { force: true })]);
  }
}
