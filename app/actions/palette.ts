'use server';

import { unstable_rethrow } from 'next/navigation';
import { attempt, type ActionResult } from '@/lib/actions/result';
import { sessionDeps } from '@/lib/actions/server';
import type { Project } from '@/lib/db/projects';
import { runSearch, type SearchResults } from '@/lib/search/query';
import { nameKey } from '@/lib/search/normalize';
import { createSupabaseSearch } from '@/lib/search/supabase';
import { createClient } from '@/lib/supabase/server';

/** ⌘K: the usual search (items and people) plus projects by name. Read only; never logs the query. */
export async function paletteSearch(query: string): Promise<ActionResult<{ results: SearchResults; projects: Project[] }>> {
  return attempt(
    async () => {
      const { deps } = await sessionDeps();
      const q = String(query ?? '');
      const [results, projects] = await Promise.all([
        runSearch(createSupabaseSearch(await createClient()), q, { includeDeleted: false }),
        deps.projects!.listProjects(),
      ]);
      const key = nameKey(q);
      return { results, projects: key ? projects.filter((p) => nameKey(p.name).includes(key)).slice(0, 5) : [] };
    },
    'No se ha podido buscar. Revisa la conexión e inténtalo de nuevo.',
    unstable_rethrow,
  );
}
