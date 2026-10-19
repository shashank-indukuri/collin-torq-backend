import { spawn } from 'node:child_process';
import { open, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Deliberately local-only: no automatic paid fallback, even when a test fails.
const model = process.argv[2] ?? 'qwen3.5:latest';
const repeats = Number(process.env.BROWSER_REPEATS ?? 2);
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5)
  throw new Error('BROWSER_REPEATS must be 1–5');
await mkdir('.local', { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-'),
  dir = resolve('.local', 'local-regression-' + stamp);
await mkdir(dir, { mode: 0o700 });
const ledger = () =>
  readFile('.local/cloud-usage.json', 'utf8').catch((e) => {
    if (e.code === 'ENOENT') return '';
    throw e;
  });
const before = await ledger();
const installed = (await fetch('http://127.0.0.1:11434/api/tags', {
  signal: AbortSignal.timeout(3000),
}).then((r) => r.json())) as {
  models: { name: string; digest: string; size: number; details: unknown }[];
};
const modelMetadata = installed.models.find((m) => m.name === model);
if (!modelMetadata) throw new Error('Requested model is not installed locally');
const env = {
  ...process.env,
  MODEL_PROVIDER: 'ollama',
  OLLAMA_MODEL: model,
  CLOUD_BUDGET_USD: '0',
  OPENAI_API_KEY: '',
  OPENAI_ENV_FILE: '',
  EVAL_REPEATS: process.env.EVAL_REPEATS ?? '3',
};
const runs: {
  name: string;
  passed: boolean;
  exitCode: number | null;
  elapsedMs: number;
  log: string;
}[] = [];
async function run(
  name: string,
  script: string,
  args: string[] = [],
  extraEnv: Record<string, string> = {},
) {
  const log = resolve(dir, name + '.log'),
    file = await open(log, 'w', 0o600),
    started = Date.now();
  console.log('START', name, model);
  try {
    const code = await new Promise<number | null>((accept, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', script, ...args], {
        env: { ...env, ...extraEnv },
        stdio: ['ignore', file.fd, file.fd],
      });
      child.once('error', reject);
      child.once('exit', accept);
    });
    runs.push({ name, passed: code === 0, exitCode: code, elapsedMs: Date.now() - started, log });
  } finally {
    await file.close();
  }
  console.log(runs.at(-1)?.passed ? 'PASS' : 'FAIL', name);
}
await run('structured-and-tools', 'scripts/model-eval.ts', [model]);
await writeFile(
  resolve(dir, 'model-eval.json'),
  await readFile(`.local/model-eval-${model.replaceAll(/[^a-zA-Z0-9.-]/g, '_')}.json`),
  { mode: 0o600 },
);
for (let i = 1; i <= repeats; i++) {
  await run(
    'stagehand-' + i,
    'scripts/agent-acceptance.ts',
    [],
    i % 2 === 0 ? { AGENT_FIXTURE_SCENARIO: 'unknown_currency_zero_stock' } : {},
  );
  await run('browser-use-' + i, 'scripts/workflow-agent-acceptance.ts');
}
const noCloudUsage = before === (await ledger());
const report = {
  model,
  modelMetadata,
  startedAt: stamp,
  provider: 'ollama',
  noCloudUsage,
  runs,
  passed: noCloudUsage && runs.every((r) => r.passed),
};
await writeFile(resolve(dir, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
