import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parseShippingArrival } from './arrival.js';
export function actionStateKey(
  url: string,
  action: { selector: string; method?: string; arguments?: string[] },
  body: string,
) {
  return JSON.stringify([
    url,
    action.selector,
    action.method,
    action.method === 'click' ? null : action.arguments,
    createHash('sha256').update(body).digest('hex'),
  ]);
}

const source = {
  quote: z
    .string()
    .min(1)
    .max(500)
    .describe(
      'Contiguous literal page text supporting the value. Branch facts MUST include the branch name and its ID (when supplied) in this SAME quote, as well as the value. Never quote a bare stock number.',
    ),
  branchId: z.string().nullable(),
  branchName: z.string().nullable(),
};
const numeric = z.string().regex(/^\d+(?:\.\d+)?$/);
export const factSchema = z.discriminatedUnion('field', [
  z.object({
    ...source,
    field: z.enum([
      'manufacturer',
      'partNumber',
      'description',
      'supplierSku',
      'arrivalDate',
      'destinationZip',
      'branchAddress',
      'noMatch',
    ]),
    value: z.string().max(500),
  }),
  z.object({
    ...source,
    field: z.enum(['price', 'packSize', 'shippingQuantity', 'branchStock']),
    value: numeric,
  }),
  z.object({ ...source, field: z.literal('currency'), value: z.literal('USD') }),
  z.object({ ...source, field: z.literal('unit'), value: z.enum(['each', 'pack']) }),
  z.object({ ...source, field: z.literal('condition'), value: z.enum(['new', 'refurbished']) }),
  z.object({ ...source, field: z.literal('pickupReady'), value: z.enum(['true', 'false']) }),
]);
export type AgentFact = z.infer<typeof factSchema>;
export const inspectionSchema = z.object({
  pageType: z.enum([
    'home',
    'search',
    'product',
    'availability',
    'no_match',
    'login',
    'challenge',
    'unknown',
  ]),
  facts: z.array(factSchema).max(45),
  nextAction: z.string().max(700),
  finished: z.boolean(),
  reason: z.string().max(700),
});
export const planSchema = z.object({
  pageType: z.enum([
    'home',
    'search',
    'product',
    'availability',
    'no_match',
    'login',
    'challenge',
    'unknown',
  ]),
  nextAction: z.string().max(200),
  finished: z.boolean(),
  reason: z.string().max(200),
});
export const factsSchema = z.object({ facts: z.array(factSchema).max(24) });
export const normalizedText = (value: string) =>
  value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
