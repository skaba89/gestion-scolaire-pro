import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/common/EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="Aucun résultat" />);
    expect(screen.getByText("Aucun résultat")).toBeTruthy();
  });

  it("renders description when provided", () => {
    render(<EmptyState title="Titre" description="Aucun élément trouvé pour ce filtre." />);
    expect(screen.getByText("Aucun élément trouvé pour ce filtre.")).toBeTruthy();
  });

  it("does not render description when omitted", () => {
    render(<EmptyState title="Titre" />);
    expect(screen.queryByText(/filtre/)).toBeNull();
  });

  it("renders action slot when provided", () => {
    render(
      <EmptyState
        title="Titre"
        action={<button>Créer</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Créer" })).toBeTruthy();
  });

  it("renders icon when provided", () => {
    render(
      <EmptyState
        title="Titre"
        icon={<span data-testid="test-icon">●</span>}
      />
    );
    expect(screen.getByTestId("test-icon")).toBeTruthy();
  });

  it("applies custom className", () => {
    const { container } = render(
      <EmptyState title="Titre" className="custom-class" />
    );
    expect(container.firstChild).toHaveProperty("className");
  });
});
