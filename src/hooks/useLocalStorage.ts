import { useState, useCallback } from "react";

/**
 * `useState` backed by `localStorage`.
 *
 * - Hydrates from localStorage on mount.
 * - Serializes to JSON automatically.
 * - SSR-safe (no `window` access during server render).
 *
 * @returns [storedValue, setValue, removeValue]
 *
 * @example
 *   const [theme, setTheme, clearTheme] = useLocalStorage("theme", "light");
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const next = value instanceof Function ? value(storedValue) : value;
        setStoredValue(next);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(next));
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn(`[useLocalStorage] Cannot write key "${key}":`, err);
        }
      }
    },
    [key, storedValue]
  );

  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn(`[useLocalStorage] Cannot remove key "${key}":`, err);
      }
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
