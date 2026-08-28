/**
 * Smoke test for the Primary Bloom template — renders with a realistic
 * tenant/settings fixture and confirms it doesn't crash and shows real
 * (not fabricated) content only where data actually exists. Same
 * conventions as SchoolExcellenceTemplate.test.tsx /
 * CampusPrestigeTemplate.test.tsx.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { PrimaryBloomTemplate } from "../PrimaryBloomTemplate";
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
          <PrimaryBloomTemplate tenant={tenant} settings={settings} />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

function makeSettings(overrides: Partial<TenantLandingSettings> = {}): TenantLandingSettings {
  return {
    primary_color: "#d9622f",
    gallery: [],
    announcements: [],
    features: [],
    show_stats: true,
    show_programs: true,
    show_gallery: true,
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

describe("PrimaryBloomTemplate", () => {
  it("renders the tenant name in the hero without crashing", () => {
    renderTemplate(makeTenant(), makeSettings());
    expect(screen.getAllByText("École Les Colibris").length).toBeGreaterThan(0);
  });

  it("does not render a stats section when no real stats exist (no fabricated data)", () => {
    renderTemplate(makeTenant({ stats: undefined, programs: undefined }), makeSettings());
    expect(screen.queryByText("Notre école en chiffres")).not.toBeInTheDocument();
  });

  it("renders real stats when the tenant has them", () => {
    renderTemplate(
      makeTenant({ stats: { student_count: 180, teacher_count: 12 } }),
      makeSettings(),
    );
    expect(screen.getByText("Notre école en chiffres")).toBeInTheDocument();
    expect(screen.getByText("180")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("never shows a fabricated '20+' years-of-experience fallback", () => {
    renderTemplate(
      makeTenant({ stats: { student_count: 180, teacher_count: 12 } }),
      makeSettings({ founded_year: undefined }),
    );
    expect(screen.queryByText("20+")).not.toBeInTheDocument();
    expect(screen.queryByText("ans d'expérience")).not.toBeInTheDocument();
  });

  it("renders real classes as programs items, not fabricated CP/CE1/CE2/CM1/CM2", () => {
    renderTemplate(makeTenant({ programs: ["CP-A", "CE1-B"] }), makeSettings());
    // "Nos classes" also appears as a nav link (always present) — check
    // the section heading specifically.
    expect(screen.getByRole("heading", { name: "Nos classes" })).toBeInTheDocument();
    expect(screen.getByText("CP-A")).toBeInTheDocument();
    expect(screen.getByText("CE1-B")).toBeInTheDocument();
  });

  it("does not render the classes/school-life/gallery/news sections when there is no real data", () => {
    renderTemplate(makeTenant({ programs: [] }), makeSettings({ features: [], gallery: [], announcements: [] }));
    // "Nos classes" / "Infos pour les parents" remain as nav links
    // (always present) — check for the section headings specifically.
    expect(screen.queryByRole("heading", { name: "Nos classes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "La vie à l'école" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "En images" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Infos pour les parents" })).not.toBeInTheDocument();
  });

  it("renders real settings.features as school-life items, not fabricated activity cards", () => {
    renderTemplate(makeTenant(), makeSettings({ features: ["Cantine bio", "Étude surveillée"] }));
    expect(screen.getByText("La vie à l'école")).toBeInTheDocument();
    expect(screen.getByText("Cantine bio")).toBeInTheDocument();
    expect(screen.getByText("Étude surveillée")).toBeInTheDocument();
    expect(screen.queryByText("Sport & EPS")).not.toBeInTheDocument();
  });

  it("renders real announcements as news items", () => {
    renderTemplate(
      makeTenant(),
      makeSettings({
        announcements: [{ id: "a1", title: "Réunion parents-professeurs", body: "Le 10 septembre", date: "2026-09-10", is_pinned: false }],
      }),
    );
    expect(screen.getByText("Réunion parents-professeurs")).toBeInTheDocument();
  });

  it("always renders the pré-inscription CTA and contact form regardless of data availability", () => {
    renderTemplate(makeTenant(), makeSettings());
    expect(screen.getByText("Prêt à nous rejoindre ?")).toBeInTheDocument();
    expect(screen.getByText("Nous contacter")).toBeInTheDocument();
  });
});
