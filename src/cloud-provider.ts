import { readFileSync } from 'node:fs';
import { readFile, writeFile, rename, open, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { parse } from 'dotenv';
import { config } from './config.js';

const ledgerPath = join(config.dataDir, 'cloud-usage.json');
const inputRate = 0.1 / 1e6,
  outputRate = 0.5 / 1e6; // GPT-6 Luna standard, short-context text pricing, checked 2026-10-18.
type Reservation = {
  id: string;
  ceilingUsd: number;
  status: 'reserved' | 'charged' | 'released';
  actualUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
};
type Ledger = { model: string; reservations: Reservation[] };
let queue: Promise<unknown> = Promise.resolve();
async function ledgerOperation<T>(fn: (ledger: Ledger) => T): Promise<T> {
  const run = queue.then(async () => {
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    let lock: Awaited<ReturnType<typeof open>> | undefined;
    for (let i = 0; i < 100; i++) {
      try {
        lock = await open(ledgerPath + '.lock', 'wx', 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await new Promise((r) => setTimeout(r, 30));
      }
    }
    if (!lock) throw new Error('CLOUD_BUDGET_LEDGER_BUSY');
    try {
      let ledger: Ledger;
      try {
        ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error('CLOUD_BUDGET_LEDGER_INVALID');
        ledger = { model: config.openaiModel, reservations: [] };
      }
      if (
        ledger.model !== config.openaiModel ||
        !Array.isArray(ledger.reservations) ||
        ledger.reservations.some(
          (r) =>
            !['reserved', 'charged', 'released'].includes(r.status) ||
            !Number.isFinite(r.ceilingUsd) ||
            r.ceilingUsd < 0 ||
            (r.actualUsd !== undefined && (!Number.isFinite(r.actualUsd) || r.actualUsd < 0)),
        )
      )
        throw new Error('CLOUD_BUDGET_LEDGER_INVALID');
      const result = fn(ledger),
        tmp = ledgerPath + '.' + randomUUID() + '.tmp';
      await writeFile(tmp, JSON.stringify(ledger), { mode: 0o600 });
      await rename(tmp, ledgerPath);
      return result;
    } finally {
      await lock.close();
      const { unlink } = await import('node:fs/promises');
      await unlink(ledgerPath + '.lock');
    }
  });
  queue = run.catch(() => {});
  return run;
}
const spent = (ledger: Ledger) =>
  ledger.reservations.reduce(
    (sum, r) => sum + (r.status === 'released' ? 0 : (r.actualUsd ?? r.ceilingUsd)),
    0,
  );
export function openaiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (!config.openaiEnvFile) throw new Error('OPENAI_KEY_NOT_CONFIGURED');
  const key = parse(readFileSync(config.openaiEnvFile)).OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_KEY_NOT_CONFIGURED');
  return key;
}
export async function cloudBudget() {
  return ledgerOperation((ledger) => ({
    model: config.openaiModel,
    limitUsd: config.cloudBudgetUsd,
    reservedOrSpentUsd: spent(ledger),
    calls: ledger.reservations.length,
  }));
}
export function strictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictSchema);
  if (!value || typeof value !== 'object') return value;
  const out = Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => k !== '$schema' && k !== 'default')
      .map(([k, v]) => [k, strictSchema(v)]),
  ) as Record<string, unknown>;
  // OpenAI supports anyOf, while Zod emits oneOf for discriminated unions.
  if (out.oneOf) {
    out.anyOf = out.oneOf;
    delete out.oneOf;
  }
  if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
  }
  return out;
}
export async function openaiRequest(
  endpoint: 'responses' | 'chat/completions',
  payload: Record<string, unknown>,
) {
  if (config.openaiModel !== 'gpt-6-luna') throw new Error('CLOUD_MODEL_NOT_APPROVED');
  const body: Record<string, unknown> = { ...payload, model: config.openaiModel, store: false };
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text) > 128000) throw new Error('CLOUD_INPUT_LIMIT');
  const maxOutput = Number(
    body[endpoint === 'responses' ? 'max_output_tokens' : 'max_completion_tokens'] ??
      config.modelOutputTokens,
  );
  if (!Number.isInteger(maxOutput) || maxOutput < 1 || maxOutput > 4096)
    throw new Error('CLOUD_OUTPUT_LIMIT');
  const ceiling = (Buffer.byteLength(text) + 4096) * inputRate + maxOutput * outputRate;
  const id = randomUUID();
  await ledgerOperation((ledger) => {
    if (spent(ledger) + ceiling > config.cloudBudgetUsd)
      throw new Error('CLOUD_SPENDING_CAP_REACHED');
    ledger.reservations.push({ id, ceilingUsd: ceiling, status: 'reserved' });
  });
  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + openaiKey() },
      body: text,
      signal: AbortSignal.timeout(config.modelTimeout),
    });
  } catch {
    throw new Error('CLOUD_REQUEST_FAILED_RESERVATION_RETAINED');
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as any;
    await ledgerOperation((ledger) => {
      const reservation = ledger.reservations.find((r) => r.id === id)!;
      if (response.status >= 400 && response.status < 500 && response.status !== 408)
        reservation.status = 'released';
    });
    const code = String(detail?.error?.code ?? '')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 80);
    const param = String(detail?.error?.param ?? '')
      .replace(/[^a-zA-Z0-9_.]/g, '')
      .slice(0, 100);
    throw new Error(`OPENAI_HTTP_${response.status} ${code} ${param}`);
  }
  const data = (await response.json()) as Record<string, any>;
  const input = Number(data.usage?.input_tokens ?? data.usage?.prompt_tokens),
    output = Number(data.usage?.output_tokens ?? data.usage?.completion_tokens);
  await ledgerOperation((ledger) => {
    const reservation = ledger.reservations.find((r) => r.id === id)!;
    if (Number.isFinite(input) && Number.isFinite(output)) {
      reservation.actualUsd = input * inputRate + output * outputRate;
      reservation.inputTokens = input;
      reservation.outputTokens = output;
      reservation.status = 'charged';
    }
  });
  return data;
}

