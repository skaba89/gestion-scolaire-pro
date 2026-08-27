/**
 * Smoke test for the Campus Prestige template — renders with a
 * realistic tenant/settings fixture and confirms it doesn't crash and
 * shows real (not fabricated) content only where data actually exists,
 * including the university-specific "Facultés & Départements" section
 * (from tenant.departments — untyped on TenantPublicResponse, same
 * pattern the legacy UniversityTemplate.tsx already relies on).
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { CampusPrestigeTemplate } from "../CampusPrestigeTemplate";
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
          <CampusPrestigeTemplate tenant={tenant} settings={settings} />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

function makeSettings(overrides: Partial<TenantLandingSettings> = {}): TenantLandingSettings {
  return {
    primary_color: "#4a1023",
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
    name: "Université La Source",
    slug: "universite-la-source",
    type: "UNIVERSITY",
    is_active: true,
    landing: makeSettings(),
    ...overrides,
  };
}

describe("CampusPrestigeTemplate", () => {
  it("renders the tenant name in the hero without crashing", () => {
    renderTemplate(makeTenant(), makeSettings());
    expect(screen.getAllByText("Université La Source").length).toBeGreaterThan(0);
  });

  it("does not render a stats section when no real stats exist (no fabricated data)", () => {
    renderTemplate(makeTenant({ stats: undefined, programs: undefined, departments: undefined }), makeSettings());
    expect(screen.queryByText("Chiffres clés")).not.toBeInTheDocument();
  });

  it("renders real stats, including a department count, when the tenant has them", () => {
    renderTemplate(
      makeTenant({
        stats: { student_count: 3200, teacher_count: 180 },
        departments: [{ id: "d1", name: "Faculté de Droit" }, { id: "d2", name: "Faculté des Sciences" }],
      }),
      makeSettings(),
    );
    expect(screen.getByText("Chiffres clés")).toBeInTheDocument();
    expect(screen.getByText("3200+")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // department count
  });

  it("renders real departments as a dedicated section, distinct from programs", () => {
    renderTemplate(
      makeTenant({
        programs: ["Licence Droit"],
        departments: [{ id: "d1", name: "Faculté de Droit", description: "Formation juridique complète" }],
      }),
      makeSettings(),
    );
    expect(screen.getByText("Nos formations")).toBeInTheDocument();
    expect(screen.getByText("Licence Droit")).toBeInTheDocument();
    expect(screen.getByText("Facultés & Départements")).toBeInTheDocument();
    expect(screen.getByText("Faculté de Droit")).toBeInTheDocument();
    expect(screen.getByText("Formation juridique complète")).toBeInTheDocument();
  });

  it("ignores malformed department entries without a name instead of crashing", () => {
    renderTemplate(
      makeTenant({ departments: [{ id: "d1" } as unknown as { name: string }] }),
      makeSettings(),
    );
    expect(screen.queryByText("Facultés & Départements")).not.toBeInTheDocument();
  });

  it("does not render formations/campus/actualités sections when there is no real data", () => {
    renderTemplate(makeTenant({ programs: [], departments: [] }), makeSettings({ gallery: [], announcements: [] }));
    expect(screen.queryByText("Nos formations")).not.toBeInTheDocument();
    expect(screen.queryByText("Facultés & Départements")).not.toBeInTheDocument();
    expect(screen.queryByText("Le campus")).not.toBeInTheDocument();
  });

  it("always renders the admissions CTA and contact form regardless of data availability", () => {
    renderTemplate(makeTenant(), makeSettings());
    expect(screen.getByText("Prêt à nous rejoindre ?")).toBeInTheDocument();
    expect(screen.getByText("Nous contacter")).toBeInTheDocument();
  });
});
