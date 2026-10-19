import type { Page } from '@browserbasehq/stagehand';
import { safeProductUrl } from './recovery-policy.js';
export type ProductLink = { href: string; text: string; context: string };
/** Bounded discovery: unfamiliar cards are data for recovery, never proof of identity. */
export async function collectProductLinks(
  page: Page,
  host: string,
  maxWaitMs = 6000,
): Promise<ProductLink[]> {
  const deadline = Date.now() + maxWaitMs;
  while (true) {
    const snapshot = await page.evaluate(() => {
      try {
        const links = Array.from(document.querySelectorAll('a[href]')).map((a) => {
          const row = a.closest('tr,[role="row"]') as HTMLElement | null;
          let context = row && row.innerText.length < 1800 ? row.innerText : '';
          let node = a.parentElement;
          for (let i = 0; i < 6 && node && !context; i++, node = node.parentElement) {
            const text = node.innerText ?? '';
            if (text.length >= 1800) break;
            const labels = text.match(/Mfg\s*#|Manufacturer\s*#/gi) ?? [];
            const products = Array.from(node.querySelectorAll('a[href]')).filter((e) =>
              /\/product-view|\/product\/|\/p\/|\/york\/yorks1-/i.test(
                (e as HTMLAnchorElement).href,
              ),
            );
            if (
              labels.length === 1 ||
              (products.length === 1 &&
                text.trim().length > (a.textContent ?? '').trim().length + 8)
            ) {
              context = text;
              break;
            }
          }
          return {
            href: (a as HTMLAnchorElement).href,
            text: (a.textContent ?? '').trim(),
            context,
          };
        });
        return {
          links,
          busy:
            !document.body ||
            Boolean(document.querySelector('[aria-busy="true"],[role="progressbar"]')),
          text: document.body?.innerText ?? '',
          failure: '',
        };
      } catch (error) {
        return {
          links: [],
          busy: false,
          text: '',
          failure: error instanceof Error ? error.message : String(error),
        };
      }
    });
    if (snapshot.failure) throw new Error('Product-link discovery failed: ' + snapshot.failure);
    const product = safeProductUrl(await page.url(), host);
    const available = snapshot.links.some((l) => safeProductUrl(l.href, host));
    const terminal =
      /no products matched|no results found|unable to find any results|there are no products matching|we could not find any matches|access denied|verify you are human|captcha/i.test(
        snapshot.text,
      );
    if (product || (!snapshot.busy && (available || terminal)) || Date.now() >= deadline)
      return snapshot.links;
    await new Promise((r) => setTimeout(r, 250));
  }
}
