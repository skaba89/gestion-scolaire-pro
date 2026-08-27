/**
 * Smoke test for the School Excellence template — renders with a
 * realistic tenant/settings fixture and confirms it doesn't crash and
 * shows real (not fabricated) content only where data actually exists.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SchoolExcellenceTemplate } from "../SchoolExcellenceTemplate";
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
          <SchoolExcellenceTemplate tenant={tenant} settings={settings} />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

function makeSettings(overrides: Partial<TenantLandingSettings> = {}): TenantLandingSettings {
  return {
    primary_color: "#12263a",
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
    name: "Lycée La Réussite",
    slug: "lycee-la-reussite",
    type: "HIGH_SCHOOL",
    is_active: true,
    landing: makeSettings(),
    ...overrides,
  };
}

describe("SchoolExcellenceTemplate", () => {
  it("renders the tenant name in the hero without crashing", () => {
    renderTemplate(makeTenant(), makeSettings());
    expect(screen.getAllByText("Lycée La Réussite").length).toBeGreaterThan(0);
  });

  it("does not render a stats section when no real stats exist (no fabricated data)", () => {
    renderTemplate(makeTenant({ stats: undefined, programs: undefined }), makeSettings());
    expect(screen.queryByText("Chiffres clés")).not.toBeInTheDocument();
  });

  it("renders real stats when the tenant has them", () => {
    renderTemplate(
      makeTenant({ stats: { student_count: 450, teacher_count: 32 } }),
      makeSettings(),
    );
    expect(screen.getByText("Chiffres clés")).toBeInTheDocument();
    expect(screen.getByText("450+")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
  });

  it("renders real announcements as news items, not fabricated ones", () => {
    renderTemplate(
      makeTenant(),
      makeSettings({
        announcements: [{ id: "a1", title: "Journée portes ouvertes", body: "Venez nous rencontrer", date: "2026-09-15", is_pinned: false }],
      }),
    );
    expect(screen.getByText("Journée portes ouvertes")).toBeInTheDocument();
  });

  it("does not render programs/gallery/news sections when there is no real data", () => {
    // "Actualités" itself isn't checked here: the navbar always shows it
    // as an in-page anchor link (same convention as the legacy templates),
    // independent of whether there's real news content to jump to.
    renderTemplate(makeTenant({ programs: [] }), makeSettings({ gallery: [], announcements: [] }));
    expect(screen.queryByText("Nos filières")).not.toBeInTheDocument();
    expect(screen.queryByText("Vie scolaire en images")).not.toBeInTheDocument();
  });

  it("always renders the admissions CTA and contact form regardless of data availability", () => {
    renderTemplate(makeTenant(), makeSettings());
    expect(screen.getByText("Prêt à nous rejoindre ?")).toBeInTheDocument();
    expect(screen.getByText("Nous contacter")).toBeInTheDocument();
  });
});
