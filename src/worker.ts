import { reviewAlternatives, readAlternativeReference } from './alternatives.js';
import { buildComparison } from './comparison.js';
import { extractPartsForGuide } from './parts.js';
import { GuideResolver } from './guides.js';
import { exclusive } from './browser.js';
import { rank, type SearchInput } from './domain.js';
import { fixtureModel, fixtureParts } from './fixture.js';
import { lookup, SupplierError } from './suppliers.js';
import { Store, type LineResult } from './store.js';
import { loginSupplier, type ConnectionResult, type credentialSuppliers } from './auth.js';
import { supplierCredentials } from './supplier-credentials.js';
import { config } from './config.js';
import { modelName } from './model.js';

type CredentialSupplier = (typeof credentialSuppliers)[number];
type SupplierCredentials = Awaited<ReturnType<typeof supplierCredentials>>;
type CredentialReader = (supplier: CredentialSupplier) => Promise<SupplierCredentials>;
type SupplierLogin = (
  supplier: CredentialSupplier,
  credentials: NonNullable<SupplierCredentials>,
) => Promise<ConnectionResult>;

export class Worker {
  private queued = new Set<string>();
  constructor(
    private store: Store,
    private guides: Pick<GuideResolver, 'resolve'> &
      Partial<Pick<GuideResolver, 'pages'>> = new GuideResolver(),
    private supplierLookup: typeof lookup = lookup,
    private credentialReader: CredentialReader = supplierCredentials,
    private supplierLogin: SupplierLogin = loginSupplier,
    private referenceReader: typeof readAlternativeReference = readAlternativeReference,
  ) {}
  enqueue(id: string) {
    if (this.queued.has(id)) return;
    this.queued.add(id);
    void exclusive(() => this.run(id))
      .catch((e) => {
        if (this.store.get(id)?.state !== 'cancelled')
          this.store.update(
            id,
            { state: 'failed' },
            e instanceof Error ? e.message : 'Worker failed',
          );
      })
      .finally(() => this.queued.delete(id));
  }
  restart() {
    for (const job of this.store.pending()) {
      this.store.update(job.id, { state: 'queued' }, 'Resuming read-only sourcing after restart');
      this.enqueue(job.id);
    }
  }
  private active(id: string) {
    return this.store.get(id)?.state !== 'cancelled';
  }
  private async run(id: string) {
    const job = this.store.get(id);
    if (!job || !this.active(id)) return;
    this.store.update(
      id,
      {
        execution: {
          provider: config.modelProvider,
          model: modelName(),
          supplierEngine: config.supplierEngine,
          startedAt: new Date().toISOString(),
        },
      },
      'Recording the model provider and supplier workflow for this execution',
    );
    const automaticLoginAttempted = new Set<CredentialSupplier>();
    const lookupWithAutomaticLogin: typeof lookup = async (
      id,
      input,
      line,
      supplier,
      alternatives,
      options,
    ) => {
      if (!this.active(id))
        throw new SupplierError('CANCELLED', 'Search cancelled before supplier lookup.');
      try {
        return await this.supplierLookup(id, input, line, supplier, alternatives, options);
      } catch (error) {
        if (!this.active(id)) throw error;
        if (
          !(error instanceof SupplierError) ||
          error.code !== 'AUTH_REQUIRED' ||
          !(['johnstone', 'partstown'] as string[]).includes(supplier) ||
          automaticLoginAttempted.has(supplier as CredentialSupplier)
        )
          throw error;
        const credentialSupplier = supplier as CredentialSupplier;
        automaticLoginAttempted.add(credentialSupplier);
        const credentials = await this.credentialReader(credentialSupplier);
        if (!credentials) throw error;
        let login: ConnectionResult;
        try {
          if (!this.active(id))
            throw new SupplierError('CANCELLED', 'Search cancelled before supplier sign-in.');
          login = await this.supplierLogin(credentialSupplier, credentials);
        } finally {
          credentials.password = '';
          credentials.username = '';
        }
        if (!this.active(id))
          throw new SupplierError('CANCELLED', 'Search cancelled after supplier sign-in.');
        if (login.state !== 'authenticated') {
          const code =
            login.state === 'credentials_rejected'
              ? 'CREDENTIALS_REJECTED'
              : login.state === 'challenge'
                ? 'SITE_CHALLENGE'
                : 'AUTH_REQUIRED';
          throw new SupplierError(
            code,
            `Automatic ${credentialSupplier} sign-in could not be verified. ${login.message}`,
          );
        }
        // Retry the exact same read-only query once, after explicit positive
        // supplier sign-in evidence. A second auth failure is returned as-is.
        return await this.supplierLookup(id, input, line, supplier, alternatives, options);
      }
    };
    if (job.alternativeReview?.consent) {
      await reviewAlternatives(this.store, id, lookupWithAutomaticLogin, this.referenceReader);
      return;
    }
    this.store.update(
      id,
      {
        state: 'running',
        results: [],
        comparison: undefined,
        ...(job.sourceCapture
          ? {}
          : { guide: undefined, parts: undefined, capturedParts: undefined }),
      },
      'Starting request',
    );
    const input: SearchInput = structuredClone(job.input);
    if (
      input.mode === 'live' &&
      (['guide', 'parts', 'capture'].includes(input.stopAfter) ||
        input.lines.some((l) => !l.partNumber || !l.manufacturer))
    ) {
      if (!input.model) {
        this.store.update(
          id,
          { state: 'needs_input' },
          'Provide the equipment model for step 2 guide resolution.',
        );
        return;
      }
      this.store.update(id, {}, 'Step 2: checking saved guides, then reviewed discovery sources');
      const manufacturers = [
        ...new Set(
          input.lines
            .map((l) => l.manufacturer?.trim().toLowerCase())
            .filter((v): v is string => Boolean(v)),
        ),
      ];
      const prefixedYork = /^york(?:\s|[-:])/i.test(input.model.trim());
      if (manufacturers.length > 1 || (prefixedYork && manufacturers.some((m) => m !== 'york'))) {
        this.store.update(
          id,
          { state: 'needs_input' },
          'Conflicting equipment manufacturers. Confirm one manufacturer for the equipment guide.',
        );
        return;
      }
      const manufacturer = manufacturers[0] ?? (prefixedYork ? 'York' : undefined);
      if (!manufacturer) {
        this.store.update(
          id,
          { state: 'needs_input' },
          'Provide the equipment manufacturer for guide resolution; it is not assumed from an unverified model prefix.',
        );
        return;
      }
      const guide = await this.guides.resolve({ manufacturer, model: input.model });
      if (!this.active(id)) return;
      if (
        ['parts', 'capture'].includes(input.stopAfter) &&
        guide.status === 'guide_found' &&
        guide.guide
      ) {
        this.store.update(
          id,
          { guide },
          'Step 3: extracting requested parts from the exact model column',
        );
        const pages = await this.guides.pages?.(guide.guide.sha256);
        if (!this.active(id)) return;
        if (!pages) {
          this.store.update(
            id,
            { state: 'failed' },
            'Guide evidence failed integrity validation; no parts extracted.',
          );
          return;
        }
        const parts = await extractPartsForGuide(pages, guide, input.lines);
        guide.guide.warnings = guide.guide.warnings.filter(
          (w) => !w.includes('Requested part extraction'),
        );
        guide.guide.warnings.push('Supplier availability has not run.');
        this.store.update(
          id,
          {
            guide,
            parts,
            state:
              parts.status === 'extracted' && input.stopAfter !== 'capture'
                ? 'completed'
                : 'needs_input',
          },
          input.stopAfter === 'capture'
            ? 'Step 4: select the intended component for each line and capture its guide information.'
            : parts.status === 'extracted'
              ? 'Step 3 extraction finished. Review historical guide evidence; supplier sourcing has not run.'
              : 'Step 3 needs clarification. Review candidate descriptions, ambiguity and excluded rows.',
        );
        return;
      }
      const state =
        guide.status === 'unavailable'
          ? 'failed'
          : guide.status === 'guide_found' && input.stopAfter === 'guide'
            ? 'completed'
            : 'needs_input';
      this.store.update(
        id,
        { guide, state },
        guide.message +
          (guide.status === 'guide_found' && input.stopAfter !== 'guide'
            ? ' Part extraction is the next milestone; supply verified part numbers to source directly.'
            : ''),
      );
      return;
    }
    if (
      input.stopAfter === 'guide' ||
      input.stopAfter === 'parts' ||
      input.stopAfter === 'capture'
    ) {
      this.store.update(
        id,
        { state: 'needs_input' },
        'Step 2 guide resolution uses live documents. Set mode to live.',
      );
      return;
    }
    for (const line of input.lines) {
      if (line.partNumber && line.manufacturer) continue;
      if (input.mode === 'fixture' && input.model?.toUpperCase() === fixtureModel) {
        line.partNumber = /board/i.test(line.name)
          ? fixtureParts.board
          : /capacitor/i.test(line.name)
            ? fixtureParts.capacitor
            : undefined;
        line.manufacturer = 'York';
      }
      if (!line.partNumber || !line.manufacturer) {
        this.store.update(
          id,
          { state: 'needs_input' },
          input.mode === 'live'
            ? 'Provide verified manufacturer and part number per line. Live model-to-guide resolution is not implemented; the backend will not guess.'
            : `Fixture supports ${fixtureModel} with control board and capacitor. The abbreviated model is ambiguous; supply the full model or exact manufacturer/part numbers.`,
        );
        return;
      }
    }
    const results: LineResult[] = [];
    let permissionNeeded = false;
    for (const line of input.lines) {
      const result: LineResult = {
        name: line.name,
        quantity: line.quantity,
        offers: [],
        errors: [],
        attempts: [],
      };
      results.push(result);
      for (const supplier of new Set(input.suppliers)) {
        if (!this.active(id)) return;
        this.store.update(id, { results }, `Checking ${supplier}: ${line.name}`);
        try {
          const { offers, evidence, recovery, noMatchEvidence } = await lookupWithAutomaticLogin(
            id,
            input,
            line,
            supplier,
            false,
          );
          result.offers.push(...offers);
          result.attempts!.push({
            supplier,
            phase: 'exact',
            status: offers.length ? 'found' : 'no_match',
            query: line.partNumber!,
            observedAt: new Date().toISOString(),
            evidence,
            recovery,
            noMatchEvidence,
            message: noMatchEvidence
              ? `No exact identifier among all ${noMatchEvidence.returnedCount} inspected products returned by this query`
              : undefined,
          });
        } catch (e) {
          const code = e instanceof SupplierError ? e.code : 'SUPPLIER_ERROR';
          const message = e instanceof Error ? e.message : 'Supplier failed';
          const evidence = e instanceof SupplierError ? e.evidence : undefined;
          result.errors.push({ supplier, code, message });
          result.attempts!.push({
            supplier,
            phase: 'exact',
            status: 'error',
            query: line.partNumber!,
            observedAt: new Date().toISOString(),
            code,
            message,
            evidence,
            recovery: e instanceof SupplierError ? e.recovery : undefined,
          });
        }
        if (!this.active(id)) return;
        this.store.update(id, { results }, `Finished ${supplier}: ${line.name}`);
      }
      if (!result.offers.some((o) => o.match === 'exact') && result.errors.length === 0) {
        if (input.stopAfter === 'comparison' || !input.allowAlternatives || job.sourceCapture)
          permissionNeeded = true;
        else if (!job.sourceCapture)
          for (const supplier of new Set(input.suppliers)) {
            if (!this.active(id)) return;
            try {
              const { offers } = await lookupWithAutomaticLogin(id, input, line, supplier, true);
              result.offers.push(...offers);
            } catch (e) {
              result.errors.push({
                supplier,
                code: e instanceof SupplierError ? e.code : 'SUPPLIER_ERROR',
                message: e instanceof Error ? e.message : 'Supplier failed',
              });
            }
          }
      }
      result.rankings = rank(result.offers, line.quantity);
    }
    if (!this.active(id)) return;
    if (input.stopAfter === 'comparison') {
      this.store.update(
        id,
        { results },
        'Step 6: evaluating fresh commercial evidence, branch locations and delivery estimates',
      );
      const comparisonJob = this.store.get(id)!;
      const comparison = await buildComparison(comparisonJob, this.store, () => this.active(id));
      if (!this.active(id)) return;
      for (let i = 0; i < results.length; i++)
        results[i]!.offers = comparisonJob.results[i]!.offers;
      this.store.update(
        id,
        { results, comparison, state: comparison.status === 'ready' ? 'completed' : 'needs_input' },
        comparison.status === 'ready'
          ? 'Step 6 comparison finished. Review evidence, scope and estimate limitations.'
          : 'Step 6 needs verification. Missing price, pickup or delivery evidence prevents a complete comparison.',
      );
      return;
    }
    const errors = results.some((r) => r.errors.length > 0);
    this.store.update(
      id,
      { results, state: errors ? 'partial' : permissionNeeded ? 'needs_permission' : 'completed' },
      errors
        ? 'Some supplier checks failed; inspect per-supplier errors. No complete-scope no-match conclusion was made.'
        : permissionNeeded
          ? 'Exact checks finished. Permission is required to search alternatives for unresolved lines.'
          : 'Search finished. Review match types and evidence; completion does not imply all parts were found.',
    );
  }
}
