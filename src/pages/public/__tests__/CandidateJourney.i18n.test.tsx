/**
 * Traduction du parcours candidat (site public, sous-lot T1, 2026-11-25) : chaque page s'affiche en
 * anglais sans clé brute, et le français reste celui d'avant (textes de référence inchangés).
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import i18n from "@/i18n/config";

const tenant = {
  id: "t1", name: "Lycée de Kaloum", slug: "lk", type: "high_school", is_active: true,
  email: "contact@lk.gn", phone: "+224620000000", address: "Kaloum", landing: {},
  stats: { student_count: 0, teacher_count: 0 },
};
const tenantInfo = {
  id: "t1", name: "Lycée de Kaloum", type: "high_school", email: "contact@lk.gn", phone: "", address: "", website: "",
  country: "GN", admissions_open: true, levels: [{ id: "l1", name: "Seconde", description: "" }],
  current_academic_year: { id: "y1", name: "2026-2027", start_date: "", end_date: "" },
};

const { apiGet, axiosGet } = vi.hoisted(() => ({ apiGet: vi.fn(), axiosGet: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get: apiGet, post: vi.fn() } }));
vi.mock("axios", () => ({ default: { get: axiosGet, post: vi.fn() } }));
vi.mock("@/hooks/usePublicTenant", () => ({
  usePublicTenant: () => ({ data: tenant, isLoading: false, isError: false }),
}));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { type: "high" } }) }));

import AdmissionInfo from "../AdmissionInfo";
import AdmissionForm from "../AdmissionForm";
import EnrollmentHub from "../EnrollmentHub";
import ApplicationStatus from "../ApplicationStatus";
import ReEnrollment from "../ReEnrollment";
import Contact from "../Contact";

function renderAt(path: string, route: string, element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={element} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PAGES: [string, string, string, ReactNode, string, string][] = [
  // nom, chemin, route, page, texte français attendu, texte anglais attendu
  ["AdmissionInfo", "/info/lk", "/info/:tenantSlug", <AdmissionInfo />, "Processus d'Admission", "Admission process"],
  ["AdmissionForm", "/admissions/lk", "/admissions/:tenantSlug", <AdmissionForm />, "Informations du Parent/Tuteur", "Parent/Guardian information"],
  ["EnrollmentHub", "/inscription/lk", "/inscription/:tenantSlug", <EnrollmentHub />, "Portail d'inscription en ligne", "Online enrollment portal"],
  ["ApplicationStatus", "/inscription/lk/statut", "/inscription/:tenantSlug/statut", <ApplicationStatus />, "Suivi de candidature", "Application tracking"],
  ["ReEnrollment", "/inscription/lk/reinscription", "/inscription/:tenantSlug/reinscription", <ReEnrollment />, "Vérifier mon identité", "Verify my identity"],
  ["Contact", "/contact/lk", "/contact/:tenantSlug", <Contact />, "Envoyez-nous un message", "Send us a message"],
];

describe("Parcours candidat — traduction", () => {
  beforeEach(() => {
    apiGet.mockImplementation((url: string) => Promise.resolve({ data: url.includes("/levels/") ? [] : url.includes("academic-years") ? null : tenant }));
    axiosGet.mockResolvedValue({ data: tenantInfo });
  });
  afterEach(async () => { await i18n.changeLanguage("fr"); });

  it.each(PAGES)("%s : français inchangé, anglais sans clé brute", async (_name, path, route, page, fr, en) => {
    await i18n.changeLanguage("fr");
    const { unmount } = renderAt(path, route, page);
    await waitFor(() => expect(screen.getByText(fr)).toBeInTheDocument());
    unmount();

    await i18n.changeLanguage("en");
    renderAt(path, route, page);
    await waitFor(() => expect(screen.getByText(en)).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/publicJourney\./);
    expect(screen.queryByText(fr)).not.toBeInTheDocument();
  });
});
