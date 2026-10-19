// Live regression against the local API, using real cases from the run3
// workbook ("Test 2 - all Suppliers"). Each case records what a person found
// at Parts Town and Johnstone in early October 2026. The backend must find the
// same exact part where the person did, and must not claim an exact match
// where the person found none.
//
//   npm run regression:live -- --base http://127.0.0.1:4310 C D F
//
// Pass case ids to run a subset (each supplier check spends cloud budget).
import { writeFile, mkdir } from 'node:fs/promises';

// `changed` notes a listing that changed on the supplier site since October and
// was confirmed by hand; the verdict says so instead of counting a miss.
type Expect = { found: true; price: number; changed?: string } | { found: false };
type Case = {
  id: string;
  row: number;
  unit: string;
  name: string;
  manufacturer: string;
  partNumber: string;
  partstown: Expect;
  johnstone: Expect;
};
// Johnstone "ALT:" results are substitutes, not the requested number, so the
// exact-number expectation is "not found" there.
export const cases: Case[] = [
  {
    id: 'A',
    row: 7,
    unit: 'York E1RD036',
    name: 'defrost control board',
    manufacturer: 'York',
    partNumber: 'S1-33101975102',
    partstown: { found: true, price: 198.49 },
    johnstone: { found: true, price: 196.72 },
  },
  {
    id: 'B',
    row: 8,
    unit: 'York E1RD036',
    name: 'run capacitor',
    manufacturer: 'York',
    partNumber: 'S1-02420043700',
    partstown: { found: true, price: 16.89 },
    johnstone: { found: true, price: 10.75 },
  },
  {
    id: 'C',
    row: 11,
    unit: 'York D7CG048',
    name: 'condenser fan blade',
    manufacturer: 'York',
    partNumber: 'S1-02625511000',
    partstown: { found: true, price: 119.99 },
    johnstone: { found: true, price: 102.43 },
  },
  {
    id: 'D',
    row: 2,
    unit: 'Trane SCWFN8042',
    name: 'filter drier',
    manufacturer: 'Trane',
    partNumber: 'DHY01481',
    partstown: { found: true, price: 52.79 },
    johnstone: { found: false },
  },
  {
    id: 'E',
    row: 5,
    unit: 'Trane SCWFN8042',
    name: 'fuse',
    manufacturer: 'Trane',
    partNumber: 'FUS00907',
    partstown: { found: true, price: 51.79 },
    johnstone: { found: false },
  },
  {
    id: 'F',
    row: 3,
    unit: 'Trane SCWFN8042',
    name: 'relay',
    manufacturer: 'Trane',
    partNumber: 'RLY00681',
    partstown: { found: false },
    johnstone: { found: false },
  },
  {
    id: 'G',
    row: 16,
    unit: 'Lochinvar AWH0500',
    name: 'annual maintenance kit',
    manufacturer: 'Lochinvar',
    partNumber: '100345163',
    partstown: {
      found: true,
      price: 1012.43,
      changed: 'Parts Town showed TEMPORARILY UNAVAILABLE with no price on 2026-10-19',
    },
    johnstone: { found: false },
  },
  {
    id: 'H',
    row: 13,
    unit: 'AAON RN-025',
    name: 'modulating gas board',
    manufacturer: 'AAON',
    partNumber: 'ASM01668',
    partstown: { found: true, price: 1278.99 },
    johnstone: { found: false },
  },
  {
    id: 'I',
    row: 4,
    unit: 'Trane SCWFN8042',
    name: 'contactor',
    manufacturer: 'Trane',
    partNumber: 'SFCTR3P40A120VLA2L',
    partstown: { found: true, price: 31.25 },
    johnstone: { found: false },
  },
];

// Prices move; a person's October reading is a reference, not an exact target.
const priceTolerance = 0.25;
const suppliers = ['partstown', 'johnstone'] as const;

