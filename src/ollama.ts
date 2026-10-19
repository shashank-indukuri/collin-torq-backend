import type { ClientLLM } from '@browserbasehq/stagehand';
import { config } from './config.js';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

export const usage = { calls: 0, inputTokens: 0, outputTokens: 0, elapsedMs: 0 };
// Stagehand's callback runs in this process. No model gateway or remote fallback.
export const ollamaModel: ClientLLM = {
  async generate(params) {
    const started = Date.now();
    const messages: Record<string, unknown>[] = [];
    const actionExample = params.responseFormat?.type==='json_schema' && params.responseFormat.name==='Act'
      ? '\nAction format example: for a tree containing [0-42] button: Save and instruction Click Save, respond {"action":{"elementId":"0-42","description":"Save button","method":"click","arguments":[]},"twoStep":false}. Use the actual matching element ID from the supplied tree. Return null only when no matching control is present.' : '';
    if (params.systemPrompt) messages.push({ role: 'system', content: params.systemPrompt + actionExample });
    if(params.responseFormat?.type==='json_schema')messages.push({role:'system',content:'Return exactly one JSON value matching this schema, without markdown. Field descriptions are requirements. '+JSON.stringify(params.responseFormat.schema)});
    for (const m of params.messages) {
      const blocks = Array.isArray(m.content) ? m.content : [m.content];
      const unsupported = blocks.find(b => !['text', 'image'].includes(b.type));
      if (unsupported) throw new Error(`Unsupported local model block: ${unsupported.type}`);
      messages.push({ role: m.role,
        content: blocks.filter(b => b.type === 'text').map(b => b.type === 'text' ? b.text : '').join('\n'),
        images: blocks.filter(b => b.type === 'image').map(b => b.type === 'image' ? b.data : ''),
      });
    }
    const structured = params.responseFormat?.type === 'json_schema';
    const response = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(config.modelTimeout),
      body: JSON.stringify({ model: config.model, messages, stream: false, think: false, keep_alive: '5m',
        ...(params.responseFormat?.type === 'json_schema' ? { format: params.responseFormat.schema } : {}),
        options: { temperature: 0, num_ctx: config.context, num_predict: config.modelOutputTokens } }),
    });
    if (!response.ok) throw new Error(`Local Ollama returned HTTP ${response.status}`);
    const body = await response.json() as { message: {content: string}; prompt_eval_count?: number; eval_count?: number };
    const text = body.message.content;
    if(process.env.DEBUG_LOCAL_LLM==='true') await appendFile(join(config.dataDir,'llm-debug.jsonl'),JSON.stringify({params,text})+'\n',{mode:0o600});
    usage.calls++; usage.inputTokens += body.prompt_eval_count ?? 0; usage.outputTokens += body.eval_count ?? 0;
    usage.elapsedMs += Date.now() - started;
    if (structured) return { role: 'assistant', content: { type: 'text', text }, outputFormat: 'json_schema', structuredContent: JSON.parse(text) };
    return { role: 'assistant', content: { type: 'text', text }, outputFormat: 'text' };
  },
};

export async function ollamaHealth() {
  try {
    const r = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json() as { models: {name: string}[] };
    return { reachable: true, selectedModel: config.model, installed: data.models.some(m => m.name === config.model), models: data.models.map(m => m.name) };
  } catch { return { reachable: false, selectedModel: config.model, installed: false, models: [] }; }
}
