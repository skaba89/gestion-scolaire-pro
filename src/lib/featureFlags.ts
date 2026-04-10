/**
 * Feature flags for SchoolFlow Pro.
 *
 * Zero external dependencies — powered by Zustand.
 * Dev overrides via localStorage:
 *   localStorage.setItem('ff_commandPalette', 'true')
 *   localStorage.setItem('ff_commandPalette', 'false')
 */
import { create } from "zustand";

// ── Flag definitions ──────────────────────────────────────────────────────────

export interface FeatureFlags {
  /** Global ⌘K / Ctrl+K command palette */
  commandPalette: boolean;
  /** Guided onboarding tour for new admins */
  onboardingTour: boolean;
  /** Infinite-scroll pagination for Students list */
  infiniteScrollStudents: boolean;
  /** Web Vitals tracking → Sentry */
  webVitals: boolean;
  /** Redesigned dashboard layout */
  newDashboard: boolean;
  /** Bulk actions on table rows */
  bulkActions: boolean;
  /** Export data (CSV, PDF) */
  exportData: boolean;
  /** Advanced search with filters */
  advancedSearch: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  commandPalette: true,
  onboardingTour: true,
  infiniteScrollStudents: true,
  webVitals: true,
  newDashboard: false,
  bulkActions: true,
  exportData: true,
  advancedSearch: false,
};

// ── localStorage dev overrides ────────────────────────────────────────────────

function getLocalOverrides(): Partial<FeatureFlags> {
  if (typeof window === "undefined" || !import.meta.env.DEV) return {};
  const overrides: Partial<FeatureFlags> = {};
  for (const key of Object.keys(DEFAULT_FLAGS) as (keyof FeatureFlags)[]) {
    const raw = localStorage.getItem(`ff_${key}`);
    if (raw !== null) {
      (overrides as Record<string, boolean>)[key] = raw === "true";
    }
  }
  return overrides;
}

// ── Zustand store ─────────────────────────────────────────────────────────────

interface FeatureFlagStore {
  flags: FeatureFlags;
  setFlag: (key: keyof FeatureFlags, value: boolean) => void;
  resetFlags: () => void;
}

export const useFeatureFlagStore = create<FeatureFlagStore>((set) => ({
  flags: { ...DEFAULT_FLAGS, ...getLocalOverrides() },
  setFlag: (key, value) =>
    set((state) => ({ flags: { ...state.flags, [key]: value } })),
  resetFlags: () => set({ flags: { ...DEFAULT_FLAGS } }),
}));

// ── Public API ────────────────────────────────────────────────────────────────

/** React hook — re-renders component when the flag changes. */
export function useFeatureFlag(flag: keyof FeatureFlags): boolean {
  return useFeatureFlagStore((state) => state.flags[flag]);
}

/** Imperative getter — use outside of React components. */
export function getFlag(flag: keyof FeatureFlags): boolean {
  return useFeatureFlagStore.getState().flags[flag];
}
