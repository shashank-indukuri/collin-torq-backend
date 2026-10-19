import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/** Johnstone's public store list prints every store the account can shop. */
export const johnstoneDirectoryUrl = 'https://www.johnstonesupply.com/store406/contact-us';
const directoryPath = join(import.meta.dirname, '..', 'data', 'johnstone-stores.json');

const storeSchema = z.object({
  id: z.string().regex(/^\d+$/),
  name: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().nullable(),
});
export const directorySchema = z.object({
  sourceUrl: z.string().url(),
  observedAt: z.iso.datetime(),
  stores: z.array(storeSchema).min(1),
});
export type StoreDirectory = z.infer<typeof directorySchema>;

/**
 * Parses the rendered store list: "Name - #ID", street line(s), then
 * "City, ST ZIP" (one line or two), then Hours. Rows that do not end in a state and ZIP are skipped
 * rather than guessed.
 */
export function parseJohnstoneDirectory(text: string): StoreDirectory['stores'] {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const stores: StoreDirectory['stores'] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i]!.match(/^(.+?) - #(\d+)$/);
    if (!head) continue;
    const parts: string[] = [];
    let j = i + 1;
    for (; j < lines.length && j <= i + 5 && !/^Hours\b/i.test(lines[j]!); j++)
      parts.push(lines[j]!);
    // Rendered text prints "City, ST ZIP" on one line; the raw DOM splits it
    // into "City," and "ST  ZIP". Accept both, never a row without a ZIP.
    const tail = parts.findIndex((p) => /(?:^|, )[A-Z]{2} \d{5}(?:-\d{4})?$/.test(p));
    if (tail < 1) continue;
    const joined = /^[A-Z]{2} \d{5}/.test(parts[tail]!);
    if (joined && tail < 2) continue;
    const street = parts.slice(0, joined ? tail - 1 : tail).join(', ');
    const cityStateZip = joined
      ? `${parts[tail - 1]!.replace(/,$/, '')}, ${parts[tail]}`
      : parts[tail]!;
    const phone =
      lines.slice(j, j + 12).find((l) => /^\(?\d{3}\)?[-\s]?\d{3}[-\s]\d{4}$/.test(l)) ?? null;
    stores.push({
      id: head[2]!,
      name: head[1]!,
      address: `${street}, ${cityStateZip}`,
      phone,
    });
    i = j;
  }
  return [...new Map(stores.map((s) => [s.id, s])).values()];
}

let cached: StoreDirectory | null | undefined;
export function johnstoneDirectory(): StoreDirectory | null {
  if (cached !== undefined) return cached;
  try {
    cached = directorySchema.parse(JSON.parse(readFileSync(directoryPath, 'utf8')));
  } catch {
    cached = null;
  }
  return cached;
}
export const directoryFile = directoryPath;

/** A directory address is used only when BOTH the store number and name match. */
export function directoryAddress(id: string, name: string, directory = johnstoneDirectory()) {
  const store = directory?.stores.find((s) => s.id === id);
  if (!store) return null;
  const norm = (s: string) =>
    s
      .replace(/\s*-?\s*#\d+$/, '')
      .trim()
      .toLowerCase();
  return norm(store.name) === norm(name) ? store : null;
}