let proxy: Server | undefined;
let proxyConfig: { baseUrl: string; token: string } | undefined;
export async function cloudProxy() {
  if (proxyConfig) return proxyConfig;
  const token = randomUUID();
  proxy = createServer(async (req, res) => {
    const send = (code: number, value: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (
      req.method !== 'POST' ||
      req.url !== '/v1/chat/completions' ||
      req.headers.authorization !== 'Bearer ' + token
    ) {
      send(403, { error: { message: 'LOCAL_MODEL_PROXY_DENIED' } });
      return;
    }
    try {
      let source = '';
      for await (const chunk of req) {
        source += chunk;
        if (Buffer.byteLength(source) > 128000) throw new Error('CLOUD_INPUT_LIMIT');
      }
      const body = JSON.parse(source);
      if (body.model !== config.openaiModel) throw new Error('CLOUD_MODEL_NOT_APPROVED');
      for (const key of [
        'temperature',
        'frequency_penalty',
        'presence_penalty',
        'top_p',
        'seed',
        'max_tokens',
      ])
        delete body[key];
      body.reasoning_effort = 'none';
      body.max_completion_tokens = Math.min(
        4096,
        body.max_completion_tokens ?? config.modelOutputTokens,
      );
      body.stream = false;
      if (body.response_format?.type === 'json_schema') {
        body.response_format.json_schema.schema = strictSchema(
          body.response_format.json_schema.schema,
        );
        body.response_format.json_schema.strict = true;
      }
      send(200, await openaiRequest('chat/completions', body));
    } catch (error) {
      send(429, {
        error: {
          message: error instanceof Error ? error.message : 'CLOUD_PROXY_ERROR',
          type: 'local_budget_or_provider_error',
        },
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    proxy!.once('error', reject);
    proxy!.listen(0, '127.0.0.1', resolve);
  });
  const address = proxy.address();
  if (!address || typeof address === 'string') throw new Error('CLOUD_PROXY_START_FAILED');
  proxyConfig = { baseUrl: `http://127.0.0.1:${address.port}/v1`, token };
  return proxyConfig;
}
export async function closeCloudProxy() {
  const server = proxy;
  proxy = undefined;
  proxyConfig = undefined;
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
}
