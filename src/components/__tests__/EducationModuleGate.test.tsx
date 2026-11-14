import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EducationModuleGate } from "@/components/EducationModuleGate";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { moduleForPage } from "@/lib/education-modules";

const state = vi.hoisted(() => ({ loading: false, error: null as Error | null, enabled: false, refetch: vi.fn() }));
vi.mock("@/hooks/useEducationModules", () => ({ useEducationModules: () => ({
  isLoading: state.loading, error: state.error, refetch: state.refetch,
  isModuleEnabled: () => state.enabled, isPathEnabled: (path: string) => !moduleForPage(path) || state.enabled,
}) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "a", slug: "ecole" } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const visit = (path = "/ecole/admin/library") => render(<MemoryRouter initialEntries={[path]}><EducationModuleGate><p>Contenu privé bibliothèque</p></EducationModuleGate></MemoryRouter>);

describe("pages et navigation mobiles selon la politique", () => {
  beforeEach(() => { state.loading = false; state.error = null; state.enabled = false; });
  it("bloque une URL directe désactivée sans monter la page", () => {
    visit();
    expect(screen.getByRole("alert")).toHaveTextContent("educationModules.disabledTitle");
    expect(screen.queryByText("Contenu privé bibliothèque")).toBeNull();
  });
  it("échoue fermé en chargement et en erreur", () => {
    state.loading = true;
    const view = visit();
    expect(screen.getByRole("status")).toBeVisible();
    view.unmount(); state.loading = false; state.error = new Error("offline");
    visit();
    expect(screen.getByRole("alert")).toHaveTextContent("educationModules.loadError");
    expect(screen.queryByText("Contenu privé bibliothèque")).toBeNull();
  });
  it("laisse accéder au socle et aux pages activées", () => {
    const view = visit("/ecole/admin/settings");
    expect(screen.getByText("Contenu privé bibliothèque")).toBeVisible();
    view.unmount(); state.enabled = true; visit();
    expect(screen.getByText("Contenu privé bibliothèque")).toBeVisible();
  });
  it("retire aussi le lien de la barre mobile", () => {
    const Icon = () => <span />;
    render(<MemoryRouter><MobileBottomNav items={[
      { href: "/ecole/admin/library", label: "Bibliothèque", icon: Icon },
      { href: "/ecole/admin/settings", label: "Réglages", icon: Icon },
    ]} /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Bibliothèque" })).toBeNull();
    expect(screen.getByRole("link", { name: "Réglages" })).toBeVisible();
  });
});
