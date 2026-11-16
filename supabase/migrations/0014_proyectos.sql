-- 0014 · Proyectos (reformulación del segundo cerebro)
--
-- Un proyecto es un plan con fin («Viaje a Japón», «Reforma baño») que junta items de cualquier
-- tipo: tareas, compras, enlaces, ideas, notas. Terminar un proyecto solo cambia su estado; sus
-- items no se tocan. Borrar un proyecto suelta sus items (project_id a null), nunca los borra.
--
-- Se aplica desde el SQL Editor de Supabase. Es idempotente. Sin ella la app funciona igual y
-- la pantalla Proyectos avisa de que falta.

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  area       text check (area in ('personal', 'trabajo')),
  status     text not null default 'activo' check (status in ('activo', 'en_pausa', 'terminado')),
  notes      text,
  due_date   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists projects_user_name_uniq on public.projects (user_id, lower(btrim(name)));
create index if not exists projects_user_status_idx on public.projects (user_id, status);

create or replace function private.projects_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at before update on public.projects
  for each row execute function private.projects_touch_updated_at();

alter table public.items
  add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists items_project_idx on public.items (project_id) where project_id is not null;

alter table public.projects enable row level security;

drop policy if exists projects_owner on public.projects;
create policy projects_owner on public.projects
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));
