/**
 * Migración a la fase 1 (el modelo del segundo cerebro), en dos pasos y con una copia de seguridad.
 *
 *   1. Exporta tus datos: Ajustes → Tus datos → JSON, y guarda el archivo en backups/ (ignorada por git).
 *   2. DRY-RUN (no toca la base de datos; solo habla con Gemini, y nunca con nada de Trabajo):
 *        npx tsx scripts/migrate-v2.ts --input backups/agente-personal-2026-11-16.json
 *      Escribe backups/migration-plan.json y enseña qué cambiaría. Repetirlo no gasta llamadas:
 *      las respuestas de la IA se guardan en backups/migration-ai-cache.json. Opciones:
 *        --clean-notes   reescribe las notas de cada persona sin las ideas de regalo que se sacan
 *      Las ideas que estaban en «hecho» salen listadas: para decidir una a una, crea
 *      backups/migration-decisions.json con {"<id de la idea>": "descartada"} y repite el dry-run.
 *   3. Lee el plan. Cuando estés conforme, y con la migración 0011 ya aplicada:
 *        npx tsx scripts/migrate-v2.ts --apply --yes
 *      Aplica backups/migration-plan.json. Se puede repetir sin duplicar nada. Se niega a seguir si
 *      no hay en backups/ una exportación de menos de 24 horas. Nunca borra items: lo que separa, lo archiva.
 *
 * (si la CLI de tsx no puede abrir su canal IPC: node --import tsx scripts/migrate-v2.ts …)
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { z } from 'zod';

const ROOT = path.resolve(__dirname, '..');
loadEnvConfig(ROOT);

const DIR = path.join(ROOT, 'backups');
const PLAN = path.join(DIR, 'migration-plan.json');
const CACHE = path.join(DIR, 'migration-ai-cache.json');
const DECISIONS = path.join(DIR, 'migration-decisions.json');
const DAY_MS = 24 * 60 * 60 * 1000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? '') : undefined;
}
const flag = (name: string) => process.argv.includes(name);

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

async function dryRun() {
  const input = arg('--input');
  if (!input) {
    console.error('Falta --input: npx tsx scripts/migrate-v2.ts --input backups/<tu exportación>.json');
    process.exit(1);
  }
  const file = path.resolve(input);
  if (!file.startsWith(DIR + path.sep)) {
    console.error('La exportación tiene que estar dentro de backups/ (la carpeta que git ignora).');
    process.exit(1);
  }

  // Imported after loadEnvConfig so the provider reads the key it just loaded.
  const { createGeminiProvider } = await import('../lib/ai/gemini');
  const { cachedAi, createMigrationAi } = await import('../lib/migrate/ai');
  const { buildPlan, renderReport } = await import('../lib/migrate/plan');

  const cache = new Map<string, unknown>(existsSync(CACHE) ? Object.entries(readJson(CACHE) as Record<string, unknown>) : []);
  const ai = cachedAi(createMigrationAi(createGeminiProvider({ dailyCap: 1000 })), cache, () =>
    writeFileSync(CACHE, JSON.stringify(Object.fromEntries(cache), null, 2)),
  );
  const ideasDone = existsSync(DECISIONS) ? z.record(z.string(), z.string()).parse(readJson(DECISIONS)) : undefined;

  console.log('Preparando el plan (lo de Trabajo no se envía a la IA)…');
  const plan = await buildPlan(readJson(file), ai, { cleanNotes: flag('--clean-notes'), ideasDone });
  writeFileSync(PLAN, JSON.stringify(plan, null, 2));
  console.log(renderReport(plan));
  console.log(`Plan guardado en ${path.relative(ROOT, PLAN)}. No se ha tocado la base de datos.`);
  console.log('Para aplicarlo: npx tsx scripts/migrate-v2.ts --apply --yes');
}

/** A JSON export from the app made in the last 24 h: the safety net that apply insists on. */
function recentBackup(): string | null {
  if (!existsSync(DIR)) return null;
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json') && !n.startsWith('migration-'))) {
    const full = path.join(DIR, f);
    if (Date.now() - statSync(full).mtimeMs > DAY_MS) continue;
    try {
      if (typeof (readJson(full) as { exportedAt?: unknown }).exportedAt === 'string') return f;
    } catch {
      // not an export
    }
  }
  return null;
}

async function apply() {
  if (!flag('--yes')) {
    console.error('Esto escribe en la base de datos. Revisa el plan y repite con --yes.');
    process.exit(1);
  }
  if (!existsSync(PLAN)) {
    console.error('No hay plan. Haz primero el dry-run (ver la cabecera de este archivo).');
    process.exit(1);
  }
  const backup = recentBackup();
  if (!backup) {
    console.error('No hay en backups/ ninguna exportación JSON de las últimas 24 horas. Descárgala en Ajustes → Tus datos y repite.');
    process.exit(1);
  }
  const plan = z
    .looseObject({ version: z.literal(1), ops: z.array(z.looseObject({ op: z.string() })) })
    .parse(readJson(PLAN)) as unknown as import('../lib/migrate/plan').Plan;

  const { createSupabaseBackend } = await import('../lib/db/backend');
  const { createSupabaseItemsRepo } = await import('../lib/db/items');
  const { createSupabaseLinksRepo } = await import('../lib/db/links');
  const { createSupabasePeopleRepo } = await import('../lib/db/people');
  const { createSupabaseStoresRepo } = await import('../lib/db/stores');
  const { applyPlan } = await import('../lib/migrate/apply');
  const { createAdminClient } = await import('../lib/supabase/admin');

  const admin = createAdminClient();
  const email = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`No se puede leer el usuario: ${error.message}`);
  const user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) throw new Error('No encuentro tu usuario (ALLOWED_EMAIL).');

  const scope = { userId: user.id };
  const result = await applyPlan(plan, {
    backend: createSupabaseBackend(admin, scope),
    items: createSupabaseItemsRepo(admin, scope),
    people: createSupabasePeopleRepo(admin, scope),
    stores: createSupabaseStoresRepo(admin, scope),
    links: createSupabaseLinksRepo(admin, scope),
  });
  console.log(`Copia de seguridad encontrada: ${backup}`);
  console.log(`Estados antiguos traducidos: ${result.normalized}`);
  console.log(`Operaciones aplicadas: ${result.applied} de ${plan.ops.length}`);
  if (result.failed.length) {
    console.log(`\n${result.failed.length} no se han podido aplicar (el resto sí). Se pueden repetir:`);
    for (const f of result.failed) console.log(`  · ${f.op.op}: ${f.error}`);
    process.exitCode = 1;
  }
}

(flag('--apply') ? apply() : dryRun()).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
