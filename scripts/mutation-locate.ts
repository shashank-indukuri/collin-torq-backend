// Mutation targets are written compactly; source is Prettier-formatted. Match
// the target with optional whitespace between every character so formatting
// never hides a mutation site. Prettier's trailing commas before a closing
// bracket are allowed too. Callers fail loudly when the target is absent.
export function mutateSource(source: string, from: string, to: string): string | null {
  const pattern = new RegExp(
    from
      .replace(/\s+/g, '')
      .split('')
      .map((c) => (/[)\]}]/.test(c) ? ',?\\s*' : '') + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*'),
  );
  const match = source.match(pattern);
  return match ? source.replace(match[0], to) : null;
}
