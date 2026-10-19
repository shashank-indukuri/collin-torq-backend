import type { ClientLLM } from '@browserbasehq/stagehand';
import { config } from './config.js';
import { ollamaModel, usage } from './ollama.js';
import { openaiRequest, strictSchema } from './cloud-provider.js';
export const modelName = () =>
  config.modelProvider === 'openai' ? config.openaiModel : config.model;
export const modelClient: ClientLLM = {
  async generate(params) {
    if (config.modelProvider !== 'openai') return ollamaModel.generate(params);
    const started = Date.now();
    const input: Record<string, unknown>[] = [];
    if (params.systemPrompt) input.push({ role: 'system', content: params.systemPrompt });
    for (const message of params.messages) {
      const blocks = Array.isArray(message.content) ? message.content : [message.content];
      if (blocks.some((b) => b.type !== 'text')) throw new Error('CLOUD_TEXT_ONLY_MODE');
      input.push({
        role: message.role,
        content: blocks.map((b) => (b.type === 'text' ? b.text : '')).join('\n'),
      });
    }
    const structured = params.responseFormat?.type === 'json_schema';
    const response = await openaiRequest('responses', {
      input,
      reasoning: { effort: 'none' },
      max_output_tokens: Math.min(4096, config.modelOutputTokens),
      ...(structured
        ? {
            text: {
              format: {
                type: 'json_schema',
                name:
                  params.responseFormat!.type === 'json_schema'
                    ? params.responseFormat!.name
                    : 'result',
                strict: true,
                schema: strictSchema(
                  params.responseFormat!.type === 'json_schema'
                    ? params.responseFormat!.schema
                    : {},
                ),
              },
            },
          }
        : {}),
    });
    if (response.status !== 'completed') throw new Error('OPENAI_OUTPUT_INCOMPLETE');
    const text = (response.output ?? [])
      .flatMap((item: any) => item.content ?? [])
      .filter((part: any) => part.type === 'output_text')
      .map((part: any) => part.text)
      .join('');
    if (!text) throw new Error('OPENAI_NO_TEXT_OUTPUT');
    usage.calls++;
    usage.inputTokens += response.usage?.input_tokens ?? 0;
    usage.outputTokens += response.usage?.output_tokens ?? 0;
    usage.elapsedMs += Date.now() - started;
    if (structured)
      return {
        role: 'assistant',
        content: { type: 'text', text },
        outputFormat: 'json_schema',
        structuredContent: JSON.parse(text),
      };
    return { role: 'assistant', content: { type: 'text', text }, outputFormat: 'text' };
  },
};
