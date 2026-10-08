import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "schoolflow:sidebar-collapsed";
const CHANGE_EVENT = "schoolflow:sidebar-collapsed-change";
const DESKTOP_QUERY = "(min-width: 1024px)"; // Tailwind `lg`

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Desktop sidebar collapsed to an icon rail (72px) — a per-viewer
 * preference kept in localStorage and shared live between the sidebar and
 * the layout that offsets its content. Ignored below `lg` (the sidebar is
 * an off-canvas drawer there).
 */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    const sync = () => setCollapsed(readCollapsed());
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onMedia = () => setIsDesktop(mql.matches);
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    mql.addEventListener("change", onMedia);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
      mql.removeEventListener("change", onMedia);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !readCollapsed();
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Storage unavailable (private mode): keep the in-memory state only.
    }
    setCollapsed(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  /** True only when the icon rail is actually displayed (desktop + collapsed). */
  const rail = collapsed && isDesktop;
  return { collapsed, rail, toggle };
}

/** Sidebar width classes: drawer on mobile, 256/288px or 72px rail on desktop. */
export const sidebarWidthClass = (collapsed: boolean) =>
  collapsed ? "w-72 lg:w-[72px]" : "w-72 lg:w-64 xl:w-72";

/** Left offset of the content next to a fixed sidebar. */
export const sidebarOffsetClass = (collapsed: boolean) =>
  collapsed ? "lg:ml-[72px]" : "lg:ml-64 xl:ml-72";
