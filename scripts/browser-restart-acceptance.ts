import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  browserEndpoint,
  closeRecordedBrowser,
  reconnectableBrowser,
} from '../src/browser-runtime.js';
const port = 9345;
assert.equal(await browserEndpoint(port), undefined, 'Isolated restart-test port is occupied');
const directory = await mkdtemp(resolve('.local/restart-probe-'));
const browserModule = resolve('src/browser.ts');
let child: ReturnType<typeof spawn> | undefined;
async function phase(crash: boolean) {
  const code = `import {getBrowser,closeBrowser} from ${JSON.stringify(browserModule)};await getBrowser();console.log('TORQ_READY');${crash ? 'setInterval(()=>{},1000);' : 'await closeBrowser();'}`;
  return new Promise<void>((resolve, reject) => {
    child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
      cwd: directory,
      env: { ...process.env, CHROME_PORT: String(port), HEADLESS: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let ready = false;
    const timer = setTimeout(() => {
      child?.kill('SIGKILL');
      reject(new Error('Isolated browser restart phase timed out'));
    }, 45000);
    child.stdout!.on('data', (b) => {
      output += b;
      if (output.includes('TORQ_READY') && !ready) {
        ready = true;
        if (crash) child!.kill('SIGKILL');
      }
    });
    child.stderr!.on('data', (b) => (output += b));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (ready && (crash ? signal === 'SIGKILL' : code === 0)) resolve();
      else reject(new Error('Isolated browser phase failed: ' + output.slice(-4000)));
    });
  });
}
try {
  const started = Date.now();
  await phase(true);
  const orphan = await browserEndpoint(port);
  assert.ok(orphan, 'Abrupt exit did not leave the intended real orphan Chrome');
  const runtimePath = join(directory, '.local/browser-runtime.json');
  const before = JSON.parse(await readFile(runtimePath, 'utf8'));
  assert.equal(before.webSocketDebuggerUrl, orphan);
  await phase(false);
  assert.equal(await browserEndpoint(port), undefined);
  const after = JSON.parse(await readFile(runtimePath, 'utf8'));
  assert.notEqual(
    after.webSocketDebuggerUrl,
    before.webSocketDebuggerUrl,
    'Restart must replace stale initialized extension state',
  );
  const report = {
    passed: true,
    scope:
      'Real isolated Chrome + Stagehand owner killed with SIGKILL; next process verifies record, replaces orphan, initializes and closes cleanly',
    durationMs: Date.now() - started,
  };
  await writeFile('.local/browser-restart-report.json', JSON.stringify(report, null, 2));
  console.log('PASS', report);
} finally {
  child?.kill('SIGKILL');
  const endpoint = await browserEndpoint(port);
  if (endpoint) {
    await reconnectableBrowser(
      join(directory, '.local/browser-runtime.json'),
      join(directory, '.local/chrome'),
      port,
      endpoint,
    );
    await closeRecordedBrowser(endpoint);
  }
  await rm(directory, { recursive: true, force: true });
}
