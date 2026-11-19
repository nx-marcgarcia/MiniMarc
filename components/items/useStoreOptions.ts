'use client';

import { useEffect, useState } from 'react';
import { listCaptureChoices } from '@/app/actions/captureFollowUp';
import { settle } from '@/lib/actions/result';

export type StoreOption = { id: string; name: string };

/**
 * The stores for a purchase's "Tienda" select, read when the sheet opens on a purchase (like the
 * projects). Null while loading, if it fails, or before 0012 is applied: the sheet then simply has
 * no "Tienda" and saving leaves the store alone.
 */
export function useStoreOptions(enabled: boolean): StoreOption[] | null {
  const [stores, setStores] = useState<StoreOption[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    settle(() => listCaptureChoices(), '').then((r) => {
      if (alive && r.ok) setStores(r.value.stores);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return stores;
}
