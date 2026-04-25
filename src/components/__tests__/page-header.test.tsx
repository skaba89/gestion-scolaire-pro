import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("PageHeader", () => {
  it("renders the title", () => {
    render(<PageHeader title="Gestion des étudiants" />, { wrapper: Wrapper });
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByText("Gestion des étudiants")).toBeTruthy();
  });

  it("renders a badge when provided", () => {
    render(<PageHeader title="Titre" badge="Beta" />, { wrapper: Wrapper });
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("renders description when provided", () => {
    render(
      <PageHeader title="Titre" description="Description de la page" />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Description de la page")).toBeTruthy();
  });

  it("renders breadcrumbs with links", () => {
    render(
      <PageHeader
        title="Titre"
        breadcrumbs={[
          { label: "Accueil", href: "/" },
          { label: "Étudiants", href: "/students" },
          { label: "Détail" },
        ]}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Accueil")).toBeTruthy();
    expect(screen.getByText("Étudiants")).toBeTruthy();
    expect(screen.getByText("Détail")).toBeTruthy();
  });

  it("renders actions slot", () => {
    render(
      <PageHeader
        title="Titre"
        actions={<button>Créer</button>}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByRole("button", { name: "Créer" })).toBeTruthy();
  });

  it("renders without optional props", () => {
    render(<PageHeader title="Minimal" />, { wrapper: Wrapper });
    expect(screen.getByText("Minimal")).toBeTruthy();
  });
});
