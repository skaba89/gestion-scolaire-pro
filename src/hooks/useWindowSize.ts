import { useState, useEffect } from "react";

interface WindowSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

function getSize(): WindowSize {
  const width = typeof window !== "undefined" ? window.innerWidth : 1280;
  const height = typeof window !== "undefined" ? window.innerHeight : 800;
  return {
    width,
    height,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  };
}

/**
 * Returns current viewport dimensions with responsive breakpoint flags.
 *
 * Breakpoints (Tailwind-aligned):
 *   - mobile  → width < 768px
 *   - tablet  → 768px ≤ width < 1024px
 *   - desktop → width ≥ 1024px
 */
export function useWindowSize(): WindowSize {
  const [size, setSize] = useState<WindowSize>(getSize);

  useEffect(() => {
    function handleResize() {
      setSize(getSize());
    }
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return size;
}
