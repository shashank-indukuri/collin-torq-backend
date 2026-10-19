import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runtimeMatches,
  reconnectableBrowser,
  rememberBrowserRuntime,
  waitForBrowserEndpoint,
} from '../src/browser-runtime.js';
const profile = '/application/chrome',
  port = 9322,
  endpoint = 'ws://127.0.0.1:9322/devtools/browser/abc-123';
test('owned browser startup retries transient readiness failures', async () => {
  let calls = 0;
  assert.equal(
    await waitForBrowserEndpoint(port, 1500, async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('starting'), { name: 'TimeoutError' });
      return calls === 2 ? undefined : endpoint;
    }),
    endpoint,
  );
  assert.equal(calls, 3);
});
test('owned browser startup preserves non-transient failures and deadlines', async () => {
  await assert.rejects(
    waitForBrowserEndpoint(port, 100, async () => {
      throw new Error('invalid endpoint');
    }),
    /invalid endpoint/,
  );
  await assert.rejects(
    waitForBrowserEndpoint(port, 1, async () => undefined),
    /deadline/,
  );
});
test('only the same recorded application browser instance can be reconnected', () => {
  const record = { version: 1, profile, port, webSocketDebuggerUrl: endpoint };
  assert.equal(runtimeMatches(record, profile, port, endpoint), true);
  for (const change of [
    { profile: '/personal/chrome' },
    { port: 9333 },
    { version: 2 },
    { webSocketDebuggerUrl: endpoint + 'different' },
  ])
    assert.equal(runtimeMatches({ ...record, ...change }, profile, port, endpoint), false);
  for (const url of [
    'ws://evil.example:9322/devtools/browser/abc',
    'ws://127.0.0.1:9333/devtools/browser/abc',
    'ws://user:password@127.0.0.1:9322/devtools/browser/abc',
    endpoint + '?redirect=x',
    endpoint + '#x',
  ])
    assert.equal(
      runtimeMatches({ ...record, webSocketDebuggerUrl: url }, profile, port, url),
      false,
    );
});
test('unknown or changed runtime records cannot attach to an occupied port', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'torq-browser-runtime-'));
  const path = join(dir, 'runtime.json');
  try {
    await assert.rejects(
      reconnectableBrowser(path, profile, port, endpoint),
      /no verified application browser/,
    );
    await rememberBrowserRuntime(path, profile, port, endpoint);
    assert.equal(await reconnectableBrowser(path, profile, port, endpoint), endpoint);
    await assert.rejects(
      reconnectableBrowser(path, profile, port, endpoint + 'new'),
      /does not match/,
    );
    await writeFile(path, 'broken');
    await assert.rejects(
      reconnectableBrowser(path, profile, port, endpoint),
      /no verified application browser/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
