import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBackend, type DbBackend, type Row } from './backend';

/** What Marc changed on an item the capture made: its type, person, store… (the prompt's best teacher). */
export interface Correction {
  itemId: string;
  field: string;
  from: unknown;
  to: unknown;
  /** ISO instant. */
  at: string;
}

export interface CaptureLogEntry {
  id: string;
  rawInput: string;
  source: string | null;
  /** What the model returned (the classifications), null when the AI did not answer. */
  modelOutput: unknown;
  error: string | null;
  itemIds: string[];
  corrections: Correction[];
  createdAt: string;
}

export type NewLogEntry = {
  rawInput: string;
  source: string | null;
  modelOutput: unknown;
  error?: string | null;
  itemIds: string[];
};

export interface CaptureLogRepo {
  /** The id of the new entry, or null if it could not be saved: the log never stops a capture. */
  record(entry: NewLogEntry): Promise<string | null>;
  /** Throws when the capture is not in the log. */
  addCorrection(id: string, correction: Omit<Correction, 'at'>, now?: Date): Promise<void>;
  /** Newest first. */
  list(): Promise<CaptureLogEntry[]>;
}

export function rowToLogEntry(row: Row): CaptureLogEntry {
  return {
    id: String(row.id),
    rawInput: String(row.raw_input),
    source: (row.source as string | null) ?? null,
    modelOutput: row.model_output ?? null,
    error: (row.error as string | null) ?? null,
    itemIds: Array.isArray(row.item_ids) ? (row.item_ids as string[]) : [],
    corrections: Array.isArray(row.corrections) ? (row.corrections as Correction[]) : [],
    createdAt: String(row.created_at),
  };
}

export function createCaptureLogRepo(backend: DbBackend): CaptureLogRepo {
  return {
    async record(entry) {
      try {
        const row = await backend.insert('capture_log', {
          raw_input: entry.rawInput,
          source: entry.source,
          model_output: entry.modelOutput ?? null,
          error: entry.error ?? null,
          item_ids: entry.itemIds,
          corrections: [],
        });
        return String(row.id);
      } catch {
        return null;
      }
    },

    async addCorrection(id, correction, now = new Date()) {
      const [row] = await backend.select('capture_log', { eq: { id } });
      if (!row) throw new Error('La captura no está en el registro');
      const corrections = [...rowToLogEntry(row).corrections, { ...correction, at: now.toISOString() }];
      await backend.update('capture_log', id, { corrections });
    },

    async list() {
      const rows = await backend.select('capture_log');
      return rows.map(rowToLogEntry).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },
  };
}

export function createSupabaseCaptureLogRepo(client: SupabaseClient, opts: { userId?: string } = {}): CaptureLogRepo {
  return createCaptureLogRepo(createSupabaseBackend(client, opts));
}
