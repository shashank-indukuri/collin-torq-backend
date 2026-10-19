import { createHash } from 'node:crypto';
import { startAlternativeReview } from './alternatives.js';
import { loginSupplier, loginSchema, credentialSuppliers, supplierSession } from './auth.js';
import { startCapturedSourcing, sourcingRequestSchema } from './sourcing.js';
import { captureParts, captureRequestSchema, CaptureError } from './capture.js';
import { extractionRequestSchema, resolveGuideParts } from './parts.js';
import { GuideResolver, guideRequestSchema } from './guides.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';
import { startComparison, comparisonView } from './comparison.js';
import { exclusive, getBrowser, closeBrowser } from './browser.js';
import { inputSchema, supplierSchema } from './domain.js';
import { fixtureDefaults, registerFixtures } from './fixture.js';
import { ollamaHealth, usage } from './ollama.js';
import { Store } from './store.js';
import { supplierSites } from './suppliers.js';
import { Worker } from './worker.js';
import { openapi } from './openapi.js';
import { cloudBudget } from './cloud-provider.js';
import { modelName } from './model.js';

export function createApp(
  store = new Store(),
  guides = new GuideResolver(),
  supplierLookup?: typeof import('./suppliers.js').lookup,
) {
  const app = Fastify({
    bodyLimit: 32 * 1024,
    logger: true,
    routerOptions: { maxParamLength: 256 },
  });
  const worker = new Worker(store, guides, supplierLookup);
  app.register(cors, {
    origin: [
      config.frontendOrigin,
      `http://127.0.0.1:${config.port}`,
      `http://localhost:${config.port}`,
    ],
  });
  // Prevent browser cross-site requests from driving a privileged local service.
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (
      origin &&
      ![
        config.frontendOrigin,
        `http://127.0.0.1:${config.port}`,
        `http://localhost:${config.port}`,
      ].includes(origin)
    )
      return reply.code(403).send({ error: 'ORIGIN_DENIED' });
    const hostname = req.hostname;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname))
      return reply.code(403).send({ error: 'HOST_DENIED' });
  });
  app.setErrorHandler((error, req, reply) => {
    if (!(error instanceof Error)) return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    if (error instanceof CaptureError)
      return reply.code(error.statusCode).send({ error: error.code });
    if (error instanceof z.ZodError)
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: error.issues });
    if (
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    )
      return reply.code(error.statusCode).send({ error: 'BAD_REQUEST', message: error.message });
    if (error.message === 'IDEMPOTENCY_CONFLICT')
      return reply.code(409).send({ error: error.message });
    req.log.error({ message: error.message }, 'Request failed');
    return reply
      .code(500)
      .send({ error: 'INTERNAL_ERROR', message: 'Check the backend terminal for details.' });
  });
  registerFixtures(app);
  app.get('/', async (_, reply) =>
    reply.type('text/html').send(await readFile('public/index.html', 'utf8')),
  );
  app.get('/flow', async (_, reply) =>
    reply.type('text/html').send(await readFile('public/flow.html', 'utf8')),
  );
  app.get('/api/health', async () => ({
    status: 'ok',
    localOnly: config.modelProvider === 'ollama',
    browserLocal: true,
    paidServicesEnabled: config.modelProvider === 'openai',
    model: {
      provider: config.modelProvider,
      name: modelName(),
      supplierEngine: config.supplierEngine,
    },
    ...(config.modelProvider === 'openai' ? { cloudBudget: await cloudBudget() } : {}),
    ollama: await ollamaHealth(),
    usage,
  }));
  app.get('/api/examples/step2', async () => ({
    mode: 'live',
    stopAfter: 'guide',
    model: 'York - E1RD036',
    origin: { address: 'Arlington, VA 22201' },
    lines: [
      { name: 'control board', manufacturer: 'York', quantity: 1 },
      { name: 'capacitor', manufacturer: 'York', quantity: 1 },
    ],
  }));
  app.get('/api/examples/step4', async () => ({
    mode: 'live',
    stopAfter: 'capture',
    model: 'E1RD036S06B',
    origin: { address: 'Arlington, VA 22201' },
    lines: [
      { name: 'control board', manufacturer: 'York', quantity: 1 },
      { name: 'capacitor', manufacturer: 'York', quantity: 1 },
    ],
  }));
  app.post('/api/searches/:id/source', async (req, reply) => {
    const { job, reused } = startCapturedSourcing(
      store,
      (req.params as { id: string }).id,
      sourcingRequestSchema.parse(req.body),
    );
    if (!reused) worker.enqueue(job.id);
    return reply.code(reused ? 200 : 202).send(comparisonView(job));
  });
  app.post('/api/searches/:id/capture', async (req) =>
    exclusive(() =>
      captureParts(
        store,
        guides,
        (req.params as { id: string }).id,
        captureRequestSchema.parse(req.body),
      ),
    ),
  );
  app.get('/api/examples/step3', async () => ({
    mode: 'live',
    stopAfter: 'parts',
    model: 'E1RD036S06B',
    origin: { address: 'Arlington, VA 22201' },
    lines: [
      { name: 'control board', manufacturer: 'York', quantity: 1 },
      { name: 'capacitor', manufacturer: 'York', quantity: 1 },
    ],
  }));
  app.post('/api/guides/extract', async (req) =>
    exclusive(() => resolveGuideParts(guides, extractionRequestSchema.parse(req.body))),
  );
  app.post('/api/guides/resolve', async (req) =>
    exclusive(() => guides.resolve(guideRequestSchema.parse(req.body))),
  );
  app.get('/api/guides/:hash/document', async (req, reply) => {
    const hash = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse((req.params as { hash: string }).hash);
    const document = await guides.document(hash);
    return document
      ? reply
          .header('Content-Disposition', 'inline; filename="parts-guide.pdf"')
          .type('application/pdf')
          .send(document)
      : reply.code(404).send({ error: 'NOT_FOUND' });
  });
  app.get('/api/example', async () => fixtureDefaults);
  app.get('/api/openapi.json', async () => openapi);
  app.get('/api/searches', async () => ({ jobs: store.list().map((j) => comparisonView(j)) }));
  app.post('/api/searches', async (req, reply) => {
    const input = inputSchema.parse(req.body);
    const key = z.string().min(1).max(200).optional().parse(req.headers['idempotency-key']);
    const { job, reused } = store.create(input, key);
    if (!reused) worker.enqueue(job.id);
    return reply.code(reused ? 200 : 202).send(job);
  });
  app.get('/api/searches/:id', async (req, reply) => {
    const job = store.get((req.params as { id: string }).id);
    return job ? comparisonView(job) : reply.code(404).send({ error: 'NOT_FOUND' });
  });
  app.post('/api/searches/:id/compare', async (req, reply) => {
    const { job, reused } = startComparison(store, (req.params as { id: string }).id, req.body);
    if (!reused) worker.enqueue(job.id);
    return reply.code(reused ? 200 : 202).send(comparisonView(job));
  });
  app.post('/api/searches/:id/alternatives/review', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const before = store.get(id);
    const updated = startAlternativeReview(store, id, req.body);
    if (updated.alternativeReview?.requestedAt !== before?.alternativeReview?.requestedAt)
      worker.enqueue(id);
    return reply.code(updated.state === 'queued' ? 202 : 200).send(updated);
  });
  app.post('/api/searches/:id/alternatives', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const job = store.get(id);
    if (!job) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (job.state !== 'needs_permission')
      return reply.code(409).send({ error: 'NOT_WAITING_FOR_PERMISSION' });
    const { allow } = z.object({ allow: z.boolean() }).strict().parse(req.body);
    if (allow && job.sourceCapture)
      return reply.code(409).send({
        error: 'ALTERNATIVE_SPECIFICATIONS_UNVERIFIED',
        message:
          'Captured guide specifications and current replacements must be verified before alternative matching. Exact-number sourcing is available.',
      });
    const updated = store.update(
      id,
      { input: { ...job.input, allowAlternatives: allow }, state: allow ? 'queued' : 'completed' },
      allow
        ? 'User permitted alternatives search'
        : 'User declined alternatives; sourcing finished',
    );
    if (allow) worker.enqueue(id);
    return reply.code(allow ? 202 : 200).send(updated);
  });
  app.post('/api/searches/:id/clarification', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const job = store.get(id);
    if (!job) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (job.state !== 'needs_input' || job.alternativeReview)
      return reply.code(409).send({ error: 'NOT_WAITING_FOR_INPUT' });
    const input = inputSchema.parse({
      ...job.input,
      ...z
        .object({ model: z.string().optional(), lines: inputSchema.shape.lines.optional() })
        .strict()
        .parse(req.body),
    });
    const updated = store.update(id, { input, state: 'queued' }, 'Clarification received');
    worker.enqueue(id);
    return reply.code(202).send(updated);
  });
  app.post('/api/searches/:id/cancel', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const job = store.get(id);
    if (!job) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (['completed', 'failed', 'partial', 'cancelled'].includes(job.state))
      return reply.code(409).send({ error: 'JOB_TERMINAL' });
    return store.update(
      id,
      { state: 'cancelled' },
      'Cancelled; active browser operation will finish but no new supplier operation will start',
    );
  });
  app.post('/api/searches/:id/retry', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const job = store.get(id);
    if (!job) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (!['partial', 'failed'].includes(job.state))
      return reply.code(409).send({ error: 'JOB_NOT_RETRYABLE' });
    const updated = store.update(
      id,
      { state: 'queued' },
      'Retry requested; refreshing supplier evidence',
    );
    worker.enqueue(id);
    return reply.code(202).send(updated);
  });
  app.get('/api/connections/:supplier/status', async (req) => {
    const supplier = z
      .enum(credentialSuppliers)
      .parse((req.params as { supplier: string }).supplier);
    return exclusive(() => supplierSession(supplier));
  });
  app.post('/api/connections/:supplier/login', async (req, reply) => {
    const supplier = z
      .enum(credentialSuppliers)
      .parse((req.params as { supplier: string }).supplier);
    const credentials = loginSchema.parse(req.body);
    try {
      if (store.pending().length) return reply.code(409).send({ error: 'BROWSER_BUSY' });
      return await exclusive(() => loginSupplier(supplier, credentials));
    } finally {
      credentials.password = '';
      credentials.username = '';
      if (req.body && typeof req.body === 'object') {
        (req.body as Record<string, unknown>).password = '';
        (req.body as Record<string, unknown>).username = '';
      }
    }
  });
  app.post('/api/connections/:supplier/open', async (req, reply) => {
    const supplier = supplierSchema.parse((req.params as { supplier: string }).supplier);
    if (store.pending().length) return reply.code(409).send({ error: 'BROWSER_BUSY' });
    await exclusive(async () => {
      const sh = await getBrowser();
      const page = (await sh.browser.context.activePage()) ?? (await sh.browser.context.newPage());
      await sh.browser.context.setActivePage(page);
      await page.goto(supplierSites[supplier].home);
    });
    return {
      supplier,
      state: 'manual_login',
      message:
        'Use the dedicated Chrome window to sign in. Credentials are not stored by this API. Pause sourcing while connecting.',
    };
  });
  app.get('/api/searches/:id/evidence/:file', async (req, reply) => {
    const { id, file } = req.params as { id: string; file: string };
    z.string().uuid().parse(id);
    z.string()
      .regex(/^[a-z0-9-]+\.png$/i)
      .parse(file);
    const job = store.get(id);
    const alternativeFile =
      job?.alternativeReview?.references.some((r) => r.evidence.screenshot === file) ||
      job?.alternativeReview?.lines.some((l) =>
        l.candidates.some(
          (c) =>
            c.offers.some((o) => o.evidence === file) ||
            c.attempts.some(
              (a) =>
                a.evidence?.screenshot === file ||
                a.noMatchEvidence?.products.some((p) => p.evidence.screenshot === file),
            ),
        ),
      );
    const commercialFile = job?.results.some((r) =>
      r.offers.some(
        (o) =>
          o.commercial?.evidence.screenshot === file ||
          o.commercial?.branches.some((b) => b.evidence.screenshot === file) ||
          o.agent?.observations.some((f) => f.evidence.screenshot === file),
      ),
    );
    if (
      !job ||
      (!commercialFile &&
        !alternativeFile &&
        !job.results.some(
          (r) =>
            r.offers.some((o) => o.evidence === file) ||
            r.attempts?.some(
              (a) =>
                a.evidence?.screenshot === file ||
                a.noMatchEvidence?.products.some((p) => p.evidence.screenshot === file),
            ),
        ))
    )
      return reply.code(404).send({ error: 'NOT_FOUND' });
    try {
      return reply
        .type('image/png')
        .send(await readFile(join(config.dataDir, 'evidence', id, file)));
    } catch {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
  });
  app.get('/api/searches/:id/alternative-references/:hash', async (req, reply) => {
    const { id, hash } = req.params as { id: string; hash: string };
    z.string().uuid().parse(id);
    z.string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(hash);
    if (!store.get(id)?.alternativeReview?.references.some((r) => r.sha256 === hash))
      return reply.code(404).send({ error: 'NOT_FOUND' });
    try {
      const bytes = await readFile(join(config.dataDir, 'evidence', id, hash + '.json'));
      if (createHash('sha256').update(bytes).digest('hex') !== hash)
        return reply.code(409).send({ error: 'REFERENCE_INTEGRITY_FAILED' });
      return reply.type('application/json').send(bytes);
    } catch {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
  });
  app.addHook('onClose', async () => {
    await exclusive(closeBrowser);
    store.db.close();
  });
  return { app, worker, store };
}
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const { app, worker } = createApp();
  await app.listen({ host: '127.0.0.1', port: config.port });
  worker.restart();
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
}
