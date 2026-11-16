import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { nameKey } from '@/lib/search/normalize';
import { createSupabaseBackend, type DbBackend, type Row } from './backend';
import { emptyIfTableMissing, isMissingTable } from './missingTable';
import type { Area } from './types';

export const PROJECT_STATUSES = ['activo', 'en_pausa', 'terminado'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  activo: 'Activo',
  en_pausa: 'En pausa',
  terminado: 'Terminado',
};

export interface Project {
  id: string;
  name: string;
  area: Area | null;
  status: ProjectStatus;
  notes: string | null;
  /** "YYYY-MM-DD". */
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProjectInput = { name: string; area?: Area | null; notes?: string | null; dueDate?: string | null };
export type ProjectPatch = Partial<Pick<Project, 'name' | 'area' | 'status' | 'notes' | 'dueDate'>>;

export interface ProjectsRepo {
  /** Activos, en pausa y terminados, en ese orden; cada grupo por nombre. Vacío sin la migración 0014. */
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  /** Lanza con un nombre vacío. */
  createProject(input: ProjectInput): Promise<Project>;
  /** Lanza con un estado o un área desconocidos, o un nombre vacío. */
  updateProject(id: string, patch: ProjectPatch): Promise<Project>;
  /**
   * El proyecto que nombra un `>atajo`: el de ese nombre exacto (sin acentos ni mayúsculas) o, si
   * no lo hay, el único no terminado cuyo nombre empieza así. Nunca adivina entre varios.
   */
  findByName(name: string): Promise<Project | null>;
  /** False solo cuando la tabla aún no existe (migración 0014 sin aplicar). */
  available(): Promise<boolean>;
}

const statusSchema = z.enum(PROJECT_STATUSES);
const areaSchema = z.enum(['personal', 'trabajo']).nullable();

const cleanName = (name: string) => {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('El nombre no puede estar vacío');
  return clean;
};

export function rowToProject(row: Row): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    area: row.area === 'trabajo' || row.area === 'personal' ? row.area : null,
    status: statusSchema.catch('activo').parse(row.status),
    notes: (row.notes as string | null) ?? null,
    dueDate: (row.due_date as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? row.created_at ?? ''),
  };
}

const RANK: Record<ProjectStatus, number> = { activo: 0, en_pausa: 1, terminado: 2 };
const byStatusThenName = (a: Project, b: Project) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name, 'es');

function patchToRow(patch: ProjectPatch): Row {
  const row: Row = {};
  if (patch.name !== undefined) row.name = cleanName(patch.name);
  if (patch.area !== undefined) row.area = areaSchema.parse(patch.area);
  if (patch.status !== undefined) row.status = statusSchema.parse(patch.status);
  if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate || null;
  return row;
}

export function createProjectsRepo(backend: DbBackend): ProjectsRepo {
  const all = async () => (await emptyIfTableMissing(backend.select('projects'))).map(rowToProject);
  return {
    async listProjects() {
      return (await all()).sort(byStatusThenName);
    },

    async getProject(id) {
      const [row] = await emptyIfTableMissing(backend.select('projects', { eq: { id } }));
      return row ? rowToProject(row) : null;
    },

    async createProject(input) {
      const row = patchToRow({ name: input.name, area: input.area ?? null, notes: input.notes ?? null, dueDate: input.dueDate ?? null });
      return rowToProject(await backend.insert('projects', { ...row, status: 'activo' }));
    },

    async updateProject(id, patch) {
      return rowToProject(await backend.update('projects', id, patchToRow(patch)));
    },

    async findByName(name) {
      const key = nameKey(name);
      if (!key) return null;
      const projects = await all();
      const exact = projects.find((p) => nameKey(p.name) === key);
      if (exact) return exact;
      const prefixed = projects.filter((p) => p.status !== 'terminado' && nameKey(p.name).startsWith(key));
      return prefixed.length === 1 ? prefixed[0] : null;
    },

    async available() {
      try {
        await backend.select('projects', { eq: { id: '00000000-0000-0000-0000-000000000000' } });
        return true;
      } catch (e) {
        if (isMissingTable(e)) return false;
        throw e;
      }
    },
  };
}

export function createSupabaseProjectsRepo(client: SupabaseClient, opts: { userId?: string } = {}): ProjectsRepo {
  return createProjectsRepo(createSupabaseBackend(client, opts));
}
