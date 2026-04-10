import { useEffect } from "react";
import { create } from "zustand";

const STORAGE_KEY = "sf_onboarding";
const TOUR_VERSION = "1.0";

interface StoredOnboarding {
  version: string;
  completed: boolean;
  skipped?: boolean;
  completedAt?: string;
}

function readStorage(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as StoredOnboarding;
    return data.version === TOUR_VERSION && data.completed;
  } catch {
    return false;
  }
}

function writeStorage(skipped = false): void {
  if (typeof window === "undefined") return;
  const data: StoredOnboarding = {
    version: TOUR_VERSION,
    completed: true,
    ...(skipped ? { skipped: true } : { completedAt: new Date().toISOString() }),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

interface OnboardingStore {
  isActive: boolean;
  hasCompleted: boolean;
  startTour: () => void;
  completeTour: () => void;
  skipTour: () => void;
  resetTour: () => void;
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  isActive: false,
  hasCompleted: readStorage(),

  startTour: () => set({ isActive: true }),

  completeTour: () => {
    writeStorage(false);
    set({ isActive: false, hasCompleted: true });
  },

  skipTour: () => {
    writeStorage(true);
    set({ isActive: false, hasCompleted: true });
  },

  /** Reset for testing / re-running the tour. */
  resetTour: () => {
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
    set({ hasCompleted: false, isActive: false });
  },
}));

export function useOnboarding() {
  return useOnboardingStore();
}

/**
 * Auto-starts the tour for first-time users.
 * Include this hook once in the authenticated layout.
 */
export function useAutoOnboarding() {
  const { hasCompleted, startTour } = useOnboardingStore();

  useEffect(() => {
    if (!hasCompleted) {
      const timer = setTimeout(startTour, 1800);
      return () => clearTimeout(timer);
    }
  }, [hasCompleted, startTour]);
}
