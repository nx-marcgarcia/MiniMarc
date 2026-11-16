'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { setAreaFilter } from '@/app/actions/area';
import { Segmented } from '@/components/ui';
import type { AreaFilter as Filter } from '@/lib/area';

const OPTIONS: { value: Filter; label: string }[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'trabajo', label: 'Trabajo' },
  { value: 'todo', label: 'Todo' },
];

/**
 * Personal | Trabajo | Todo, the same on every screen that has areas (Hoy, Tareas, Bandeja,
 * Proyectos). The choice is remembered (a cookie) for all of them; an old `?area=` in the URL
 * is dropped once Marc picks.
 */
export function AreaFilter({ value }: { value: Filter }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  return (
    <div className="app-segmented">
      <Segmented
        label="Área"
        options={OPTIONS}
        value={value}
        onChange={(next) =>
          startTransition(async () => {
            await setAreaFilter(next);
            const rest = new URLSearchParams(params.toString());
            rest.delete('area');
            const query = rest.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
            router.refresh();
          })
        }
      />
    </div>
  );
}
