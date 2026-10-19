import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractGuideParts, resolveGuideParts } from '../src/parts.js';
import { GuideResolver, type GuideResolution } from '../src/guides.js';
import { createApp } from '../src/server.js';
import { Store } from '../src/store.js';
const header = 'FIG ITEM DESCRIPTION E1RD018S06B E1RD024S06B E1RD030S06B E1RD036S06B';
const row = 'Capacitor, Run (40/5MFD) [RC] --- --- --- S1-02425893000';
const board = '1 6 Control, Defrost S1-11111111111 S1-22222222222 S1-33333333333 S1-33101975102 <';
const pages = [
  { page: 1, text: 'Johnson Controls Unitary Products 035-21220-001 Rev. E (0409) 1 of 4' },
  {
    page: 2,
    text: [
      header,
      row,
      board,
      '1 9 Capacitor, Start S1-02425062000 S1-02425062000 S1-02425071000 ---',
    ].join('\n'),
  },
];
const guide: GuideResolution = {
  status: 'guide_found',
  requested: { manufacturer: 'York', model: 'E1RD036S06B' },
  normalizedModel: 'E1RD036S06B',
  cacheHit: true,
  attempts: [],
  message: 'Listed',
  guide: {
    manufacturer: 'York',
    publisher: 'Johnson Controls',
    title: 'Test table',
    documentNumber: '035-21220-001',
    revision: 'Rev. E (0409)',
    sourceUrl: 'https://example.test/guide.pdf',
    sha256: 'a'.repeat(64),
    retrievedAt: '2026-10-17T00:00:00Z',
    hostType: 'distributor_mirror',
    evidenceUrl: '/api/guides/test/document',
    pageCount: 2,
    coveredModels: ['E1RD036S06B'],
    matchingModels: ['E1RD036S06B'],
    modelEvidence: [],
    applicability: 'exact_model_listed',
    warnings: ['Incomplete historical guide.'],
  },
};
const extract = (name: string, text = pages[1]!.text, g = guide) =>
  extractGuideParts([{ page: 2, text }], g, [{ name, quantity: 2 }]);
test('part number comes from the exact model column, with complete provenance and unknown voltage', () => {
  const p = extract('capacitor');
  assert.equal(p.status, 'extracted');
  const line = p.lines[0]!;
  assert.equal(line.quantity, 2);
  assert.equal(line.candidates.length, 1);
  assert.equal(line.candidates[0]!.partNumber, 'S1-02425893000');
  assert.equal(line.candidates[0]!.specifications.capacitanceMfd, '40/5');
  assert.equal(line.candidates[0]!.specifications.voltage, null);
  assert.equal(line.candidates[0]!.evidence.modelColumn, 4);
  assert.equal(line.candidates[0]!.evidence.page, 2);
  assert.deepEqual(
    line.candidates[0]!.evidence.cells.map((c) => c.value),
    ['---', '---', '---', 'S1-02425893000'],
  );
  assert.equal(line.excludedRows.length, 1);
  assert.ok(p.warnings.includes('Incomplete historical guide.'));
});
test('control board is a reviewed semantic candidate; explicit defrost request resolves it', () => {
  const broad = extract('control board');
  assert.equal(broad.status, 'needs_input');
  assert.equal(broad.lines[0]!.status, 'needs_part_confirmation');
  assert.equal(broad.lines[0]!.candidates[0]!.partNumber, 'S1-33101975102');
  assert.equal(broad.lines[0]!.candidates[0]!.requiresConfirmation, true);
  const explicit = extract('defrost control');
  assert.equal(explicit.status, 'extracted');
  assert.equal(explicit.lines[0]!.candidates[0]!.requiresConfirmation, false);
});
test('two applicable capacitor types require clarification; not-applicable cells are never candidates', () => {
  const both = pages[1]!.text.replace('S1-02425071000 ---', 'S1-02425071000 S1-02425062000');
  const result = extract('capacitor', both);
  assert.equal(result.status, 'needs_input');
  assert.equal(result.lines[0]!.candidates.length, 2);
  assert.ok(result.lines[0]!.candidates.every((c) => c.requiresConfirmation));
  assert.equal(extract('start capacitor').lines[0]!.status, 'not_applicable');
  assert.equal(extract('run capacitor', both).status, 'extracted');
});
test('prefix, absent suffix and mismatched applicability block all extraction', () => {
  for (const change of [
    { status: 'needs_model_confirmation' as const },
    { status: 'not_found' as const },
    { guide: { ...guide.guide!, applicability: 'prefix_only' as const } },
  ]) {
    const p = extract('capacitor', pages[1]!.text, { ...guide, ...change });
    assert.equal(p.status, 'blocked');
    assert.deepEqual(p.lines, []);
  }
});
for (const [label, bad] of [
  ['missing cell', 'Capacitor, Run (40/5MFD) --- --- S1-02425893000'],
  ['extra cell', 'Capacitor, Run (40/5MFD) --- --- --- --- S1-02425893000'],
  ['unrecognized cell', 'Capacitor, Run (40/5MFD) --- ??? --- S1-02425893000'],
  ['no cells', 'Capacitor, Start'],
] as const)
  test(`${label} cannot silently shift columns or prove a unique match`, () => {
    const r = extract('capacitor', [header, row, bad].join('\n'));
    assert.equal(r.status, 'needs_input');
    assert.equal(r.lines[0]!.status, 'unreadable');
    assert.ok(r.lines[0]!.candidates.every((c) => c.requiresConfirmation));
  });
