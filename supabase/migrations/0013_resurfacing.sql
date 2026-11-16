-- Agente Personal: resurfacing y avisos (fase 4).
--
-- Solo aditiva e idempotente: no borra ni reescribe ningún dato. Se puede ejecutar otra vez.
-- Aplicarla ANTES de desplegar el código de la fase 4 (el código lee estas columnas; sin ellas
-- los ajustes nuevos toman sus valores por defecto y el resurfacing no guarda lo que envía).
--
-- 1. items.updated_at: cuándo se tocó por última vez el CONTENIDO de un item (título, notas,
--    estado, datos, fecha, tags…). Un trigger lo mantiene y NO lo mueve por cosas técnicas
--    (sincronizar con Calendar, la vista previa de un enlace, posponer): así «idea sin tocar en
--    30 días» significa de verdad que nadie la tocó. Las filas existentes empiezan en created_at.
-- 2. items.snoozed_until y snooze_count: «Posponer 1 semana» desde Telegram o «Para hoy». Hasta esa
--    fecha el item no vuelve a salir; a la tercera vez la app pregunta si se archiva.
-- 3. resurfacing_events: cada aviso enviado (qué, cuándo, por qué canal y qué hice). Evita repetir
--    el mismo item en 7 días y es la base para afinar la selección. `subject` identifica lo que se
--    avisó cuando no es un item (p. ej. el cumpleaños de una persona).
-- 4. settings: canales (push y Telegram), horas de los 3 recordatorios, saltar festivos y la
--    última franja enviada (idempotencia: si el cron corre dos veces no envía dos veces).
-- 5. pg_cron: el trabajo de /api/cron/morning pasa a correr cada 30 minutos. La ruta decide en
--    el servidor, con la hora de Madrid, si toca enviar algo (nunca se fijan horas en UTC aquí).
--    Usa los mismos secretos de Vault que en 0004 (app_url y cron_secret).

-- Items ---------------------------------------------------------------------------------------
alter table public.items add column if not exists updated_at timestamptz;
update public.items set updated_at = created_at where updated_at is null;
alter table public.items alter column updated_at set default now();
alter table public.items alter column updated_at set not null;

alter table public.items
  add column if not exists snoozed_until timestamptz,
  add column if not exists snooze_count int not null default 0;

create index if not exists items_updated_idx on public.items (user_id, updated_at) where deleted_at is null;

create or replace function private.items_touch_updated_at() returns trigger
language plpgsql as $fn$
begin
  -- Solo el contenido mueve updated_at; lo técnico (calendario, vista previa, posponer) no.
  if new.title is distinct from old.title
     or new.notes is distinct from old.notes
     or new.status is distinct from old.status
     or new.type is distinct from old.type
     or new.data is distinct from old.data
     or new.due_at is distinct from old.due_at
     or new.tags is distinct from old.tags
     or new.person_id is distinct from old.person_id
     or new.store_id is distinct from old.store_id
     or new.archived is distinct from old.archived
     or new.priority is distinct from old.priority
     or new.area is distinct from old.area
     or new.pinned is distinct from old.pinned
     or new.link is distinct from old.link
  then
    new.updated_at := now();
  end if;
  return new;
end
$fn$;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at
  before update on public.items
  for each row execute function private.items_touch_updated_at();

-- Avisos enviados -----------------------------------------------------------------------------------
create table if not exists public.resurfacing_events (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id             uuid references public.items(id) on delete cascade,
  subject             text not null,
  kind                text not null,
  channel             text not null check (channel in ('telegram', 'push', 'web')),
  sent_at             timestamptz not null default now(),
  action              text check (action is null or action in ('hecho', 'posponer', 'archivar', 'abrir')),
  acted_at            timestamptz,
  telegram_message_id bigint
);
create index if not exists resurfacing_events_user_idx on public.resurfacing_events (user_id, sent_at desc);
create index if not exists resurfacing_events_subject_idx on public.resurfacing_events (user_id, subject, sent_at desc);

alter table public.resurfacing_events enable row level security;

drop policy if exists resurfacing_events_owner on public.resurfacing_events;
create policy resurfacing_events_owner on public.resurfacing_events
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));

-- Ajustes -------------------------------------------------------------------------------------------
alter table public.settings
  add column if not exists notify_push boolean not null default true,
  add column if not exists notify_telegram boolean not null default true,
  add column if not exists reminder_times text[] not null default '{11:00,13:30,15:30}',
  add column if not exists skip_holidays boolean not null default true,
  add column if not exists last_slot text;

-- pg_cron cada 30 minutos --------------------------------------------------------------------------------
do $cron$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron o pg_net no disponibles: usa un cron externo cada 30 minutos (docs/despliegue.md)';
    return;
  end if;

  create extension if not exists pg_cron with schema pg_catalog;
  create extension if not exists pg_net with schema extensions;

  if exists (select 1 from cron.job where jobname = 'agente-resumen-manana') then
    perform cron.unschedule('agente-resumen-manana');
  end if;

  perform cron.schedule(
    'agente-resumen-manana',
    '*/30 * * * *',
    $job$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'app_url'), '/')
             || '/api/cron/morning',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $job$
  );
end
$cron$;
