/**
 * Annuaires (2026-11-25) : chaque modèle d'accueil (4 historiques, 3 premium) mène à la page
 * « Formations et implantations » de l'établissement (/ecole/:slug/offre).
 */
import type { ComponentType } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { DefaultLandingTemplate } from "../DefaultLandingTemplate";
import { HighSchoolTemplate } from "../HighSchoolTemplate";
import { PrimarySchoolTemplate } from "../PrimarySchoolTemplate";
import { UniversityTemplate } from "../UniversityTemplate";
import { CampusPrestigeTemplate } from "@/public-site/templates/campus-prestige/CampusPrestigeTemplate";
import { PrimaryBloomTemplate } from "@/public-site/templates/primary-bloom/PrimaryBloomTemplate";
import { SchoolExcellenceTemplate } from "@/public-site/templates/school-excellence/SchoolExcellenceTemplate";
import { publicOfferPath } from "@/lib/publicOffer";
import type { TenantPublicResponse, TenantLandingSettings } from "@/types/tenant";

vi.mock("@/api/client", () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn() },
}));

const settings: TenantLandingSettings = {
  primary_color: "#1e3a5f", gallery: [], announcements: [], show_stats: true, show_programs: true,
} as TenantLandingSettings;

const tenant: TenantPublicResponse = {
  id: "t1", name: "École Kaloum", slug: "ecole-kaloum", type: "high", is_active: true,
  landing: settings, stats: { student_count: 0, teacher_count: 0 },
} as TenantPublicResponse;

type Template = ComponentType<{ tenant: TenantPublicResponse; settings: TenantLandingSettings }>;
const TEMPLATES: [string, Template][] = [
  ["DefaultLandingTemplate", DefaultLandingTemplate as Template],
  ["HighSchoolTemplate", HighSchoolTemplate as Template],
  ["PrimarySchoolTemplate", PrimarySchoolTemplate as Template],
  ["UniversityTemplate", UniversityTemplate as Template],
  ["CampusPrestigeTemplate", CampusPrestigeTemplate as Template],
  ["PrimaryBloomTemplate", PrimaryBloomTemplate as Template],
  ["SchoolExcellenceTemplate", SchoolExcellenceTemplate as Template],
];

describe("Lien « Formations et implantations » dans chaque modèle d'accueil", () => {
  it.each(TEMPLATES)("%s", (_name, Template) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter><Template tenant={tenant} settings={settings} /></MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>,
    );
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(publicOfferPath("ecole-kaloum"));
    expect(publicOfferPath("ecole-kaloum")).toBe("/ecole/ecole-kaloum/offre");
  });
});
