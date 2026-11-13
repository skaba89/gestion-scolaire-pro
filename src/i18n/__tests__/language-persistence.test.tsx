import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Audit des langues (2026-11-13) : la langue choisie par l'utilisateur
 * revenait au français à chaque rechargement (init forcée sur « fr », puis
 * langue de l'établissement appliquée par-dessus) et l'arabe perdait le
 * sens droite-à-gauche.
 */

const KEY = "schoolflow:language";

// vitest.setup.ts remplace localStorage par des vi.fn() vides : on lui
// redonne une mémoire pour ces tests.
const store = new Map<string, string>();
beforeEach(() => {
    store.clear();
    vi.mocked(localStorage.getItem).mockImplementation((k: string) => store.get(k) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((k: string, v: string) => void store.set(k, String(v)));
    vi.mocked(localStorage.removeItem).mockImplementation((k: string) => void store.delete(k));
    vi.resetModules();
});
afterEach(() => {
    vi.mocked(localStorage.getItem).mockReset();
    vi.mocked(localStorage.setItem).mockReset();
    vi.mocked(localStorage.removeItem).mockReset();
    vi.doUnmock("@/contexts/TenantContext");
    vi.doUnmock("@/contexts/AuthContext");
    vi.doUnmock("@/api/client");
});

describe("language persistence", () => {
    it("starts in French when the user never chose a language", async () => {
        const { default: i18n } = await import("@/i18n/config");
        expect(i18n.language).toBe("fr");
        expect(document.documentElement.dir).toBe("ltr");
    });

    it("restores the user's explicit choice on reload, with RTL for Arabic", async () => {
        store.set(KEY, "ar");
        const { default: i18n } = await import("@/i18n/config");
        expect(i18n.language).toBe("ar");
        expect(document.documentElement.lang).toBe("ar");
        expect(document.documentElement.dir).toBe("rtl");
    });

    it("remembers a choice made with the switcher and follows its direction", async () => {
        const { default: i18n, setUserLanguage } = await import("@/i18n/config");
        setUserLanguage("ar");
        expect(store.get(KEY)).toBe("ar");
        expect(document.documentElement.dir).toBe("rtl");
        setUserLanguage("en");
        expect(i18n.language).toBe("en");
        expect(document.documentElement.dir).toBe("ltr");
    });

    async function renderProvider(tenantLanguage: string) {
        vi.doMock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "t1", name: "École" } }) }));
        vi.doMock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isSuperAdmin: () => false }) }));
        vi.doMock("@/api/client", () => ({ apiClient: { get: vi.fn().mockResolvedValue({ data: { language: tenantLanguage } }) } }));
        const { default: i18n } = await import("@/i18n/config");
        const { SettingsProvider } = await import("@/components/providers/SettingsProvider");
        render(
            <QueryClientProvider client={new QueryClient()}>
                <SettingsProvider><span>ok</span></SettingsProvider>
            </QueryClientProvider>,
        );
        return i18n;
    }

    it("applies the school's language when the user has no choice", async () => {
        const i18n = await renderProvider("en");
        await waitFor(() => expect(i18n.language).toBe("en"));
    });

    it("never overrides the user's explicit choice with the school's language", async () => {
        store.set(KEY, "ar");
        const i18n = await renderProvider("en");
        await new Promise((r) => setTimeout(r, 50));
        expect(i18n.language).toBe("ar");
        expect(document.documentElement.dir).toBe("rtl");
    });
});
