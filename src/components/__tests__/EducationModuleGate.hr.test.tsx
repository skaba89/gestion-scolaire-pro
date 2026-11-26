/**
 * RH réservée aux comptes non limités (décision 2026-11-25, option A) : l'écran hors périmètre
 * explique pourquoi, seulement pour les ressources humaines.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useEducationModules", () => ({ useEducationModules: () => ({
  isLoading: false, error: null, refetch: vi.fn(), isModuleEnabled: () => true,
  isPathInScope: () => false,
  cycleScope: { restricted: true, cycles: [], pages: { hr: false, library: false, students: true }, cycle_policy_available: true },
}) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { EducationModuleGate } from "../EducationModuleGate";

function visit(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><EducationModuleGate><p>page</p></EducationModuleGate></MemoryRouter>);
}

describe("EducationModuleGate — RH réservée aux comptes non limités", () => {
  it("explique la raison sur l'écran RH", () => {
    visit("/ecole/admin/hr");
    expect(screen.getByText("educationModules.outOfScopeTitle")).toBeInTheDocument();
    expect(screen.getByText("educationModules.outOfScopeHrReason")).toBeInTheDocument();
    expect(screen.queryByText("page")).not.toBeInTheDocument();
  });

  it("n'ajoute pas cette raison aux autres écrans hors périmètre", () => {
    visit("/ecole/admin/library");
    expect(screen.getByText("educationModules.outOfScopeTitle")).toBeInTheDocument();
    expect(screen.queryByText("educationModules.outOfScopeHrReason")).not.toBeInTheDocument();
  });
});
