-- Agente Personal: base del segundo cerebro (fase 1).
--
-- Solo aditiva e idempotente: no borra ni reescribe ningún dato. Se puede ejecutar otra vez.
-- APLICARLA ANTES de desplegar el código de la fase 1: el código nuevo guarda estados por tipo
-- (quiero, comprado, semilla…) y los CHECK antiguos de `status` los rechazarían.
--
-- 1. Tablas nuevas, con RLS como en 0002 (propietario Y usuario permitido):
--      stores      tiendas (nombre, dominio, online o física, favicon).
--      item_links  varios enlaces por item, con su vista previa; se borran con el item.
--      tags        tags con color. Los items guardan los nombres en items.tags (text[]).
-- 2. items gana: data (campos propios del tipo, jsonb validado por el registro lib/items/itemTypes.ts),
--    store_id, priority, remind_at, pinned, archived, completed_at y tags.
--    `notes` hace de `body` y `confidence` de `aiConfidence`; `origin` hace de `source`.
-- 3. people gana: alias, relation, likes, sizes, dislikes y contact. Las fechas importantes
--    siguen en person_dates (0006); el cumpleaños en people.birthday.
-- 4. Se quitan los CHECK de items.type y items.status: ahora los valida el registro de tipos en
--    el servidor (todas las escrituras pasan por los repositorios; hay un test que lo impone).
--    Los valores antiguos (pendiente, hecho, archivado) siguen siendo legibles: el código los
--    traduce al leer, y scripts/migrate-v2.ts los reescribe cuando Marc lo decide.
-- 5. Las columnas link, link_title, link_image, link_site, author y reading_state NO se tocan:
--    se quitarán en una migración aparte, con el OK de Marc, cuando todo esté migrado.

-- Tiendas ---------------------------------------------------------------------------
create table if not exists public.stores (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  domain     text,
  kind       text not null default 'online' check (kind in ('online', 'fisica')),
  favicon    text,
  created_at timestamptz not null default now()
);
create unique index if not exists stores_user_name_uniq on public.stores (user_id, lower(btrim(name)));
create index if not exists stores_user_domain_idx on public.stores (user_id, domain);

-- Tags -------------------------------------------------------------------------------
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  color      text,
  created_at timestamptz not null default now()
);
create unique index if not exists tags_user_name_uniq on public.tags (user_id, lower(btrim(name)));

-- Items: columnas nuevas --------------------------------------------------------------
alter table public.items
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists store_id uuid references public.stores(id) on delete set null,
  add column if not exists priority text check (priority is null or priority in ('baja', 'media', 'alta')),
  add column if not exists remind_at timestamptz,
  add column if not exists pinned boolean not null default false,
  add column if not exists archived boolean not null default false,
  add column if not exists completed_at timestamptz,
  add column if not exists tags text[] not null default '{}';

create index if not exists items_store_idx on public.items (store_id) where store_id is not null;
create index if not exists items_tags_idx on public.items using gin (tags);

-- Enlaces de un item -------------------------------------------------------------------
create table if not exists public.item_links (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  url         text not null check (length(btrim(url)) > 0),
  title       text,
  description text,
  image       text,
  domain      text,
  favicon     text,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists item_links_item_idx on public.item_links (item_id, position);
create index if not exists item_links_user_idx on public.item_links (user_id);

-- Personas: ficha completa ---------------------------------------------------------------
alter table public.people
  add column if not exists alias text[] not null default '{}',
  add column if not exists relation text,
  add column if not exists likes text,
  add column if not exists sizes jsonb not null default '{}'::jsonb,
  add column if not exists dislikes text,
  add column if not exists contact jsonb not null default '{}'::jsonb;

-- RLS de las tablas nuevas -----------------------------------------------------------------
alter table public.stores     enable row level security;
alter table public.item_links enable row level security;
alter table public.tags       enable row level security;

drop policy if exists stores_owner on public.stores;
create policy stores_owner on public.stores
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));

drop policy if exists item_links_owner on public.item_links;
create policy item_links_owner on public.item_links
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));

drop policy if exists tags_owner on public.tags;
create policy tags_owner on public.tags
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));

-- Fuera los CHECK de type y status -----------------------------------------------------------
-- 0001 los creó anónimos y 0008 recreó el de type con nombre fijo; este bloque borra cualquier
-- CHECK de items que hable de `type` con los tipos antiguos o de `status` con sus estados.
do $checks$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.items'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ~ '\mtype\M.*''tarea'''
        or pg_get_constraintdef(oid) ~ '\mstatus\M.*''pendiente'''
      )
  loop
    execute format('alter table public.items drop constraint %I', c.conname);
  end loop;
end
$checks$;
