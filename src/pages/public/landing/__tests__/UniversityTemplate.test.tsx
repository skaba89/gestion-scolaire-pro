/**
 * Audit templates de site public (2026-08-28) : UniversityTemplate
 * affichait trois blocs de contenu fabriqué présentés comme réels :
 *  1. Une citation de mission inventée ("Former les esprits de
 *     demain...") en repli quand settings.description était absente.
 *  2. Les "3 piliers" (Excellence/Innovation/Diversité) — texte marketing
 *     générique inconditionnel, prétendant l'existence de "laboratoires
 *     de recherche" sans aucune donnée réelle.
 *  3. Une phrase fixe ("Programme complet conçu pour répondre aux
 *     exigences du marché du travail...") attachée à chaque programme
 *     réel, mais entièrement inventée.
 * Ce test verrouille que ces trois éléments ne s'affichent plus que
 * lorsqu'une vraie donnée existe (ou jamais, pour les piliers).
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { UniversityTemplate } from "../UniversityTemplate";
import type { TenantPublicResponse, TenantLandingSettings } from "@/types/tenant";

vi.mock("@/api/client", () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn() },
}));

function renderTemplate(tenant: TenantPublicResponse, settings: TenantLandingSettings) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UniversityTemplate tenant={tenant} settings={settings} />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

function makeSettings(overrides: Partial<TenantLandingSettings> = {}): TenantLandingSettings {
  return {
    primary_color: "#2d1b69",
    gallery: [],
    announcements: [],
    show_stats: true,
    show_programs: true,
    ...overrides,
  };
}

function makeTenant(overrides: Partial<TenantPublicResponse> = {}): TenantPublicResponse {
  return {
    id: "t1",
    name: "Université La Source",
    slug: "universite-la-source",
    type: "university",
    is_active: true,
    landing: makeSettings(),
    ...overrides,
  };
}

describe("UniversityTemplate — pas de données fabriquées", () => {
  it("n'affiche pas de citation de mission fabriquée quand settings.description est absente", () => {
    renderTemplate(makeTenant(), makeSettings({ description: undefined }));
    expect(screen.queryByText("Notre Mission")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Former les esprits de demain/i),
    ).not.toBeInTheDocument();
  });

  it("affiche la vraie description comme citation de mission quand elle existe", () => {
    renderTemplate(
      makeTenant(),
      makeSettings({ description: "Éduquer pour transformer la Guinée." }),
    );
    expect(screen.getByText("Notre Mission")).toBeInTheDocument();
    expect(screen.getByText(/Éduquer pour transformer la Guinée/i)).toBeInTheDocument();
  });

  it("n'affiche jamais les '3 piliers' fabriqués (laboratoires de recherche inventés)", () => {
    renderTemplate(makeTenant(), makeSettings({ description: "Une vraie mission." }));
    expect(screen.queryByText("Excellence")).not.toBeInTheDocument();
    expect(screen.queryByText("Innovation")).not.toBeInTheDocument();
    expect(screen.queryByText("Diversité")).not.toBeInTheDocument();
    expect(screen.queryByText(/laboratoires de recherche/i)).not.toBeInTheDocument();
  });

  it("n'affiche jamais la phrase fabriquée sur les programmes", () => {
    renderTemplate(
      makeTenant({ programs: [{ name: "Licence Informatique" }] }),
      makeSettings(),
    );
    expect(screen.getByText("Licence Informatique")).toBeInTheDocument();
    expect(
      screen.queryByText(/Programme complet conçu pour répondre aux exigences du marché/i),
    ).not.toBeInTheDocument();
  });

  it("affiche la vraie description d'un programme quand elle existe", () => {
    renderTemplate(
      makeTenant({
        programs: [{ name: "Licence Informatique", description: "3 ans, spécialisation IA en dernière année." }],
      }),
      makeSettings(),
    );
    expect(screen.getByText("3 ans, spécialisation IA en dernière année.")).toBeInTheDocument();
  });
});