test('a duplicated model heading is unreadable; a page for another model contributes no parts', () => {
  assert.equal(
    extract('capacitor', `${header.replace('E1RD018S06B', 'E1RD036S06B')}\n${row}`).lines[0]!
      .status,
    'unreadable',
  );
  assert.equal(
    extract('capacitor', `${header.replace('E1RD036S06B', 'E1RD060S06B')}\n${row}`).lines[0]!
      .status,
    'not_found',
  );
});
test('unknown terminology is not mapped to a guessed part; extraction cannot cross page headers', () => {
  assert.equal(extract('mystery control').lines[0]!.status, 'not_found');
  const r = extractGuideParts(
    [
      { page: 2, text: header },
      { page: 3, text: row },
    ],
    guide,
    [{ name: 'capacitor', quantity: 1 }],
  );
  assert.equal(r.lines[0]!.status, 'not_found');
});
test('changed or unavailable PDF evidence returns no candidates', async () => {
  const fake = { resolve: async () => structuredClone(guide), pages: async () => null };
  const r = await resolveGuideParts(fake, {
    manufacturer: 'York',
    model: 'E1RD036S06B',
    lines: [{ name: 'capacitor', quantity: 1 }],
  });
  assert.equal(r.parts.status, 'unavailable');
  assert.deepEqual(r.parts.lines, []);
});
async function terminal(store: Store, id: string) {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    const job = store.get(id)!;
    if (!['running', 'queued'].includes(job.state)) return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Worker timeout');
}
test('step 3 API/worker persists candidates, blocks prefix and clarifies descriptions without sourcing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'torq-parts-'));
  const path = join(dir, 'jobs.sqlite');
  const resolver = new GuideResolver(dir, {
    fetch: async () => new Response('%PDF-1.4\nsynthetic transport'),
    extractPdf: async () => structuredClone(pages),
  });
  const store = new Store(path);
  const { app } = createApp(store, resolver);
  let id = '';
  try {
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/guides/extract',
          payload: { manufacturer: 'York', model: 'E1RD036S06B', lines: [] },
        })
      ).statusCode,
      400,
    );
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/guides/extract',
      payload: { manufacturer: 'York', model: 'E1RD036', lines: [{ name: 'capacitor' }] },
    });
    assert.equal(blocked.json().parts.status, 'blocked');
    assert.deepEqual(blocked.json().parts.lines, []);
    const created = await app.inject({
      method: 'POST',
      url: '/api/searches',
      payload: {
        mode: 'live',
        stopAfter: 'parts',
        model: 'E1RD036S06B',
        lines: [
          { name: 'control board', manufacturer: 'York' },
          { name: 'capacitor', manufacturer: 'York' },
        ],
      },
    });
    assert.equal(created.statusCode, 202);
    id = created.json().id;
    const job = await terminal(store, id);
    assert.equal(job.state, 'needs_input');
    assert.equal(job.parts?.lines[1]?.candidates[0]?.partNumber, 'S1-02425893000');
    assert.deepEqual(job.results, []);
    const clarified = await app.inject({
      method: 'POST',
      url: `/api/searches/${id}/clarification`,
      payload: {
        lines: [
          { name: 'defrost control', manufacturer: 'York' },
          { name: 'run capacitor', manufacturer: 'York' },
        ],
      },
    });
    assert.equal(clarified.statusCode, 202);
    const done = await terminal(store, id);
    assert.equal(done.state, 'completed');
    assert.equal(done.parts?.status, 'extracted');
    assert.deepEqual(done.results, []);
  } finally {
    await app.close();
  }
  const reopened = new Store(path);
  try {
    assert.equal(reopened.get(id)?.parts?.status, 'extracted');
    assert.equal(reopened.get(id)?.parts?.lines[0]?.candidates[0]?.evidence.modelColumn, 4);
  } finally {
    reopened.db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
