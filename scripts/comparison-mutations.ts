import { mutateSource } from './mutation-locate.js';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
const cases = [
  {
    module: 'comparison-policy',
    name: 'wrong destination wins delivery',
    from: '&&observed.shipping.destinationZip===originZip',
    to: '',
    pattern: 'shipping must match',
  },
  {
    module: 'comparison-policy',
    name: 'stale evidence wins',
    from: 'age>=-60000&&age<=15*60*1000',
    to: 'true',
    pattern: 'stale, future-dated',
  },
  {
    module: 'comparison',
    name: 'expired comparison keeps listing prices',
    from: 'line.rankings.cheapest.options=[];',
    to: '',
    pattern: 'expired comparison views clear winners',
  },
  {
    module: 'comparison-policy',
    name: 'stale branch stock is listed for a call',
    from: 'fresh(b.evidence)&&Number.isSafeInteger(b.stockQuantity)',
    to: 'Number.isSafeInteger(b.stockQuantity)',
    pattern: 'every store showing enough stock',
  },
  {
    module: 'comparison-policy',
    name: 'refurbished price ranks cheapest',
    from: "&&p.condition!=='refurbished'",
    to: '',
    pattern: 'unstated condition',
  },
  {
    module: 'comparison-policy',
    name: 'unsized pack is costed as one unit',
    from: '?p.packSize!:null',
    to: '?p.packSize!:1',
    pattern: 'pack rounding',
  },
  {
    module: 'comparison-policy',
    name: 'infinite branch quantity becomes sufficient stock',
    from: 'Number.isSafeInteger(b.stockQuantity)&&',
    to: '',
    pattern: 'numeric inventory corruption',
  },
  {
    module: 'comparison',
    name: 'expired comparison retains winners',
    from: 'Date.parse(job.comparison.expiresAt)>now',
    to: 'true',
    pattern: 'expired comparison views',
  },
  {
    module: 'commercial',
    name: 'neighboring product price and ETA contaminate the main panel',
    from: 'if(node.querySelectorAll(\'input[id^="input-qty-"]\').length>1)break;',
    to: '',
    pattern: 'unfamiliar Grainger hierarchy',
  },
  {
    module: 'geocoding',
    name: 'different Census street accepted',
    from: 'if(street(address)!==street(match.matchedAddress))',
    to: 'if(false)',
    pattern: 'Census requires one matching street',
  },
];
for (const c of cases) {
  const source = await readFile(`src/${c.module}.ts`, 'utf8');
  const mutated_c = mutateSource(source, c.from, c.to);
  assert.ok(mutated_c !== null, 'Mutation target missing: ' + c.name);
  const id = randomUUID(),
    module = `src/.comparison-mutant-${id}.ts`,
    test = `tests/.comparison-mutant-${id}.test.ts`;
  try {
    await writeFile(module, mutated_c!);
    await writeFile(
      test,
      (await readFile('tests/comparison.test.ts', 'utf8')).replaceAll(
        `../src/${c.module}.js`,
        `../src/.comparison-mutant-${id}.js`,
      ),
    );
    const result = await new Promise<{ code: number | null; text: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        '--import',
        'tsx',
        '--test',
        '--test-name-pattern=' + c.pattern,
        test,
      ]);
      let text = '';
      child.stdout.on('data', (d) => (text += d));
      child.stderr.on('data', (d) => (text += d));
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, text }));
    });
    assert.ok(
      result.code !== 0 && /AssertionError|ERR_ASSERTION/.test(result.text),
      'Mutation survived: ' + c.name + '\n' + result.text,
    );
    console.log('PASS regression caught:', c.name);
  } finally {
    await Promise.all([rm(module, { force: true }), rm(test, { force: true })]);
  }
}
