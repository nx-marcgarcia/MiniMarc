/**
 * Columnas de `items` cuyo cambio mueve `updated_at` («se tocó el contenido»). Es el espejo del
 * trigger items_touch_updated_at de supabase/migrations/0013_resurfacing.sql: lo usa el backend en
 * memoria de los tests, y tests/db/migrations.test.ts comprueba que la migración nombra las mismas.
 */
export const CONTENT_COLUMNS = [
  'title',
  'notes',
  'status',
  'type',
  'data',
  'due_at',
  'tags',
  'person_id',
  'store_id',
  'archived',
  'priority',
  'area',
  'pinned',
  'link',
] as const;
