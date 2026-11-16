'use client';

import { useEffect, useState } from 'react';
import { listProjectOptions } from '@/app/actions/projects';
import { settle } from '@/lib/actions/result';
import type { Project } from '@/lib/db/projects';

export type ProjectOptions = { available: boolean; projects: Project[] };

/**
 * The open projects for the item sheet, read when the sheet opens (like the capture bar's
 * people). Null while loading or if it fails: the sheet then simply has no "Proyecto".
 */
export function useProjectOptions(open: boolean): ProjectOptions | null {
  const [options, setOptions] = useState<ProjectOptions | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    settle(() => listProjectOptions(), '').then((r) => {
      if (alive && r.ok) setOptions(r.value);
    });
    return () => {
      alive = false;
    };
  }, [open]);
  return options;
}
