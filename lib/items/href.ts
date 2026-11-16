/** Where an item lives in the app (the toast's "Ver", the notices' "Abrir"). No server imports. */
import type { Item, ItemType } from '@/lib/db/types';

const ITEM_HREF: Record<Exclude<ItemType, 'tarea' | 'regalo'>, string> = {
  idea: '/ideas',
  compra: '/compras',
  libro: '/libros',
  enlace: '/enlaces',
  nota: '/notas',
};

export function itemHref(item: Pick<Item, 'type' | 'area' | 'personId'>): string {
  if (item.type === 'tarea') return `/tareas?area=${item.area ?? 'personal'}`;
  if (item.type === 'regalo') return item.personId ? `/personas/${item.personId}` : '/regalos';
  return ITEM_HREF[item.type];
}
