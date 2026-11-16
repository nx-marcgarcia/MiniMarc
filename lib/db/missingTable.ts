/**
 * Tolerance for a migration that is not applied yet: reading a table that does not exist must not
 * take a whole page down (the list is just empty). Only that exact error is swallowed; permission,
 * network or column errors still surface. Writes are never tolerated.
 */
export function isMissingTable(e: unknown): boolean {
  const m = e instanceof Error ? e.message : '';
  return /could not find the table|relation ".*" does not exist/i.test(m);
}

export async function emptyIfTableMissing<T>(read: Promise<T[]>): Promise<T[]> {
  try {
    return await read;
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}
