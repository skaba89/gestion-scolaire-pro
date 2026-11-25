/**
 * Page « Informations d'admission » (2026-11-25) : ne promettre que ce qui existe. Plus de délai
 * inventé, plus de chèque, plus d'e-mail de décision ou de confirmation (aucun n'est envoyé :
 * ADMISSION-EMAIL-PROMISE-01) ; mêmes pièces que le formulaire ; état réel des inscriptions.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import i18n from "@/i18n/config";
import { BASE_REQUIRED_DOCUMENTS, TRANSFER_REQUIRED_DOCUMENTS } from "@/lib/admissionDocuments";

const tenant = { id: "t1", name: "Lycée de Kaloum", slug: "lk", type: "high_school", is_active: true, landing: {},
  stats: { student_count: 0, teacher_count: 0 } };
const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get: apiGet, post: vi.fn() } }));
vi.mock("@/hooks/usePublicTenant", () => ({ usePublicTenant: () => ({ data: tenant, isLoading: false }) }));

import AdmissionInfo from "../AdmissionInfo";

function renderInfo(admissionsOpen: boolean) {
  apiGet.mockResolvedValue({ data: { admissions_open: admissionsOpen, levels: [], current_academic_year: null } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><MemoryRouter initialEntries={["/info/lk"]}>{children}</MemoryRouter></QueryClientProvider>
  );
  return render(<Routes><Route path="/info/:tenantSlug" element={<AdmissionInfo />} /></Routes>, { wrapper });
}

describe("Informations d'admission — aucune promesse inventée", () => {
  beforeEach(async () => { apiGet.mockReset(); await i18n.changeLanguage("fr"); });
  afterEach(async () => { await i18n.changeLanguage("fr"); });

  it("liste exactement les pièces exigées par le formulaire, sans délai ni chèque ni e-mail promis", async () => {
    renderInfo(true);
    await waitFor(() => expect(screen.getByText("Documents Requis")).toBeInTheDocument());
    for (const doc of [...BASE_REQUIRED_DOCUMENTS, ...TRANSFER_REQUIRED_DOCUMENTS]) {
      expect(screen.getByText(i18n.t(doc.label))).toBeInTheDocument();
    }
    expect(screen.queryByText(/vaccination/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/domicile/i)).not.toBeInTheDocument();
    const forbidden = /5 à 10|chèque|virement|notifié par email|notification par email/i;
    expect(document.body.textContent ?? "").not.toMatch(forbidden);
    // FAQ (accordéon à une seule réponse ouverte) : chaque réponse, une par une.
    const questions = ["Quand puis-je soumettre ma candidature ?", "Combien de temps prend l'examen du dossier ?",
      "Puis-je modifier ma candidature après soumission ?", "Quels sont les modes de paiement acceptés ?"];
    const triggers = questions.map((q) => screen.getByText(q));
    for (const trigger of triggers) {
      fireEvent.click(trigger);
      expect(document.body.textContent ?? "").not.toMatch(forbidden);
    }
    fireEvent.click(screen.getByText("Quand puis-je soumettre ma candidature ?"));
    await waitFor(() => expect(screen.getByText(/inscriptions sont actuellement ouvertes/)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Suivre mon dossier" })).toHaveAttribute("href", "/inscription/lk/statut");
  });

  it("annonce des inscriptions fermées quand l'établissement les a fermées", async () => {
    renderInfo(false);
    await waitFor(() => expect(screen.getByText("Questions Fréquentes")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Quand puis-je soumettre ma candidature ?"));
    await waitFor(() => expect(screen.getByText(/inscriptions sont actuellement fermées/)).toBeInTheDocument());
  });

  it("l'écran de confirmation annonce l'accusé de réception (réellement envoyé depuis le 2026-11-25)", () => {
    for (const lang of ["fr", "en", "es", "ar", "zh"]) {
      const text = i18n.getResource(lang, "translation", "publicJourney.form.successText") as string;
      expect(text, lang).not.toMatch(/confirmation|confirm|确认|تأكيد/i);
      expect(text, lang).toContain("{{email}}");
    }
    expect(i18n.getResource("fr", "translation", "publicJourney.form.successText")).toMatch(/accusé de réception/);
  });
});
