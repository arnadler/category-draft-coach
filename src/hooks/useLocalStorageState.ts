"use client";

import { useEffect, useMemo, useState } from "react";
import { safeJsonParse } from "@/lib/storage";

export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
  migrate?: (stored: unknown) => T | null
) {
  const initial = useMemo(() => initialValue, [initialValue]);
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const storedRaw = safeJsonParse<unknown>(window.localStorage.getItem(key));
    if (storedRaw != null) {
      try {
        const migrated = migrate ? migrate(storedRaw) : (storedRaw as T);
        if (migrated != null) setValue(migrated);
      } catch {
        // Ignore bad/mismatched stored state; fall back to initialValue.
      }
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, loaded, value]);

  return { value, setValue, loaded } as const;
}
