import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { GuideResolver } from '../src/guides.js';

// Real-data acceptance, deliberately separate from offline unit tests.
const directory = await mkdtemp(join(tmpdir(), 'torq-guide-'));
try {
  const resolver = new GuideResolver(directory);
  const first = await resolver.resolve({ manufacturer: 'York', model: 'York - E1RD036' });
  assert.equal(first.status, 'needs_model_confirmation');
  assert.equal(first.cacheHit, false);
  assert.deepEqual(first.guide?.matchingModels, ['E1RD036S06B']);
  assert.ok(first.guide?.warnings.some((w) => w.includes('incomplete guide copy')));
  const hash = first.guide!.sha256;
  const document = await resolver.document(hash);
  assert.ok(document);
  assert.equal(createHash('sha256').update(document).digest('hex'), hash);
  // No network should be needed after the initial successful retrieval.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Network deliberately unavailable');
  };
  try {
    const second = await resolver.resolve({ manufacturer: 'York', model: 'E1RD036S06B' });
    assert.equal(second.status, 'guide_found');
    assert.equal(second.cacheHit, true);
    const wrong = await resolver.resolve({ manufacturer: 'York', model: 'E1RD036S46B' });
    assert.equal(wrong.status, 'not_found');
    assert.equal(wrong.guide?.applicability, 'not_listed');
    const metadataPath = join(directory, 'york-e1rd.json');
    const saved = JSON.parse(await readFile(metadataPath, 'utf8'));
    assert.equal(saved.sha256, hash);
    saved.pages[1].text = saved.pages[1].text.replaceAll('E1RD036S06B', 'E1RD036S46B');
    await writeFile(metadataPath, JSON.stringify(saved));
    const tampered = await resolver.resolve({ manufacturer: 'York', model: 'E1RD036S46B' });
    assert.equal(tampered.status, 'not_found');
    assert.equal(tampered.cacheHit, true);
    assert.deepEqual(tampered.guide?.coveredModels, first.guide?.coveredModels);
    await writeFile(join(directory, `${hash}.pdf`), 'broken');
    const corrupt = await resolver.resolve({ manufacturer: 'York', model: 'E1RD036' });
    assert.equal(corrupt.status, 'unavailable');
    assert.equal(corrupt.guide, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(
    JSON.stringify(
      {
        passed: true,
        status: first.status,
        matchingModels: first.guide?.matchingModels,
        pages: first.guide?.pageCount,
        sha256: hash,
        checks: [
          'real PDF download',
          'prefix clarification',
          'exact listed model',
          'wrong suffix rejected',
          'offline cache',
          'checksum tampering rejected',
          'cached-text tampering cannot change model coverage',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
