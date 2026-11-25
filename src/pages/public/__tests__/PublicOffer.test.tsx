/**
 * Annuaires (2026-11-25) : page « Formations et implantations » d'un établissement.
 */
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockUsePublicTenant } = vi.hoisted(() => ({ mockUsePublicTenant: vi.fn() }));
vi.mock("@/hooks/usePublicTenant", () => ({ usePublicTenant: mockUsePublicTenant }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));

import PublicOffer from "../PublicOffer";

function renderOffer() {
  return render(
    <MemoryRouter initialEntries={["/ecole/uls/offre"]}>
      <Routes><Route path="/ecole/:tenantSlug/offre" element={<PublicOffer />} /></Routes>
    </MemoryRouter>,
  );
}

const base = { id: "t1", name: "Université La Source", slug: "uls", type: "university", is_active: true,
  landing: {}, stats: { student_count: 0, teacher_count: 0 } };

describe("PublicOffer", () => {
  it("affiche cycles, filières, facultés et campus publiés de l'établissement demandé", () => {
    mockUsePublicTenant.mockReturnValue({ isLoading: false, isError: false, data: {
      ...base,
      cycles: [{ id: "c1", name: "Licence", levels: [{ id: "l1", name: "L1" }, { id: "l2", name: "L2" }] }],
      programs_detail: [{ id: "p1", name: "Informatique", description: "Réseaux et logiciels" }],
      faculties: [{ id: "f1", name: "Faculté des sciences", departments: [{ id: "d1", name: "Mathématiques" }] }],
      campuses: [{ id: "k1", name: "Campus Kaloum", address: "Kaloum", phone: "+224620000001", is_main: true }],
    } });
    renderOffer();
    expect(mockUsePublicTenant).toHaveBeenCalledWith("uls");
    expect(screen.getByRole("heading", { level: 1, name: "Université La Source" })).toBeInTheDocument();
    expect(screen.getByText("L1 · L2")).toBeInTheDocument();
    expect(screen.getByText("Informatique")).toBeInTheDocument();
    expect(screen.getByText("Mathématiques")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+224620000001" })).toHaveAttribute("href", "tel:+224620000001");
    expect(screen.getByRole("link", { name: "publicOffer.programsDetail" })).toHaveAttribute("href", "/programmes/uls");
  });

  it("sans offre publiée : message explicite, aucune section vide", () => {
    mockUsePublicTenant.mockReturnValue({ isLoading: false, isError: false, data: { ...base } });
    renderOffer();
    expect(screen.getByText("publicOffer.empty")).toBeInTheDocument();
    expect(screen.queryByText("publicOffer.campuses")).not.toBeInTheDocument();
  });

  it("établissement inconnu : page introuvable avec retour à l'annuaire", () => {
    mockUsePublicTenant.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    renderOffer();
    expect(screen.getByText("publicOffer.notFound")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "publicOffer.backToDirectory" })).toHaveAttribute("href", "/annuaire");
  });
});
