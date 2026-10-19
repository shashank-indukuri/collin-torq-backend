import { collectProductLinks } from './product-links.js';
import { agentLookup, SourcingAgentError } from './sourcing-agent.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { safeProductUrl, findExactProductLink } from './recovery-policy.js';
import { collectCommercial, parseCommercial } from './commercial.js';
import { signedInControl } from './auth.js';
import {
  partsTownCatalog,
  supplierSearchNoMatch,
  graingerNoExactResults,
  johnstoneCatalog,
  graingerCatalog,
  graingerProductIdentity,
  inspectedGraingerNoMatch,
} from './catalog.js';
import { z } from 'zod';
import { getBrowser, recover, saveEvidence } from './browser.js';
import { config } from './config.js';
import {
  assess,
  offerSchema,
  type Offer,
  type SearchInput,
  type RawOffer,
  type QueryInspection,
} from './domain.js';

export const supplierSites = {
  johnstone: {
    home: 'https://www.johnstonesupply.com/',
    search: (q: string) =>
      `https://www.johnstonesupply.com/search?searchPhrase=${encodeURIComponent(q)}`,
  },
  partstown: {
    home: 'https://www.partstown.com/',
    search: (q: string) => `https://www.partstown.com/search?q=${encodeURIComponent(q)}`,
  },
  grainger: {
    home: 'https://www.grainger.com/',
    search: (q: string) => `https://www.grainger.com/search?searchQuery=${encodeURIComponent(q)}`,
  },
};
export class SupplierError extends Error {
  constructor(
    public code: string,
    message: string,
    public evidence?: { url: string; screenshot: string; observedAt: string },
    public recovery?: { attempted: true; navigationVerified: boolean },
  ) {
    super(message);
  }
}
let sourcingPageId: string | undefined;
type LookupContext = {
  evidence?: { url: string; screenshot: string; observedAt: string };
  noMatchEvidence?: QueryInspection;
  recovery?: { attempted: true; navigationVerified: boolean };
};
export type LookupResult = {
  noMatchEvidence?: QueryInspection;
  recovery?: { attempted: true; navigationVerified: boolean };
  offers: Offer[];
  evidence: { url: string; screenshot: string; observedAt: string };
};
export async function lookup(
  jobId: string,
  input: SearchInput,
  line: SearchInput['lines'][number],
  supplier: Offer['supplier'],
  alternatives: boolean,
  options: { forceRecovery?: boolean } = {},
): Promise<LookupResult> {
  const label = `${supplier}-${line.partNumber ?? line.name}-${alternatives ? 'alt' : 'exact'}`;
  const context: LookupContext = {};
  try {
    if (input.mode === 'live' && config.supplierEngine === 'agent')
      return await agentLookup(jobId, input, line, supplier, alternatives);
    const offers = await lookupOffers(jobId, input, line, supplier, alternatives, context, options);
    const evidence =
      context.evidence ??
      (offers[0]
        ? {
            url: offers[0].sourceUrl,
            screenshot: offers[0].evidence,
            observedAt: offers[0].observedAt,
          }
        : await saveEvidence(jobId, label));
    if (
      input.mode === 'live' &&
      input.stopAfter === 'comparison' &&
      !alternatives &&
      offers.length === 1 &&
      offers[0]!.match === 'exact'
    ) {
      try {
        offers[0]!.commercial = await collectCommercial(jobId, offers[0]!, line, input.origin);
      } catch {
        offers[0]!.commercial = parseCommercial(offers[0]!, line.quantity, '', '', '', evidence);
        offers[0]!.commercial.issues.push(
          'Commercial inspection could not finish; the exact catalog observation is retained without a ranking claim.',
        );
      }
    }
    return {
      offers,
      evidence,
      recovery: context.recovery,
      noMatchEvidence: context.noMatchEvidence,
    };
  } catch (error) {
    let evidence;
    try {
      evidence = await saveEvidence(jobId, `${label}-error`);
    } catch {
      /* Page/browser unavailable; preserve the original failure. */
    }
    if (error instanceof SourcingAgentError)
      throw new SupplierError(error.code, error.message, evidence);
    if (error instanceof SupplierError) {
      error.evidence ??= context.evidence ?? evidence;
      error.recovery = context.recovery;
      throw error;
    }
    throw new SupplierError(
      'SUPPLIER_ERROR',
      error instanceof Error ? error.message : 'Supplier failed',
      context.evidence ?? evidence,
      context.recovery,
    );
  }
}
async function lookupOffers(
  jobId: string,
  input: SearchInput,
  line: SearchInput['lines'][number],
  supplier: Offer['supplier'],
  alternatives: boolean,
  context: LookupContext = {},
  options: { forceRecovery?: boolean } = {},
): Promise<Offer[]> {
  if (!alternatives && (!line.partNumber?.trim() || !line.manufacturer?.trim()))
    throw new SupplierError(
      'EXACT_ID_REQUIRED',
      'Manufacturer and exact part number are required.',
    );
  let sh = await getBrowser();
  let page =
    (await sh.browser.context.pages()).find((p) => p.pageId === sourcingPageId) ??
    (await sh.browser.context.newPage());
  sourcingPageId = page.pageId;
  await sh.browser.context.setActivePage(page);
  const query = alternatives ? line.name : line.partNumber!;
  const fixture = input.mode === 'fixture';
  const url = fixture
    ? `http://127.0.0.1:${config.port}/fixtures/${supplier}?q=${encodeURIComponent(query)}${input.simulateRecovery ? '&recovery=1' : ''}`
    : supplierSites[supplier].search(query);
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded', 15000);

  if (fixture) {
    if (input.simulateRecovery) {
      await recover(url, 'Click the Show availability button once, then finish.', ['127.0.0.1']);
      sh = await getBrowser();
      const resumed = (await sh.browser.context.pages()).find((p) => p.pageId === page.pageId);
      if (!resumed)
        throw new SupplierError('RECOVERY_FAILED', 'Original page was lost during handoff');
      await sh.browser.context.setActivePage(resumed);
      if (
        !(await resumed.evaluate(() => !(document.querySelector('#details') as HTMLElement).hidden))
      )
        throw new SupplierError('RECOVERY_FAILED', 'Availability panel is still closed');
    }
    const active = (await sh.browser.context.activePage())!;
    const text = await active.evaluate(
      () => document.querySelector('#offer')?.textContent ?? 'null',
    );
    const raw = JSON.parse(text);
    if (!raw) return [];
    const parsed = offerSchema.parse(raw);
    const ev = await saveEvidence(
      jobId,
      `${supplier}-${line.name}-${alternatives ? 'alt' : 'exact'}`,
    );
    // Fixture parser tests the browser path; local LLM is independently exercised by npm run smoke.
    return [assess(parsed, line, supplier, ev, true, alternatives)].filter(
      (o) => alternatives || o.match === 'exact',
    );
  }

  let body = await page.evaluate(() => document.body.innerText);
  for (let i = 0; i < 3 && body.trim().length < 200; i++) {
    await new Promise((r) => setTimeout(r, 700));
    body = await page.evaluate(() => document.body.innerText);
  }
  if (!body.trim())
    throw new SupplierError(
      'EMPTY_PAGE',
      'Supplier returned an empty or unreadable browser page; no inventory conclusion was made.',
    );
  if (
    /access denied|verify you are human|checking your browser|unusual traffic|captcha/i.test(
      body.slice(0, 5000),
    )
  ) {
    throw new SupplierError(
      'SITE_CHALLENGE',
      'Supplier requires a browser challenge. Reconnect manually; no stock conclusion was made.',
    );
  }
  if (supplier === 'partstown') {
    for (
      let i = 0;
      i < 12 &&
      !/Manufacturer #|no results found|no products matched|there are no products matching|access denied|captcha/i.test(
        body,
      );
      i++
    ) {
      await new Promise((r) => setTimeout(r, 500));
      body = await page.evaluate(() => document.body.innerText);
    }
  }
  if (
    supplier === 'grainger' &&
    !alternatives &&
    new URL(await page.url()).pathname.startsWith('/category/')
  ) {
    // Grainger redirects some exact queries into lazily loaded product tables.
    // Wait for the actual rows, then inspect at most five observed detail links.
    let rows: { href: string; text: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const data = await page.evaluate(() => ({
        text: document.body.innerText,
        rows: Array.from(document.querySelectorAll('tr a[href],[role="row"] a[href]')).map((a) => ({
          href: (a as HTMLAnchorElement).href,
          text: (a.closest('tr,[role="row"]') as HTMLElement | null)?.innerText ?? '',
        })),
      }));
      body = data.text;
      rows = [
        ...new Map(
          data.rows
            .filter((r) => /^https:\/\/www\.grainger\.com\/product\/[^/]+/.test(r.href))
            .map((r) => [r.href, r]),
        ).values(),
      ];
      const count = Number(
        body.match(/Showing results for[^\n]*\n\s*(?:Available\s+)?(\d+) products?/i)?.[1] ?? 0,
      );
      if (rows.length && (count ? rows.length >= Math.min(count, 5) : !body.includes('Loading...')))
        break;
      await page.evaluate(() => window.scrollBy(0, Math.max(500, window.innerHeight - 150)));
      await new Promise((r) => setTimeout(r, 500));
    }
    await writeFile(
      join(config.dataDir, 'last-grainger-category.json'),
      JSON.stringify({ url: await page.url(), query: line.partNumber, text: body, rows }, null, 2),
      { mode: 0o600 },
    );
    const queryUrl = await page.url();
    const queryText = body;
    const queryEvidence = await saveEvidence(jobId, 'grainger-category-query');
    const inspected: QueryInspection['products'] = [];
    let found = false;
    const diagnostics: { url: string; text: string; identity: RawOffer | null }[] = [];
    for (const row of rows.slice(0, 5)) {
      if (!safeProductUrl(row.href, 'www.grainger.com')) continue;
      await page.goto(row.href);
      for (let i = 0; i < 12; i++) {
        body = await page.evaluate(() => document.body.innerText);
        if (graingerProductIdentity(body)) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      const identity = graingerProductIdentity(body);
      diagnostics.push({ url: await page.url(), text: body, identity });
      await writeFile(
        join(config.dataDir, 'last-grainger-products.json'),
        JSON.stringify(diagnostics, null, 2),
        { mode: 0o600 },
      );
      if (identity) {
        const evidence = await saveEvidence(jobId, 'grainger-category-product');
        inspected.push({
          manufacturer: identity.manufacturer,
          partNumber: identity.partNumber,
          sourceUrl: await page.url(),
          evidence,
        });
      }
      if (graingerCatalog(body, line.manufacturer!, line.partNumber!)) {
        found = true;
        break;
      }
    }
    if (!found) {
      const proof = inspectedGraingerNoMatch(queryUrl, queryText, line.partNumber!, inspected);
      if (proof) {
        context.noMatchEvidence = proof;
        context.evidence = queryEvidence;
        return [];
      }
    }
    if (!found)
      throw new SupplierError(
        'EXACT_ID_UNVERIFIED',
        'Category-table inspection did not establish the requested manufacturer/part number; no no-match conclusion was made.',
      );
  }
  if (supplier === 'johnstone') {
    // Positive authentication evidence is required; a generic Sign in link alone is inconclusive.
    if (!(await signedInControl(page)))
      throw new SupplierError(
        'AUTH_REQUIRED',
        'Connect this supplier in the dedicated Chrome window, then retry.',
      );
  }
  if (
    supplier === 'grainger' &&
    !alternatives &&
    graingerNoExactResults(
      await page.url(),
      await page.evaluate(() => document.title),
      body,
      line.partNumber!,
    )
  )
    return [];
  // Follow only a product link on this supplier, visibly associated with the requested identifier.
  const links = await collectProductLinks(page, new URL(url).hostname);
  body = await page.evaluate(() => document.body.innerText);
  if (
    /access denied|verify you are human|checking your browser|unusual traffic|captcha/i.test(
      body.slice(0, 5000),
    )
  )
    throw new SupplierError(
      'SITE_CHALLENGE',
      'Supplier requires a human challenge; no match or inventory conclusion was made.',
    );
  if (
    supplier === 'grainger' &&
    !alternatives &&
    graingerNoExactResults(
      await page.url(),
      await page.evaluate(() => document.title),
      body,
      line.partNumber!,
    )
  )
    return [];
  const current = new URL(await page.url());
  const onProduct = safeProductUrl(current.href, new URL(url).hostname);
  const product =
    !alternatives && !options.forceRecovery
      ? findExactProductLink(links, current.href, line.partNumber!)
      : undefined;
  const headings = await page.evaluate(() =>
    Array.from(document.querySelectorAll('h1,h2,[role="heading"]')).map((e) =>
      (e.textContent ?? '').trim(),
    ),
  );
  if (
    !alternatives &&
    supplier !== 'grainger' &&
    supplierSearchNoMatch(supplier, await page.url(), headings, line.partNumber!, body)
  ) {
    context.evidence = await saveEvidence(jobId, `${supplier}-${line.partNumber}-exact`);
    return [];
  }
  if (
    /no products matched|no results found|unable to find any results|there are no products matching|we could not find any matches/i.test(
      body,
    )
  )
    await writeFile(
      join(config.dataDir, `last-no-match-${supplier}.json`),
      JSON.stringify({ url: await page.url(), headings, text: body }, null, 2),
      { mode: 0o600 },
    );
  // Search inputs and recommendations are not product-detail identity evidence.
  if (!alternatives && (options.forceRecovery || (!onProduct && !product))) {
    const observed = links
      .filter((a) => safeProductUrl(a.href, current.hostname))
      .map((a) => ({ url: a.href, text: (a.text + ' ' + a.context).slice(0, 400) }));
    if (options.forceRecovery && onProduct)
      observed.unshift({
        url: current.href,
        text: (await page.evaluate(() => document.querySelector('h1')?.textContent ?? '')).slice(
          0,
          400,
        ),
      });
    const candidates = [...new Map(observed.map((c) => [c.url, c])).values()].slice(0, 12);
    if (!config.recovery || !candidates.length)
      throw new SupplierError(
        'PRODUCT_DETAILS_UNVERIFIED',
        'No bounded product-link recovery is available for this page.',
      );
    await writeFile(
      join(config.dataDir, 'last-product-recovery.json'),
      JSON.stringify(
        { supplier, url: current.href, partNumber: line.partNumber, text: body, links },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    context.evidence = await saveEvidence(jobId, `${supplier}-${line.partNumber}-before-recovery`);
    context.recovery = { attempted: true, navigationVerified: false };
    const result = await recover(
      await page.url(),
      `Identify the product matching manufacturer ${line.manufacturer} and exact part ${line.partNumber}. Use an allowed product candidate only.`,
      [current.hostname],
      {
        kind: 'product',
        partNumber: line.partNumber!,
        manufacturer: line.manufacturer,
        candidates,
      },
    );
    context.recovery.navigationVerified = result.successful;
    sh = await getBrowser();
    const resumed = (await sh.browser.context.pages()).find((p) => p.pageId === page.pageId);
    if (!resumed || !result.successful)
      throw new SupplierError(
        'RECOVERY_FAILED',
        'Browser Use did not reach a verified allowed product URL.',
      );
    page = resumed;
    body = await page.evaluate(() => document.body.innerText);
  }
  if (product && product.href !== (await page.url())) {
    await page.goto(product.href);
    body = await page.evaluate(() => document.body.innerText);
  }
  if (
    /access denied|verify you are human|checking your browser|unusual traffic|captcha/i.test(
      body.slice(0, 5000),
    )
  )
    throw new SupplierError(
      'SITE_CHALLENGE',
      'Supplier requires a browser challenge; no availability conclusion was made.',
    );
  // Product-detail identity can load after navigation; all exact facts must pass
  // the reviewed main-product parser, even when a model chose the destination.
  if (!alternatives) {
    if (!safeProductUrl(await page.url(), new URL(url).hostname))
      throw new SupplierError(
        'PRODUCT_DETAILS_UNVERIFIED',
        'Supplier did not reach a reviewed product detail URL.',
      );
    for (let i = 0; i < 12; i++) {
      body = await page.evaluate(() => document.body.innerText);
      const ready =
        supplier === 'johnstone'
          ? johnstoneCatalog(body)
          : supplier === 'partstown'
            ? partsTownCatalog(body, line.manufacturer!, line.partNumber!)
            : graingerProductIdentity(body);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (supplier === 'johnstone' && !(await signedInControl(page)))
      throw new SupplierError(
        'AUTH_REQUIRED',
        'Supplier session expired during navigation. Reconnect and retry.',
      );
  }

  if (supplier === 'grainger' && !alternatives) {
    const catalog = graingerCatalog(body, line.manufacturer!, line.partNumber!);
    if (catalog) {
      const evidence = await saveEvidence(jobId, `${supplier}-${line.partNumber}-catalog`);
      return [
        {
          ...assess(catalog, line, supplier, evidence, false),
          access: 'public_catalog',
          priceBasis: 'public_displayed',
        },
      ];
    }
  }
  if (supplier === 'johnstone' && !alternatives) {
    const catalog = johnstoneCatalog(body);
    if (catalog) {
      const evidence = await saveEvidence(jobId, `${supplier}-${line.partNumber}-catalog`);
      const offer = assess(catalog, line, supplier, evidence, false);
      if (offer.match !== 'exact')
        throw new SupplierError(
          'EXACT_ID_UNVERIFIED',
          'Main product manufacturer and identifier do not match the requested part.',
          evidence,
        );
      return [{ ...offer, access: 'authenticated', priceBasis: 'account_unverified' }];
    }
  }
  if (supplier === 'partstown' && !alternatives) {
    const catalog = partsTownCatalog(body, line.manufacturer!, line.partNumber!);
    if (catalog) {
      const evidence = await saveEvidence(jobId, `${supplier}-${line.partNumber}-catalog`);
      const authenticated = await signedInControl(page);
      const offer = assess(catalog, line, supplier, evidence, false);
      return [
        {
          ...offer,
          access: authenticated ? 'authenticated' : 'public_catalog',
          priceBasis: authenticated ? 'account_unverified' : 'public_displayed',
          seller: catalog.shippingText?.replace(/^Ships from\s*/i, '') ?? null,
          reason:
            offer.reason +
            '; displayed product price, account-specific terms unverified.' +
            (/Third-Party Seller/i.test(body) ? ' Third-party seller listing.' : ''),
        },
      ];
    }
    if (!(await signedInControl(page)))
      throw new SupplierError(
        'AUTH_REQUIRED',
        'Public catalog identity could not be validated. Connect the supplier and retry.',
      );
  }
  if (!alternatives)
    throw new SupplierError(
      'PRODUCT_IDENTITY_UNVERIFIED',
      'Main product details do not verify the requested manufacturer and identifier. Model guesses and recommendations are not accepted.',
    );
  const schema = z.object({ offers: z.array(offerSchema).max(5) });
  const extracted = await sh.extract(
    `Extract at most five fully visible product offers for this request: ${JSON.stringify(line)}. Do not infer anything. Use null for missing price, currency, unit, packSize, local branch, stockQuantity, pickupReady, shippingText, or condition. Manufacturer and manufacturer part number must come from the product details, not from search input or suggested query. Do not treat a supplier's company-wide stock as local branch stock. A search-result suggestion is not compatibility evidence.`,
    schema,
  );
  const observed = offerSchema.array().parse(extracted.data.offers);
  const verified: RawOffer[] = observed.filter(
    (o) => body.includes(o.partNumber) && body.toLowerCase().includes(o.manufacturer.toLowerCase()),
  );
  if (verified.length === 0)
    throw new SupplierError(
      'EXTRACTION_UNVERIFIED',
      'No product identity could be verified against visible page text.',
    );
  // Price extraction is checked against visible text. Unknown remains unknown, never zero.
  for (const o of verified) {
    if (o.price !== null && !body.replaceAll(',', '').includes(o.price.toFixed(2))) {
      o.price = null;
    }
    // Branch/origin matching is not yet verified by these pilot adapters; never advertise local pickup.
    o.pickupReady = null;
    o.stockQuantity = null;
  }
  const evidence = await saveEvidence(
    jobId,
    `${supplier}-${line.name}-${alternatives ? 'alt' : 'exact'}`,
  );
  const offers = verified
    .map((o) => assess(o, line, supplier, evidence, false, alternatives))
    .filter((o) => alternatives || o.match === 'exact');
  if (!offers.length)
    throw new SupplierError(
      'EXACT_ID_UNVERIFIED',
      'Visible products do not establish an exact manufacturer/part-number match; no no-match conclusion was made.',
      evidence,
    );
  const authenticated = await signedInControl(page);
  return offers.map((o) => ({
    ...o,
    access: authenticated ? ('authenticated' as const) : ('public_catalog' as const),
    priceBasis: 'account_unverified' as const,
  }));
}
