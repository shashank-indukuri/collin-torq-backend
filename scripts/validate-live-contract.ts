import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Ajv2020 } from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
import { config } from '../src/config.js';
const base = `http://127.0.0.1:${config.port}`,
  report = JSON.parse(await readFile('.local/guided-live-e2e.json', 'utf8'));
const spec = (await fetch(base + '/api/openapi.json').then((r) => r.json())) as any;
const ajv = new Ajv2020({ strict: false, allErrors: true });
formats.default(ajv);
const validate = ajv.compile({ $ref: '#/components/schemas/Job', components: spec.components });
for (const id of [report.cases[0].jobId, report.cases[1].jobId, report.jobId]) {
  const response = await fetch(base + '/api/searches/' + id);
  assert.equal(response.status, 200);
  const job = await response.json();
  assert.equal(validate(job), true, JSON.stringify(validate.errors));
}
await writeFile(
  '.local/live-api-contract.json',
  JSON.stringify({ passed: true, jobs: 3, contractUrl: base + '/api/openapi.json' }, null, 2),
  { mode: 0o600 },
);
console.log(
  'PASS served OpenAPI validates actual capture, sourcing and reviewed-comparison responses',
);
