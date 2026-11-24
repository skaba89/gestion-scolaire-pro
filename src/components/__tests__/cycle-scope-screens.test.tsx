/**
 * Lot B3 (2026-11-23) : écrans d'administration selon le périmètre par cycle.
 * Le serveur décide (GET /education/my-scope/) ; l'interface masque les entrées et affiche
 * un message clair sur un écran hors périmètre au lieu d'une erreur 403.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminPageForPath, isPathInCycleScope, type CycleScope } from "@/lib/education-modules";

const restricted: CycleScope = {
  restricted: true,
  cycles: [{ id: "c1", code: "PRIMAIRE", name: "primaire" }],
  pages: { "": true, students: true, users: false, orders: false, "orders/history": false, documentation: true },
  cycle_policy_available: true,
};
const unrestricted: CycleScope = { restricted: false, cycles: [], pages: null, cycle_policy_available: true };

describe("adminPageForPath", () => {
  it("lit l'écran d'une URL d'administration, avec ou sans établissement", () => {
    expect(adminPageForPath("/ecole/admin/students", restricted.pages!)).toBe("students");
    expect(adminPageForPath("/admin/students/123", restricted.pages!)).toBe("students");
    expect(adminPageForPath("/ecole/admin", restricted.pages!)).toBe("");
    expect(adminPageForPath("/ecole/admin/orders/history?x=1", restricted.pages!)).toBe("orders/history");
  });
  it("ignore les autres portails", () => {
    expect(adminPageForPath("/ecole/teacher/grades", restricted.pages!)).toBeUndefined();
    expect(adminPageForPath("/ecole/department/students", restricted.pages!)).toBeUndefined();
  });
});

describe("isPathInCycleScope", () => {
  it("ne masque rien à un compte non restreint ni sans réponse du serveur", () => {
    expect(isPathInCycleScope("/ecole/admin/users", unrestricted)).toBe(true);
    expect(isPathInCycleScope("/ecole/admin/users", undefined)).toBe(true);
  });
  it("suit la décision du serveur pour un compte restreint", () => {
    expect(isPathInCycleScope("/ecole/admin/students", restricted)).toBe(true);
    expect(isPathInCycleScope("/ecole/admin/users", restricted)).toBe(false);
    expect(isPathInCycleScope("/ecole/admin/orders/history", restricted)).toBe(false);
    expect(isPathInCycleScope("/ecole/admin", restricted)).toBe(true);
  });
  it("refuse un écran que le serveur ne connaît pas (échec fermé)", () => {
    expect(isPathInCycleScope("/ecole/admin/nouvel-ecran", restricted)).toBe(false);
  });
  it("ne touche pas aux portails hors administration", () => {
    expect(isPathInCycleScope("/ecole/department/students", restricted)).toBe(true);
  });
});

const hook = vi.hoisted(() => ({ inScope: true }));
vi.mock("@/hooks/useEducationModules", () => ({ useEducationModules: () => ({
  isLoading: false, error: null, refetch: vi.fn(),
  isModuleEnabled: () => true, isPathEnabled: () => true, isPathInScope: () => hook.inScope,
}) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { EducationModuleGate } from "@/components/EducationModuleGate";

describe("garde des écrans", () => {
  beforeEach(() => { hook.inScope = true; });
  it("affiche un message clair sur un écran hors périmètre, sans monter la page", () => {
    hook.inScope = false;
    render(<MemoryRouter initialEntries={["/ecole/admin/users"]}><EducationModuleGate><p>Liste des comptes</p></EducationModuleGate></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("educationModules.outOfScopeTitle");
    expect(screen.queryByText("Liste des comptes")).toBeNull();
  });
  it("affiche l'écran dans le périmètre", () => {
    render(<MemoryRouter initialEntries={["/ecole/admin/students"]}><EducationModuleGate><p>Liste des élèves</p></EducationModuleGate></MemoryRouter>);
    expect(screen.getByText("Liste des élèves")).toBeVisible();
  });
});
