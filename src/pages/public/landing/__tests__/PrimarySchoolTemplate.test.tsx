/**
 * Audit templates de site public (2026-08-28) : PrimarySchoolTemplate
 * affichait des données entièrement fabriquées et présentées comme
 * réelles quand le tenant n'avait pas de vraie donnée équivalente —
 * DEFAULT_CLASS_LEVELS (CP/CE1/CE2/CM1/CM2 générique) en repli pour la
 * section "Nos Classes", ACTIVITY_CARDS (Sport & EPS, Art & Créativité,
 * Sciences & Découvertes, Musique & Chant) inconditionnellement dans
 * "La vie à l'école", et un repli fixe "20+" pour la stat "ans
 * d'expérience". Ce test verrouille que ces sections ne s'affichent
 * plus que lorsqu'une vraie donnée existe.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { PrimarySchoolTemplate } from "../PrimarySchoolTemplate";
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
          <PrimarySchoolTemplate tenant={tenant} settings={settings} />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

function makeSettings(overrides: Partial<TenantLandingSettings> = {}): TenantLandingSettings {
  return {
    primary_color: "#f97316",
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
    name: "École Les Colibris",
    slug: "ecole-les-colibris",
    type: "primary",
    is_active: true,
    landing: makeSettings(),
    ...overrides,
  };
}

describe("PrimarySchoolTemplate — pas de données fabriquées", () => {
  it("n'affiche pas de classes fabriquées (CP/CE1/CE2/CM1/CM2) quand tenant.programs est vide", () => {
    renderTemplate(makeTenant({ programs: [] }), makeSettings());
    expect(screen.queryByText("Nos Classes")).not.toBeInTheDocument();
    expect(screen.queryByText("CP")).not.toBeInTheDocument();
    expect(screen.queryByText("CM2")).not.toBeInTheDocument();
  });

  it("affiche les vraies classes quand tenant.programs en contient", () => {
    renderTemplate(makeTenant({ programs: ["Maternelle", "CP-CE1"] }), makeSettings());
    expect(screen.getByText("Nos Classes")).toBeInTheDocument();
    expect(screen.getByText("Maternelle")).toBeInTheDocument();
    expect(screen.getByText("CP-CE1")).toBeInTheDocument();
  });

  it("n'affiche jamais les activités fabriquées (Sport & EPS, Art & Créativité...)", () => {
    renderTemplate(makeTenant(), makeSettings({ features: [] }));
    expect(screen.queryByText("Sport & EPS")).not.toBeInTheDocument();
    expect(screen.queryByText("Art & Créativité")).not.toBeInTheDocument();
    expect(screen.queryByText("Sciences & Découvertes")).not.toBeInTheDocument();
    expect(screen.queryByText("Musique & Chant")).not.toBeInTheDocument();
    expect(screen.queryByText("La vie à l'école")).not.toBeInTheDocument();
  });

  it("affiche les vraies activités (settings.features) quand elles existent", () => {
    renderTemplate(makeTenant(), makeSettings({ features: ["Cantine bio", "Étude surveillée"] }));
    expect(screen.getByText("La vie à l'école")).toBeInTheDocument();
    expect(screen.getByText("Cantine bio")).toBeInTheDocument();
    expect(screen.getByText("Étude surveillée")).toBeInTheDocument();
  });

  it("n'affiche jamais le repli fabriqué '20+' pour les années d'expérience", () => {
    renderTemplate(
      makeTenant({ stats: { student_count: 120, teacher_count: 8 } }),
      makeSettings({ founded_year: undefined }),
    );
    expect(screen.queryByText("20+")).not.toBeInTheDocument();
    expect(screen.queryByText("ans d'expérience")).not.toBeInTheDocument();
  });

  it("affiche le vrai nombre d'années quand founded_year est renseigné", () => {
    const currentYear = new Date().getFullYear();
    renderTemplate(
      makeTenant({ stats: { student_count: 120, teacher_count: 8 } }),
      makeSettings({ founded_year: currentYear - 15 }),
    );
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("ans d'expérience")).toBeInTheDocument();
  });
});
