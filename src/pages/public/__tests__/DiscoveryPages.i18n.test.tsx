/**
 * Traduction des pages de découverte (site public, sous-lot T2, 2026-11-26) : annuaire, page de
 * connexion et inscription d'une école s'affichent en anglais sans clé brute ; le français reste
 * celui d'avant.
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/i18n/config";

vi.mock("@/hooks/usePublicTenant", () => ({
  usePublicTenants: () => ({ data: [{ id: "t1", name: "Lycée de Kaloum", slug: "lk", type: "high" }], isLoading: false,
    isError: false, isFetching: false, refetch: vi.fn() }),
  usePublicDirectoryFacets: () => ({ data: undefined }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, roles: [], refreshProfile: vi.fn(), isSuperAdmin: () => false, isLoading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import PublicDirectory from "../PublicDirectory";
import ConnectionHub from "../ConnectionHub";
import Register from "../Register";

function renderPage(page: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{page}</MemoryRouter></QueryClientProvider>);
}

const PAGES: [string, ReactNode, string, string][] = [
  ["PublicDirectory", <PublicDirectory />, "Annuaire des établissements", "Directory of institutions"],
  ["ConnectionHub", <ConnectionHub />, "Accès restreint", "Restricted access"],
  ["Register", <Register />, "Créer votre établissement", "Create your institution"],
];

describe("Pages de découverte — traduction", () => {
  afterEach(async () => { await i18n.changeLanguage("fr"); });

  it.each(PAGES)("%s : français inchangé, anglais sans clé brute", async (_name, page, fr, en) => {
    await i18n.changeLanguage("fr");
    const { unmount } = renderPage(page);
    expect(screen.getByText(fr)).toBeInTheDocument();
    unmount();
    await i18n.changeLanguage("en");
    renderPage(page);
    expect(screen.getByText(en)).toBeInTheDocument();
    expect(screen.queryByText(fr)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/(publicDirectory|connectionHub|register)\.[a-zA-Z]/);
  });
});
