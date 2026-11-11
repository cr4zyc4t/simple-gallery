"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PREFS, prefsCookie, type Prefs } from "./prefs";

/**
 * Viewer preferences, seeded from the cookie the server already saw, so the
 * first client render matches the server-rendered markup. Every change is
 * written straight back to the cookie for the next request.
 */
export function usePrefs(initial: Prefs = DEFAULT_PREFS): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...initial }));
  const seeded = useRef(false);

  useEffect(() => {
    // No need to rewrite what the browser just sent us.
    if (!seeded.current) {
      seeded.current = true;
      return;
    }
    try {
      document.cookie = prefsCookie(prefs);
    } catch {
      // storage disabled — preferences simply do not survive the session
    }
  }, [prefs]);

  const update = useCallback(
    (patch: Partial<Prefs>) => setPrefs((current) => ({ ...current, ...patch })),
    [],
  );

  return [prefs, update];
}
