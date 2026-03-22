import { useRef, useEffect } from "react";

/**
 * Returns the value from the previous render.
 *
 * @example
 *   const prevCount = usePrevious(count);
 *   // On first render returns `undefined`; on subsequent renders returns the previous value.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}
