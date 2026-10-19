import { modelClient, modelName } from '../src/model.js';
import { cloudBudget } from '../src/cloud-provider.js';
const result = await modelClient.generate({
  systemPrompt:
    'Extract literal facts. Return the manufacturer identifier without the brand. Use null for unstated stock or currency; a dollar sign alone is not USD.',
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Main product YORK TEST-123. Price $17.25 each. Available in 1–2 days. Currency and numeric stock are not supplied.',
        },
      ],
    },
  ],
  responseFormat: {
    type: 'json_schema',
    name: 'supplier_preflight',
    schema: {
      type: 'object',
      properties: {
        partNumber: { type: 'string' },
        price: { type: 'number' },
        currency: { type: ['string', 'null'] },
        stock: { type: ['integer', 'null'] },
      },
      required: ['partNumber', 'price', 'currency', 'stock'],
      additionalProperties: false,
    },
  },
});
console.log(
  JSON.stringify({
    model: modelName(),
    result: result.outputFormat === 'json_schema' ? result.structuredContent : null,
    budget: await cloudBudget(),
  }),
);
