-- Agente Personal: captura con IA (fase 2).
--
-- Solo aditiva e idempotente: no borra ni reescribe ningún dato. Se puede ejecutar otra vez.
-- Hasta aplicarla la app sigue funcionando: no escribe `suggestion` mientras valga null, y el
-- registro de clasificación falla en silencio (nunca detiene una captura).
--
-- 1. items.suggestion: lo que la IA cree que es un item dudoso, {"type": "tarea", "confidence": 0.3}.
--    El item va a la Bandeja (needs_review) con esa sugerencia, en vez de colarse en una categoría.
-- 2. capture_log: una fila por captura con el texto original, lo que devolvió el modelo, los items
--    que se crearon, el error si la IA falló y las correcciones de Marc (cambio de tipo, de persona,
--    de tienda). Sirve para mejorar el prompt con sus correcciones reales. Lo de Trabajo no se registra.
-- 3. RLS como en 0002: propietario Y usuario permitido (private.is_allowed_user()).

alter table public.items
  add column if not exists suggestion jsonb;

create table if not exists public.capture_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  raw_input    text not null,
  source       text,
  model_output jsonb,
  error        text,
  item_ids     uuid[] not null default '{}',
  corrections  jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists capture_log_user_idx on public.capture_log (user_id, created_at desc);

alter table public.capture_log
  enable row level security;

drop policy if exists capture_log_owner on public.capture_log;
create policy capture_log_owner on public.capture_log
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));
