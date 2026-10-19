import { existsSync } from 'node:fs';
import { config } from '../src/config.js';
import { ollamaHealth } from '../src/ollama.js';
console.log(JSON.stringify({ node: process.version, chromeInstalled: existsSync(config.chromePath),
  browserUseInstalled: existsSync('.venv/bin/python'), ollama: await ollamaHealth(),
  paidServicesEnabled: false }, null, 2));
