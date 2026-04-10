import { useEffect } from "react";
import { create } from "zustand";

interface CommandPaletteStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

/**
 * Registers the global ⌘K / Ctrl+K keyboard shortcut and returns the palette store.
 *
 * Call this hook once near the root of your app (e.g., inside AppContent).
 */
export function useCommandPalette() {
  const store = useCommandPaletteStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === "k") {
        e.preventDefault();
        store.toggle();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store]);

  return store;
}
