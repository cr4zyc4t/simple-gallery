"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * useState mirrored into localStorage (view mode, ordering) without the SSR
 * hydration flash: the stored value is applied after mount.
 */
export function usePersistentState<T extends string>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key) as T | null;
      if (stored) setValue(stored);
    } catch {
      // private mode / storage disabled — keep the default
    }
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // ignore quota / privacy errors
      }
    },
    [key],
  );

  return [value, update];
}
