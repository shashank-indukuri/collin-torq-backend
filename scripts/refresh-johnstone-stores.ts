// Refreshes data/johnstone-stores.json from Johnstone's public store list.
// Read-only: loads one public page in the backend's Chrome profile.
import { writeFile } from 'node:fs/promises';
import { closeBrowser, exclusive, getBrowser } from '../src/browser.js';
import {
  directoryFile,
  directorySchema,
  johnstoneDirectoryUrl,
  parseJohnstoneDirectory,
} from '../src/johnstone-stores.js';

try {
  const directory = await exclusive(async () => {
    const sh = await getBrowser();
    const page = await sh.browser.context.newPage();
    await page.goto(johnstoneDirectoryUrl);
    let stores: ReturnType<typeof parseJohnstoneDirectory> = [];
    for (let i = 0; i < 30 && stores.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 500));
      stores = parseJohnstoneDirectory(
        await page.evaluate(() => document.body?.innerText ?? '').catch(() => ''),
      );
    }
    await page.close();
    return directorySchema.parse({
      sourceUrl: johnstoneDirectoryUrl,
      observedAt: new Date().toISOString(),
      stores,
    });
  });
  await writeFile(directoryFile, JSON.stringify(directory, null, 2) + '\n');
  console.log(`Saved ${directory.stores.length} Johnstone stores to ${directoryFile}`);
} finally {
  await closeBrowser();
}
