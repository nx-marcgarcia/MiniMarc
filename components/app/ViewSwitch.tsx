'use client';

import { useRouter } from 'next/navigation';
import { Segmented } from '@/components/ui';

export type ViewSwitchOption = { href: string; label: string };

/**
 * Two (or more) views of the same section, each with its own address: Día | Semana | Calendario,
 * Por revisar | Últimas 24 h, Personas | Regalos. Same pill as Personal / Trabajo; switching
 * replaces the URL (sibling views, not a step deeper), so Back leaves the section.
 */
export function ViewSwitch({ label, options, current }: { label: string; options: ViewSwitchOption[]; current: string }) {
  const router = useRouter();
  return (
    <div className="app-segmented">
      <Segmented
        label={label}
        options={options.map((o) => ({ value: o.href, label: o.label }))}
        value={current}
        onChange={(href) => router.replace(href, { scroll: false })}
      />
    </div>
  );
}

/** The sibling views, so every screen of a section shows the same pills. */
export const HOY_VIEWS: ViewSwitchOption[] = [
  { href: '/hoy', label: 'Día' },
  { href: '/semana', label: 'Semana' },
  { href: '/agenda', label: 'Calendario' },
];

export const BANDEJA_VIEWS: ViewSwitchOption[] = [
  { href: '/sin-clasificar', label: 'Por revisar' },
  { href: '/bandeja', label: 'Últimas 24 h' },
];

export const PERSONAS_VIEWS: ViewSwitchOption[] = [
  { href: '/personas', label: 'Personas' },
  { href: '/regalos', label: 'Regalos' },
];
