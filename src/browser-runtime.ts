import { readFile, writeFile } from 'node:fs/promises';
export type BrowserRuntime = {
  version: 1;
  profile: string;
  port: number;
  webSocketDebuggerUrl: string;
};
export function runtimeMatches(
  value: unknown,
  profile: string,
  port: number,
  endpoint: string,
): value is BrowserRuntime {
  if (!value || typeof value !== 'object') return false;
  const r = value as BrowserRuntime;
  try {
    const u = new URL(endpoint);
    return (
      r.version === 1 &&
      r.profile === profile &&
      r.port === port &&
      r.webSocketDebuggerUrl === endpoint &&
      u.protocol === 'ws:' &&
      u.hostname === '127.0.0.1' &&
      u.port === String(port) &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      /^\/devtools\/browser\/[a-z0-9-]+$/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}
export async function browserEndpoint(port: number): Promise<string | undefined> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) throw new Error('Unrecognized browser endpoint');
    const body = (await response.json()) as { webSocketDebuggerUrl?: string };
    if (typeof body.webSocketDebuggerUrl !== 'string')
      throw new Error('Missing browser endpoint identity');
    return body.webSocketDebuggerUrl;
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause;
    if (cause?.code === 'ECONNREFUSED') return undefined;
    throw e;
  }
}
export async function waitForBrowserEndpoint(
  port: number,
  timeoutMs = 15000,
  read = browserEndpoint,
) {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const endpoint = await read(port);
      if (endpoint) return endpoint;
    } catch (error) {
      if (!(error instanceof Error) || !['TimeoutError', 'AbortError'].includes(error.name))
        throw error;
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error('Application browser endpoint did not become ready within the startup deadline');
}
export async function reconnectableBrowser(
  path: string,
  profile: string,
  port: number,
  endpoint: string,
) {
  let runtime: unknown;
  try {
    runtime = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('Debugging port is occupied but no verified application browser record exists');
  }
  if (!runtimeMatches(runtime, profile, port, endpoint))
    throw new Error('Existing debugging browser does not match the saved application runtime');
  return endpoint;
}
export async function rememberBrowserRuntime(
  path: string,
  profile: string,
  port: number,
  endpoint: string,
) {
  const runtime: BrowserRuntime = { version: 1, profile, port, webSocketDebuggerUrl: endpoint };
  if (!runtimeMatches(runtime, profile, port, endpoint))
    throw new Error('Cannot save an unrecognized browser runtime');
  await writeFile(path, JSON.stringify(runtime), { mode: 0o600 });
}
/** Lifecycle only: gracefully close the verified orphan before taking ownership. */
export async function closeRecordedBrowser(endpoint: string) {
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    let sent = false;
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Verified orphan browser did not close in time'));
    }, 3000);
    socket.addEventListener('open', () => {
      sent = true;
      socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    });
    socket.addEventListener('message', (event) => {
      try {
        const result = JSON.parse(String(event.data));
        if (result.id === 1) {
          clearTimeout(timer);
          socket.close();
          if (result.error) reject(new Error('Orphan browser close rejected'));
          else resolve();
        }
      } catch {
        /* Ignore unrelated protocol notifications. */
      }
    });
    socket.addEventListener('close', () => {
      clearTimeout(timer);
      if (sent) resolve();
      else reject(new Error('Orphan browser connection closed before request'));
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Could not close verified orphan browser'));
    });
  });
}
