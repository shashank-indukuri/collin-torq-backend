import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loginSchema, type credentialSuppliers } from './auth.js';
import type { z } from 'zod';

type Supplier = (typeof credentialSuppliers)[number];
type Credentials = z.infer<typeof loginSchema>;
type CredentialFile = Partial<Record<Supplier, Partial<Credentials>>>;

const defaultPath = resolve('.local/supplier-credentials.json');

/**
 * Read per-machine supplier credentials. The file lives under the git-ignored
 * .local directory and must be private to the current OS user.
 */
export async function supplierCredentials(
  supplier: Supplier,
  path = defaultPath,
): Promise<Credentials | null> {
  try {
    const info = await stat(path);
    if ((info.mode & 0o077) !== 0) return null;
    const parsed = JSON.parse(await readFile(path, 'utf8')) as CredentialFile;
    const value = parsed[supplier];
    if (!value) return null;
    return loginSchema.parse(value);
  } catch {
    // Missing, unreadable, or malformed local secrets fail closed. Never log
    // parser input or filesystem errors, which could contain sensitive data.
    return null;
  }
}