export function queryNoMatchGrounded(
  requested: string,
  url: string,
  facts: AgentFact[],
  body: string,
) {
  const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const query = normalize(requested);
  if (!query) return false;
  let urlBound = false;
  try {
    urlBound = Array.from(new URL(url).searchParams.values()).some(
      (value) => normalize(value) === query,
    );
  } catch {
    return false;
  }
  return facts.some(
    (f) =>
      f.field === 'noMatch' &&
      groundedFact(f, body) &&
      (urlBound ||
        (f.quote.match(/\b[a-z0-9]+(?:-[a-z0-9]+)*\b/gi) ?? []).some(
          (token) => normalize(token) === query,
        )),
  );
}
export function groundedFact(fact: AgentFact, body: string, observedAt = new Date().toISOString()) {
  const quote = normalizedText(fact.quote),
    text = normalizedText(body),
    value = normalizedText(fact.value);
  if (!quote || !text.includes(quote) || !value) return false;
  if (['branchStock', 'branchAddress', 'pickupReady'].includes(fact.field)) {
    // A bare number may occur anywhere on a product page. A branch fact must
    // carry its location identity in the same literal quote as its value.
    if (!fact.branchName || !quote.includes(normalizedText(fact.branchName))) return false;
    if (
      fact.branchId &&
      !new RegExp(
        `(?:^|[^a-z0-9])${fact.branchId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`,
        'i',
      ).test(quote)
    )
      return false;
  }
  if (['price', 'shippingQuantity', 'branchStock', 'packSize'].includes(fact.field)) {
    const n = Number(fact.value);
    if (!Number.isFinite(n) || n < 0) return false;
    const num = String(n).replace('.', '\\.');
    // A number that starts a range ("1-2 Days") or a duration is not a quantity.
    const bare = `(?:^|[^0-9.])${num}(?=$|[^0-9.])(?!\\s*(?:-|–|to)\\s*\\d)(?!\\s*(?:business\\s+)?(?:days?|hours?|weeks?)\\b)`;
    const plain = quote.replaceAll(',', '');
    if (!new RegExp(bare).test(plain)) return false;
    // Shipping stock must sit next to a stock label, not anywhere in the quote.
    if (fact.field === 'shippingQuantity')
      return new RegExp(
        `(?:(?:quantity|qty) available|in stock|available|stock)\\s*:?\\s*${num}(?![0-9.])|${num}\\s+(?:in stock|available)\\b`,
      ).test(plain);
    return true;
  }
  // "New quantity: 1" is not a condition. Require a condition label or phrase.
  if (fact.field === 'condition')
    return fact.value === 'new'
      ? /condition\s*:?\s*new\b|\bnew condition\b|\bbrand[- ]new\b|\bfactory[- ]new\b/.test(quote)
      : /condition\s*:?\s*(?:refurbished|reconditioned)\b|\brefurbished\b/.test(quote);
  if (fact.field === 'pickupReady')
    return fact.value === 'true'
      ? /ready for pickup now|available for pickup today|ready today|in stock today/i.test(quote)
      : fact.value === 'false' &&
          /not available|available in|available for pickup (?:mon|tue|wed|thu|fri|sat|sun)|out of stock/i.test(
            quote,
          );
  if (fact.field === 'noMatch')
    return /no results|no products|unable to find|no matches|(?:couldn.t|could not|can.t|cannot) find|nothing (?:was )?found|0 results/i.test(
      quote,
    );
  // A date is usually written in words on the page. Code, never the model,
  // converts the quoted phrase; the model's ISO value must equal that result.
  if (fact.field === 'arrivalDate')
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      (quote.includes(value) || parseShippingArrival(fact.quote, observedAt) === value)
    );
  return quote.includes(value);
}
export type DynamicControl = {
  tag: string;
  type: string;
  text: string;
  href: string;
  form: string;
  searchValue?: string;
};
export function permittedAction(
  action: { method?: string; arguments?: string[]; description?: string },
  control: DynamicControl,
  allowedHost: string,
  allowedValues: string[],
) {
  const label = [control.text, control.href, action.description].join(' ');
  if (
    /add\s*(?:to)?\s*(?:cart|basket|list)|checkout|captcha|datadome|verif(?:y|ication)|human|robot|audio challenge|slide right|press (?:and|&) hold|place order|buy now|purchase now|payment|credit card|delete|logout|log out|sign out|unsubscribe/i.test(
      label,
    )
  )
    return false;
  if (
    !action.method ||
    ![
      'click',
      'fill',
      'type',
      'press',
      'selectOptionFromDropdown',
      'scrollTo',
      'nextChunk',
      'prevChunk',
    ].includes(action.method)
  )
    return false;
  if (control.href) {
    try {
      const u = new URL(control.href);
      if (
        (u.protocol !== 'https:' && !(u.protocol === 'http:' && allowedHost === '127.0.0.1')) ||
        u.hostname !== allowedHost ||
        u.username ||
        u.password ||
        /\/(?:cart|checkout|account|order)(?:\/|$)/i.test(u.pathname)
      )
        return false;
    } catch {
      return false;
    }
  }
  if (['password', 'email', 'file', 'hidden'].includes(control.type)) return false;
  if (
    ['fill', 'type', 'selectOptionFromDropdown'].includes(action.method) &&
    ((action.arguments ?? []).length !== 1 ||
      !(action.arguments ?? []).every((value) => allowedValues.includes(value)))
  )
    return false;
  if (
    action.method === 'press' &&
    !(action.arguments ?? []).every((v) => ['Enter', 'Tab', 'Escape'].includes(v))
  )
    return false;
  if (
    action.method === 'click' &&
    control.type === 'submit' &&
    !/search|zip|postal|location|availability|branch|store|quantity|pickup|delivery/i.test(
      control.form + ' ' + control.text,
    )
  )
    return false;
  return true;
}

/** Rendered-text signals of a bot or human-verification page. */
export function challengeShown(body: string) {
  return /verification required|verify (?:that )?you are (?:a )?human|are you a robot|slide right to secure|press (?:and|&) hold|unusual (?:activity|traffic)|captcha|datadome|access denied/i.test(
    body,
  );
}