async function main() {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf('--base');
  const base = baseIndex >= 0 ? args[baseIndex + 1]! : 'http://127.0.0.1:4310';
  const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--base');
  const selected = ids.length ? cases.filter((c) => ids.includes(c.id)) : cases;
  if (!selected.length) throw new Error('No matching case ids');
  const started = Date.now();
  const created = await fetch(`${base}/api/searches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'live',
      stopAfter: 'comparison',
      origin: { address: '2100 Clarendon Blvd, Arlington, VA 22201' },
      suppliers,
      lines: selected.map((c) => ({
        name: c.name,
        manufacturer: c.manufacturer,
        partNumber: c.partNumber,
        quantity: 1,
      })),
    }),
  });
  if (!created.ok) throw new Error(`Create failed ${created.status}: ${await created.text()}`);
  let job = await created.json();
  console.log('job', job.id);
  while (['queued', 'running'].includes(job.state)) {
    await new Promise((r) => setTimeout(r, 5000));
    job = await (await fetch(`${base}/api/searches/${job.id}`)).json();
    process.stdout.write(`\r${job.state} · ${job.message}`.slice(0, 160).padEnd(160));
  }
  console.log();
  const rows = selected.flatMap((c, i) => {
    const result = job.results[i];
    const ranking = job.comparison?.lines[i]?.rankings;
    return suppliers.map((supplier) => {
      const expected = c[supplier];
      const offer = result?.offers.find((o: any) => o.supplier === supplier && o.match === 'exact');
      const attempt = result?.attempts?.find((a: any) => a.supplier === supplier);
      const price = offer?.commercial?.price.amount ?? offer?.price ?? null;
      const stores = (ranking?.stockedBranches ?? []).filter((b: any) => b.supplier === supplier);
      const errored = attempt?.status === 'error';
      const verdict = errored
        ? 'ERROR'
        : expected.found
          ? !offer
            ? 'MISS'
            : price === null
              ? expected.changed
                ? 'LISTING_CHANGED'
                : 'NO_PRICE'
              : Math.abs(price - expected.price) / expected.price <= priceTolerance
                ? 'PASS'
                : 'PRICE_DRIFT'
          : offer
            ? 'FALSE_MATCH'
            : 'PASS';
      return {
        case: c.id,
        row: c.row,
        part: `${c.manufacturer} ${c.partNumber}`,
        supplier,
        expected: expected.found ? `found $${expected.price}` : 'not found',
        actual: offer ? `found $${price ?? '?'}` : (attempt?.status ?? 'no attempt'),
        code: attempt?.code ?? '',
        shippingStock: offer?.commercial?.shipping.quantity ?? '',
        storesWithStock: stores.map((b: any) => `${b.name} (${b.stockQuantity})`).join('; '),
        addresses: stores.filter((b: any) => b.address).length,
        verdict,
      };
    });
  });
  const pass = rows.filter((r) => r.verdict === 'PASS').length;
  const changed = rows.filter((r) => r.verdict === 'LISTING_CHANGED').length;
  const report = {
    jobId: job.id,
    base,
    startedAt: new Date(started).toISOString(),
    elapsedMs: Date.now() - started,
    state: job.state,
    execution: job.execution,
    pass,
    listingChanged: changed,
    total: rows.length,
    rows,
  };
  await mkdir('reports', { recursive: true });
  const stamp = new Date(started).toISOString().replace(/[:.]/g, '-');
  await writeFile(`reports/regression-${stamp}.json`, JSON.stringify(report, null, 2) + '\n');
  console.table(
    rows.map(({ case: c, supplier, expected, actual, code, verdict }) => ({
      c,
      supplier,
      expected,
      actual,
      code,
      verdict,
    })),
  );
  console.log(
    `${pass}/${rows.length - changed} pass${changed ? ` (${changed} listing changed since October)` : ''} · ${Math.round(report.elapsedMs / 1000)} s · reports/regression-${stamp}.json`,
  );
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
