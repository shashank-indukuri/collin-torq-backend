import type { ClientLLM } from '@browserbasehq/stagehand';
import { config } from './config.js';
import { ollamaModel, usage } from './ollama.js';
import { openaiRequest, strictSchema } from './cloud-provider.js';
export const modelName = () =>
  config.modelProvider === 'openai' ? config.openaiModel : config.model;
export const modelClient: ClientLLM = {
  async generate(params) {
    if (config.modelProvider !== 'openai') return ollamaModel.generate(params);
    try {
      return await cloudGenerate(params);
    } catch (error) {
      // A strict-schema request can still come back as prose. Retry once, then
      // fail with a stable code instead of a raw JSON.parse message. A response cut
      // off at the output cap is retried the same way.
      if (!(error instanceof SyntaxError || error instanceof RetryableOutput)) throw error;
      console.warn('[model] retrying malformed output:', error.message.slice(0, 160));
      try {
        return await cloudGenerate(params);
      } catch (retry) {
        if (retry instanceof SyntaxError) throw new Error('OPENAI_STRUCTURED_OUTPUT_INVALID');
        throw retry;
      }
    }
  },
};
/**
 * Parses a strict-schema reply. A reply can be valid JSON followed by stray
 * prose, or carry two JSON objects back to back; keep the first complete
 * object and reject anything else as malformed.
 */
export function parseStructured(text: string) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf('{');
    if (start < 0) throw error;
    let depth = 0,
      quoted = false,
      escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i]!;
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
    throw error;
  }
}
/**
 * Trims string fields that exceed the schema's maxLength. A verbose model
 * step is shortened instead of failing validation and ending the run; only
 * length is adjusted, never content or type.
 */
export function clampToSchema(value: unknown, schema: unknown): unknown {
  const s = (schema ?? {}) as Record<string, any>;
  if (typeof value === 'string' && typeof s.maxLength === 'number')
    return value.slice(0, s.maxLength);
  if (Array.isArray(value) && s.items) return value.map((v) => clampToSchema(v, s.items));
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const variants: Record<string, any>[] = s.anyOf ?? s.oneOf ?? [s];
    const props = Object.assign({}, ...variants.map((v) => v.properties ?? {}));
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        clampToSchema(v, props[k]),
      ]),
    );
  }
  return value;
}
/** A malformed or truncated model response that one retry may fix. */
class RetryableOutput extends Error {}
async function cloudGenerate(
  params: Parameters<ClientLLM['generate']>[0],
): ReturnType<ClientLLM['generate']> {
  {
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
    if (response.status !== 'completed')
      throw new RetryableOutput(
        `OPENAI_OUTPUT_INCOMPLETE:${response.incomplete_details?.reason ?? response.status}`,
      );
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
        role: 'assistant' as const,
        content: { type: 'text' as const, text },
        outputFormat: 'json_schema' as const,
        structuredContent: clampToSchema(
          parseStructured(text),
          params.responseFormat?.type === 'json_schema' ? params.responseFormat.schema : {},
        ) as ReturnType<typeof parseStructured>,
      };
    return {
      role: 'assistant' as const,
      content: { type: 'text' as const, text },
      outputFormat: 'text' as const,
    };
  }
}
