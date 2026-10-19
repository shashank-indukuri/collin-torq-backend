import 'dotenv/config';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

function loopback(value: string) {
  const u = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.protocol !== 'http:')
    throw new Error('Ollama must be an HTTP loopback address');
  return u.origin;
}
const requestedCloudBudget = Number(process.env.CLOUD_BUDGET_USD ?? 0.5);
export const config = {
  port: Number(process.env.PORT ?? 4310),
  dataDir: resolve('.local'),
  ollamaUrl: loopback(process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'),
  model: process.env.OLLAMA_MODEL ?? 'qwen3:4b',
  modelProvider: process.env.MODEL_PROVIDER ?? 'ollama',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-6-luna',
  openaiEnvFile: process.env.OPENAI_ENV_FILE,
  cloudBudgetUsd: Number.isFinite(requestedCloudBudget)
    ? Math.min(0.5, Math.max(0, requestedCloudBudget))
    : 0,
  context: Number(process.env.OLLAMA_CONTEXT ?? 8192),
  modelTimeout: Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000),
  modelOutputTokens: Number(process.env.OLLAMA_OUTPUT_TOKENS ?? 4096),
  chromePath:
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  chromePort: Number(process.env.CHROME_PORT ?? 9322),
  headless: process.env.HEADLESS === 'true',
  recovery: process.env.RECOVERY_ENABLED !== 'false',
  recoverySteps: Math.min(8, Math.max(1, Number(process.env.RECOVERY_MAX_STEPS ?? 4))),
  supplierEngine: process.env.SUPPLIER_ENGINE ?? 'legacy',
  agentSteps: Math.min(24, Math.max(1, Number(process.env.SUPPLIER_AGENT_STEPS ?? 12))),
  agentTimeout: Math.min(
    900000,
    Math.max(30000, Number(process.env.SUPPLIER_AGENT_TIMEOUT_MS ?? 360000)),
  ),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
};
mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
