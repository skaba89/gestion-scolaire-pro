/**
 * Audit templates de site public (2026-08-28) : HighSchoolTemplate
 * affichait 4 cartes "Informations Admission" inconditionnelles avec du
 * texte procédural entièrement inventé ("Bulletins scolaires des 2
 * dernières années...", "résultats [...] communiqués par email dans un
 * délai de 15 jours") — présenté comme un fait réel de l'établissement,
 * alors qu'aucun champ de ce type n'existe dans TenantLandingSettings.
 * Ce test verrouille que ce texte fabriqué n'apparaît plus, tout en
 * gardant un CTA générique vers la vraie page d'admission.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { HighSchoolTemplate } from "../HighSchoolTemplate";
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
          <HighSchoolTemplate tenant={tenant} settings={settings} />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

function makeSettings(overrides: Partial<TenantLandingSettings> = {}): TenantLandingSettings {
  return {
    primary_color: "#1e3a5f",
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
    name: "Lycée Kaloum",
    slug: "lycee-kaloum",
    type: "high",
    is_active: true,
    landing: makeSettings(),
    ...overrides,
  };
}

describe("HighSchoolTemplate — pas de procédure d'admission fabriquée", () => {
  it("n'affiche jamais les pièces requises fabriquées ni le délai de 15 jours inventé", () => {
    renderTemplate(makeTenant(), makeSettings());
    expect(
      screen.queryByText(/Bulletins scolaires des 2 dernières années/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/communiqués par email dans un délai de 15 jours/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Pièces requises")).not.toBeInTheDocument();
    expect(screen.queryByText("Résultats & Notifications")).not.toBeInTheDocument();
    expect(screen.queryByText("Entretien d'admission")).not.toBeInTheDocument();
  });

  it("garde un en-tête Admissions générique et un CTA vers la vraie page d'admission", () => {
    renderTemplate(makeTenant(), makeSettings());
    expect(screen.getByRole("heading", { name: "Admissions" })).toBeInTheDocument();
    const ctas = screen.getAllByRole("link", { name: /Déposer ma candidature/i });
    expect(ctas.length).toBeGreaterThan(0);
    ctas.forEach((cta) => expect(cta).toHaveAttribute("href", "/admissions/lycee-kaloum"));
  });
});
