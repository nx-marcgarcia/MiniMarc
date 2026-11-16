/**
 * The second brain's repos for a capture (stores, links, tags) and the link-preview fetcher, built the
 * same way for both real wirings (POST /api/capture with a token, and the web session). One place, so
 * a new repo cannot be wired in one and forgotten in the other. Server only.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseCaptureLogRepo } from '@/lib/db/captureLog';
import { createSupabaseLinksRepo } from '@/lib/db/links';
import { createSupabaseStoresRepo } from '@/lib/db/stores';
import { createSupabaseTagsRepo } from '@/lib/db/tags';
import { serverPreviewFetcher } from '@/lib/links/server';
import type { CaptureDeps } from './pipeline';

export function brainDeps(client: SupabaseClient, opts: { userId?: string } = {}): Pick<CaptureDeps, 'stores' | 'links' | 'tags' | 'preview' | 'log'> {
  return {
    stores: createSupabaseStoresRepo(client, opts),
    links: createSupabaseLinksRepo(client, opts),
    tags: createSupabaseTagsRepo(client, opts),
    preview: serverPreviewFetcher,
    log: createSupabaseCaptureLogRepo(client, opts),
  };
}
