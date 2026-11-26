/**
 * Traduction des modèles premium (sous-lot T3, 2026-11-26) : chaque modèle et ses sections
 * s'affichent en anglais sans clé brute ; le contenu saisi par l'établissement n'est pas traduit.
 */
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/i18n/config";
import { CampusPrestigeTemplate } from "../campus-prestige/CampusPrestigeTemplate";
import { PrimaryBloomTemplate } from "../primary-bloom/PrimaryBloomTemplate";
import { SchoolExcellenceTemplate } from "../school-excellence/SchoolExcellenceTemplate";
import type { TenantPublicResponse, TenantLandingSettings } from "@/types/tenant";

vi.mock("@/api/client", () => ({ apiClient: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn() } }));

const settings = { primary_color: "#1e3a5f", gallery: [], announcements: [], show_stats: true, show_programs: true,
  tagline: "Notre devise maison" } as TenantLandingSettings;
const tenant = { id: "t1", name: "École Kaloum", slug: "ek", type: "high", is_active: true, landing: settings,
  stats: { student_count: 120, teacher_count: 12 }, programs: [{ id: "p1", name: "Seconde S" }] } as unknown as TenantPublicResponse;

type Template = ComponentType<{ tenant: TenantPublicResponse; settings: TenantLandingSettings }>;
const TEMPLATES: [string, Template, string][] = [
  ["CampusPrestigeTemplate", CampusPrestigeTemplate as Template, "Our programs"],
  ["PrimaryBloomTemplate", PrimaryBloomTemplate as Template, "Our school in figures"],
  ["SchoolExcellenceTemplate", SchoolExcellenceTemplate as Template, "Our tracks"],
];

describe("Modèles premium — traduction", () => {
  afterEach(async () => { await i18n.changeLanguage("fr"); });

  it.each(TEMPLATES)("%s en anglais", async (_name, Template, english) => {
    await i18n.changeLanguage("en");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <HelmetProvider><QueryClientProvider client={client}><MemoryRouter>
        <Template tenant={tenant} settings={settings} />
      </MemoryRouter></QueryClientProvider></HelmetProvider>,
    );
    expect(screen.getAllByText(english).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ready to join us?").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/(siteTemplates|siteSections)\.[a-zA-Z]/);
    expect(document.body.textContent).toContain("Notre devise maison"); // contenu de l'école : jamais traduit
    expect(document.body.textContent).not.toContain("Prêt à nous rejoindre");
  });
});
