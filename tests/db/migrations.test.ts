/**
 * Static guards on the SQL migrations (no Postgres in CI/sandbox). They pin the single-user
 * rule (I-1) and the service-role-only google_credentials (M-1); the SQL itself is run by Marc.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = (name: string) =>
  readFileSync(path.join(__dirname, '../../supabase/migrations', name), 'utf8').replace(/--.*$/gm, '');

describe('0002_single_user.sql', () => {
  const s = sql('0002_single_user.sql');

  it('rechaza en auth.users cualquier alta que no sea el correo permitido', () => {
    expect(s).toMatch(/create trigger single_user_only\s+before insert or update of email on auth\.users/);
    expect(s).toMatch(/if not private\.is_allowed_email\(new\.email\) then\s+raise exception/);
  });

  it('falla cerrado si no hay correo configurado', () => {
    expect(s).toMatch(/coalesce\([\s\S]*?,\s*false\s*\)/);
  });

  it.each(['people', 'items', 'api_tokens', 'settings', 'push_subscriptions'])(
    'la política de %s exige propietario y usuario permitido, en using y with check',
    (table) => {
      const policy = new RegExp(
        `create policy ${table}_owner on public\\.${table}[^;]*using \\(user_id = \\(select auth\\.uid\\(\\)\\) and \\(select private\\.is_allowed_user\\(\\)\\)\\)\\s+with check \\(user_id = \\(select auth\\.uid\\(\\)\\) and \\(select private\\.is_allowed_user\\(\\)\\)\\);`,
      );
      expect(s).toMatch(new RegExp(`drop policy if exists ${table}_owner on public\\.${table};`));
      expect(s).toMatch(policy);
    },
  );

  it('google_credentials: sin política ni permisos para anon/authenticated', () => {
    expect(s).toMatch(/drop policy if exists google_credentials_owner on public\.google_credentials;/);
    expect(s).toMatch(/revoke all on public\.google_credentials from anon, authenticated;/);
    expect(s).not.toMatch(/create policy google_credentials/);
  });

  it('la configuración vive en un esquema sin acceso para el navegador', () => {
    expect(s).toMatch(/revoke all on private\.app_config from public, anon, authenticated;/);
    expect(s).not.toMatch(/grant [^;]* on private\.app_config/);
  });
});

describe('0003_source_text.sql', () => {
  const s = sql('0003_source_text.sql');

  it('añade items.source_text como texto opcional', () => {
    expect(s).toMatch(/alter table public\.items\s+add column if not exists source_text text;/);
    expect(s).not.toMatch(/source_text text not null/);
  });

  it('indexa la búsqueda de duplicados: usuario y fecha, solo capturas no eliminadas', () => {
    expect(s).toMatch(
      /create index if not exists items_recent_captures_idx\s+on public\.items \(user_id, created_at desc\)\s+where deleted_at is null and source_text is not null;/,
    );
  });
});

describe('0004_cron.sql', () => {
  const raw = readFileSync(path.join(__dirname, '../../supabase/migrations/0004_cron.sql'), 'utf8');
  const s = sql('0004_cron.sql');

  it('añade el titular cacheado a settings', () => {
    expect(s).toMatch(/add column if not exists last_digest_headline text/);
    expect(s).toMatch(/add column if not exists last_digest_headline_date date/);
  });

  it('activa pg_cron y pg_net y programa un trabajo cada hora en el minuto 0', () => {
    expect(s).toMatch(/create extension if not exists pg_cron/);
    expect(s).toMatch(/create extension if not exists pg_net/);
    expect(s).toMatch(/cron\.schedule\(\s*'agente-resumen-manana',\s*'0 \* \* \* \*'/);
    expect(s).toMatch(/net\.http_post\(/);
    expect(s).toMatch(/'\/api\/cron\/morning'/);
  });

  it('es idempotente: desprograma el trabajo antes de programarlo', () => {
    expect(s.indexOf("cron.unschedule('agente-resumen-manana')")).toBeGreaterThan(-1);
    expect(s.indexOf("cron.unschedule('agente-resumen-manana')")).toBeLessThan(s.indexOf('cron.schedule('));
  });

  it('lee la URL y el secreto de Vault; ningún secreto en el SQL', () => {
    expect(s).toMatch(/from vault\.decrypted_secrets where name = 'app_url'/);
    expect(s).toMatch(/from vault\.decrypted_secrets where name = 'cron_secret'/);
    expect(s).toMatch(/'Authorization', 'Bearer ' \|\|/);
    expect(raw).not.toMatch(/[0-9a-f]{32,}/i);
    expect(s).not.toMatch(/vault\.create_secret/);
  });
});

describe('0005_photos.sql', () => {
  const s = sql('0005_photos.sql');

  it('crea el bucket privado photos con límite de tamaño y tipos de imagen, idempotente', () => {
    expect(s).toMatch(/insert into storage\.buckets[^;]*values \('photos', 'photos', false, 8388608,/);
    expect(s).toMatch(/'image\/jpeg', 'image\/png', 'image\/webp', 'image\/heic'/);
    expect(s).toMatch(/on conflict \(id\) do update set\s+public = false/);
  });

  it.each(['select', 'insert', 'update', 'delete'])(
    'storage.objects (%s): solo la carpeta {auth.uid()} y el usuario permitido',
    (op) => {
      expect(s).toMatch(new RegExp(`drop policy if exists photos_owner_${op} on storage\\.objects;`));
      const policy = new RegExp(`create policy photos_owner_${op} on storage\\.objects\\s+for ${op} to authenticated[^;]*;`);
      const body = s.match(policy)?.[0] ?? '';
      expect(body).toMatch(/bucket_id = 'photos'/);
      expect(body).toMatch(/\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
      expect(body).toMatch(/\(select private\.is_allowed_user\(\)\)/);
    },
  );

  it('item_photos: cascada desde items, user_id por defecto auth.uid() y RLS como en 0002', () => {
    expect(s).toMatch(/create table if not exists public\.item_photos/);
    expect(s).toMatch(/item_id\s+uuid not null references public\.items\(id\) on delete cascade/);
    expect(s).toMatch(/user_id\s+uuid not null default auth\.uid\(\)/);
    expect(s).toMatch(/path\s+text not null/);
    expect(s).toMatch(/alter table public\.item_photos enable row level security;/);
    expect(s).toMatch(/drop policy if exists item_photos_owner on public\.item_photos;/);
    expect(s).toMatch(
      /create policy item_photos_owner on public\.item_photos[^;]*using \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\)\s+with check \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\);/,
    );
  });

  it('el bucket no es público', () => {
    expect(s).not.toMatch(/'photos', 'photos', true/);
  });
});

describe('0006_person_dates.sql', () => {
  const s = sql('0006_person_dates.sql');

  it('person_dates: cascada desde people, columnas y valores por defecto', () => {
    expect(s).toMatch(/create table if not exists public\.person_dates/);
    expect(s).toMatch(/person_id\s+uuid not null references public\.people\(id\) on delete cascade/);
    expect(s).toMatch(/user_id\s+uuid not null default auth\.uid\(\)/);
    expect(s).toMatch(/label\s+text not null/);
    expect(s).toMatch(/date\s+date not null/);
    expect(s).toMatch(/yearly\s+boolean not null default true/);
    expect(s).toMatch(/notes\s+text,/);
    expect(s).toMatch(/created_at\s+timestamptz not null default now\(\)/);
  });

  it('RLS como en 0002 (propietario y usuario permitido), idempotente', () => {
    expect(s).toMatch(/alter table public\.person_dates enable row level security;/);
    expect(s).toMatch(/drop policy if exists person_dates_owner on public\.person_dates;/);
    expect(s).toMatch(
      /create policy person_dates_owner on public\.person_dates[^;]*using \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\)\s+with check \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\);/,
    );
    expect(s).not.toMatch(/create (table|index) (?!if not exists)/);
  });
});

describe('0007_weekly.sql', () => {
  const s = sql('0007_weekly.sql');

  it('añade a settings el resumen semanal (lunes por defecto), la última semana y la frase cacheada', () => {
    expect(s).toMatch(/add column if not exists weekly_digest text not null default 'lunes'/);
    expect(s).toMatch(/add column if not exists last_weekly_date date/);
    expect(s).toMatch(/add column if not exists last_week_headline text/);
    expect(s).toMatch(/add column if not exists last_week_headline_week date/);
  });

  it('solo admite lunes, domingo u off, sin fallar al repetirse', () => {
    expect(s).toMatch(/if not exists \(select 1 from pg_constraint where conname = 'settings_weekly_digest_check'\)/);
    expect(s).toMatch(/check \(weekly_digest in \('lunes', 'domingo', 'off'\)\)/);
  });

  it('RLS de settings como en 0002: propietario y usuario permitido', () => {
    expect(s).toMatch(/alter table public\.settings enable row level security;/);
    expect(s).toMatch(/drop policy if exists settings_owner on public\.settings;/);
    expect(s).toMatch(
      /create policy settings_owner on public\.settings\s+for all to authenticated\s+using \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\)\s+with check \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\);/,
    );
  });
});

describe('0009_link_preview.sql', () => {
  const s = sql('0009_link_preview.sql');

  it('añade a items la vista previa del enlace, idempotente', () => {
    expect(s).toMatch(/add column if not exists link_title text/);
    expect(s).toMatch(/add column if not exists link_image text/);
    expect(s).toMatch(/add column if not exists link_site text/);
  });

  it('normaliza la búsqueda con una función IMMUTABLE (lower + translate) y columnas generadas', () => {
    expect(s).toMatch(/create or replace function public\.search_normalize\(t text\)[\s\S]*?immutable[\s\S]*?translate\(\s*lower\(/);
    expect(s).toMatch(/alter table public\.items\s+add column if not exists search_text text generated always as \([\s\S]*?title[\s\S]*?notes[\s\S]*?source_text[\s\S]*?author[\s\S]*?link_title[\s\S]*?\) stored;/);
    expect(s).toMatch(/alter table public\.people\s+add column if not exists search_text text generated always as \([\s\S]*?name[\s\S]*?notes[\s\S]*?\) stored;/);
  });

  it('no toca RLS y todo es repetible', () => {
    expect(s).not.toMatch(/policy|row level security|grant |revoke /i);
    expect(s).not.toMatch(/create (table|index) (?!if not exists)/);
    expect(s).not.toMatch(/add column (?!if not exists)/);
  });
});

describe('0011_segundo_cerebro.sql', () => {
  const s = sql('0011_segundo_cerebro.sql');
  const owner =
    'for all to authenticated\\s+using \\(user_id = \\(select auth\\.uid\\(\\)\\) and \\(select private\\.is_allowed_user\\(\\)\\)\\)\\s+with check \\(user_id = \\(select auth\\.uid\\(\\)\\) and \\(select private\\.is_allowed_user\\(\\)\\)\\);';

  it.each(['stores', 'item_links', 'tags'])('crea %s con RLS de propietario y usuario permitido', (table) => {
    expect(s).toMatch(new RegExp(`create table if not exists public\\.${table} \\(`));
    expect(s).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security;`));
    expect(s).toMatch(new RegExp(`drop policy if exists ${table}_owner on public\\.${table};`));
    expect(s).toMatch(new RegExp(`create policy ${table}_owner on public\\.${table}\\s+${owner}`));
  });

  it('las filas de item_links se borran con su item', () => {
    expect(s).toMatch(/item_id\s+uuid not null references public\.items\(id\) on delete cascade/);
  });

  it('una tienda no se repite por nombre (sin mayúsculas) y un tag tampoco', () => {
    expect(s).toMatch(/create unique index if not exists stores_user_name_uniq on public\.stores \(user_id, lower\(btrim\(name\)\)\);/);
    expect(s).toMatch(/create unique index if not exists tags_user_name_uniq on public\.tags \(user_id, lower\(btrim\(name\)\)\);/);
  });

  it.each([
    'data jsonb not null default',
    'store_id uuid references public\\.stores\\(id\\) on delete set null',
    'priority text',
    'remind_at timestamptz',
    'pinned boolean not null default false',
    'archived boolean not null default false',
    'completed_at timestamptz',
    'tags text\\[\\] not null default',
  ])('items gana la columna %s', (col) => {
    expect(s).toMatch(new RegExp(`add column if not exists ${col}`));
  });

  it.each(['alias text\\[\\]', 'relation text', 'likes text', 'sizes jsonb', 'dislikes text', 'contact jsonb'])(
    'people gana la columna %s',
    (col) => {
      expect(s).toMatch(new RegExp(`add column if not exists ${col}`));
    },
  );

  it('quita los CHECK de type y status (los valida el registro de tipos) y no toca los datos', () => {
    expect(s).toMatch(/drop constraint/);
    expect(s).not.toMatch(/add constraint items_(type|status)_check/);
    expect(s).not.toMatch(/\bupdate public\.items\b|\bdelete from\b|\bdrop table\b|\bdrop column\b|\btruncate\b/i);
  });

  it('es repetible', () => {
    expect(s).not.toMatch(/create (table|index|unique index) (?!if not exists)/);
    expect(s).not.toMatch(/add column (?!if not exists)/);
  });
});

describe('0012_captura.sql', () => {
  const s = sql('0012_captura.sql');

  it('items gana la sugerencia de la Bandeja, repetible', () => {
    expect(s).toMatch(/alter table public\.items\s+add column if not exists suggestion jsonb;/);
  });

  it('crea capture_log con el texto original, la salida del modelo, los items y las correcciones', () => {
    expect(s).toMatch(/create table if not exists public\.capture_log \(/);
    for (const col of ['raw_input text not null', 'source text', 'model_output jsonb', 'error text', "item_ids uuid\\[\\] not null default '\\{\\}'", "corrections jsonb not null default '\\[\\]'::jsonb"]) {
      expect(s).toMatch(new RegExp(col.replace(/ /g, '\\s+')));
    }
  });

  it('capture_log tiene RLS de propietario y usuario permitido', () => {
    expect(s).toMatch(/alter table public\.capture_log\s+enable row level security;/);
    expect(s).toMatch(/drop policy if exists capture_log_owner on public\.capture_log;/);
    expect(s).toMatch(
      /create policy capture_log_owner on public\.capture_log\s+for all to authenticated\s+using \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\)\s+with check \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\);/,
    );
  });

  it('solo añade: no toca datos y todo es repetible', () => {
    expect(s).not.toMatch(/\bupdate public\.|\bdelete from\b|\bdrop table\b|\bdrop column\b|\btruncate\b/i);
    expect(s).not.toMatch(/create (table|index) (?!if not exists)/);
    expect(s).not.toMatch(/add column (?!if not exists)/);
  });
});

describe('0013_resurfacing.sql', () => {
  const s = sql('0013_resurfacing.sql');

  it('items gana updated_at (con las filas existentes en created_at), snoozed_until y snooze_count', () => {
    expect(s).toMatch(/alter table public\.items add column if not exists updated_at timestamptz;/);
    expect(s).toMatch(/update public\.items set updated_at = created_at where updated_at is null;/);
    expect(s).toMatch(/alter column updated_at set default now\(\);/);
    expect(s).toMatch(/alter column updated_at set not null;/);
    expect(s).toMatch(/add column if not exists snoozed_until timestamptz/);
    expect(s).toMatch(/add column if not exists snooze_count int not null default 0/);
  });

  it('el trigger de updated_at solo mira las columnas de contenido (las mismas que el backend en memoria)', async () => {
    const { CONTENT_COLUMNS } = await import('@/lib/db/contentColumns');
    const fn = s.slice(s.indexOf('create or replace function private.items_touch_updated_at'), s.indexOf('drop trigger if exists items_touch_updated_at'));
    const named = [...fn.matchAll(/new\.(\w+) is distinct from old\.\1/g)].map((m) => m[1]).sort();
    expect(named).toEqual([...CONTENT_COLUMNS].sort());
    // Lo técnico no mueve updated_at.
    for (const col of ['calendar_event_id', 'sync_error', 'link_title', 'link_image', 'link_site', 'snoozed_until', 'snooze_count', 'deleted_at']) {
      expect(fn).not.toContain(`new.${col}`);
    }
    expect(s).toMatch(/create trigger items_touch_updated_at\s+before update on public\.items\s+for each row execute function private\.items_touch_updated_at\(\);/);
  });

  it('crea resurfacing_events con los canales y las acciones permitidos y RLS de propietario', () => {
    expect(s).toMatch(/create table if not exists public\.resurfacing_events \(/);
    expect(s).toMatch(/channel\s+text not null check \(channel in \('telegram', 'push', 'web'\)\)/);
    expect(s).toMatch(/action\s+text check \(action is null or action in \('hecho', 'posponer', 'archivar', 'abrir'\)\)/);
    expect(s).toMatch(/item_id\s+uuid references public\.items\(id\) on delete cascade/);
    expect(s).toMatch(/alter table public\.resurfacing_events enable row level security;/);
    expect(s).toMatch(
      /create policy resurfacing_events_owner on public\.resurfacing_events\s+for all to authenticated\s+using \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\)\s+with check \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\);/,
    );
  });

  it('settings gana canales, horas de recordatorio (11:00, 13:30, 15:30), festivos y la última franja', () => {
    expect(s).toMatch(/add column if not exists notify_push boolean not null default true/);
    expect(s).toMatch(/add column if not exists notify_telegram boolean not null default true/);
    expect(s).toMatch(/add column if not exists reminder_times text\[\] not null default '\{11:00,13:30,15:30\}'/);
    expect(s).toMatch(/add column if not exists skip_holidays boolean not null default true/);
    expect(s).toMatch(/add column if not exists last_slot text/);
  });

  it('pg_cron cada 30 minutos sobre el mismo trabajo y la misma ruta, sin horas fijas en UTC', () => {
    expect(s).toMatch(/perform cron\.unschedule\('agente-resumen-manana'\)/);
    expect(s).toMatch(/'agente-resumen-manana',\s+'\*\/30 \* \* \* \*'/);
    expect(s).toContain("|| '/api/cron/morning'");
    expect(s).toMatch(/decrypted_secrets where name = 'app_url'/);
    expect(s).toMatch(/decrypted_secrets where name = 'cron_secret'/);
  });

  it('solo añade: nada se borra y todo es repetible', () => {
    expect(s).not.toMatch(/\bdelete from\b|\bdrop table\b|\bdrop column\b|\btruncate\b/i);
    expect(s).not.toMatch(/create (table|index) (?!if not exists)/);
    expect(s).not.toMatch(/add column (?!if not exists)/);
    expect(s).toMatch(/drop trigger if exists items_touch_updated_at/);
    expect(s).toMatch(/drop policy if exists resurfacing_events_owner/);
  });
});

describe('0014_proyectos.sql', () => {
  const s = sql('0014_proyectos.sql');
  const owner =
    'for all to authenticated\\s+using \\(user_id = \\(select auth\\.uid\\(\\)\\) and \\(select private\\.is_allowed_user\\(\\)\\)\\)\\s+with check \\(user_id = \\(select auth\\.uid\\(\\)\\) and \\(select private\\.is_allowed_user\\(\\)\\)\\);';

  it('crea projects con RLS de propietario y usuario permitido', () => {
    expect(s).toMatch(/create table if not exists public\.projects \(/);
    expect(s).toMatch(/alter table public\.projects\s+enable row level security;/);
    expect(s).toMatch(/drop policy if exists projects_owner on public\.projects;/);
    expect(s).toMatch(new RegExp(`create policy projects_owner on public\\.projects\\s+${owner}`));
  });

  it('el estado solo admite activo, en_pausa o terminado', () => {
    expect(s).toMatch(/status\s+text not null default 'activo' check \(status in \('activo', 'en_pausa', 'terminado'\)\)/);
  });

  it('items.project_id se suelta (no se borra el item) al borrar el proyecto', () => {
    expect(s).toMatch(/add column if not exists project_id uuid references public\.projects\(id\) on delete set null/);
  });

  it('un proyecto no se repite por nombre', () => {
    expect(s).toMatch(/create unique index if not exists projects_user_name_uniq on public\.projects \(user_id, lower\(btrim\(name\)\)\);/);
  });
});
