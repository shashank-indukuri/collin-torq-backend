// Prove the regressions catch deliberately reintroduced bugs. Only temporary
// module/test copies are changed; the running backend's sources stay intact.
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
const source = await readFile('src/guides.ts', 'utf8');
const suite = await readFile('tests/guides.test.ts', 'utf8');
const mutations = [
  {
    name: 'prefix incorrectly promoted to exact model',
    from: 'const exact=coverage.coveredModels.includes(model);',
    to: 'const exact=coverage.matchingModels.length>0;',
    pattern: 'multiple suffixes',
  },
  {
    name: 'corrupt cached text trusted instead of PDF evidence',
    from: 'return {...record,pages:await this.extract(join(this.directory,`${record.sha256}.pdf`),record.sha256)};',
    to: 'return record;',
    pattern: 'offline cache survives metadata-text',
  },
  {
    name: 'PDF checksum validation removed',
    from: "if(createHash('sha256').update(bytes).digest('hex')!==record.sha256) return null;",
    to: '// checksum validation intentionally removed by mutation test',
    pattern: 'offline cache survives metadata-text',
  },
];
for (const m of mutations) {
  assert.ok(source.includes(m.from), `Mutation location changed: ${m.name}`);
  const suffix = randomUUID();
  const modulePath = `src/.guide-mutant-${suffix}.ts`;
  const testPath = `tests/.guide-mutant-${suffix}.test.ts`;
  try {
    await writeFile(modulePath, source.replace(m.from, m.to));
    await writeFile(
      testPath,
      suite.replace('../src/guides.js', `../src/.guide-mutant-${suffix}.js`),
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
