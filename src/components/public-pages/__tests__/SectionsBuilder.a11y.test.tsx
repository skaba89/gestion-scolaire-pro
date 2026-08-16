/**
 * Audit finding (round 2, Low): the 7 icon-only reorder/edit/delete
 * buttons in the widget list (section-level and item-level) had no
 * accessible name — a screen reader announced them only as "button",
 * indistinguishable from each other. Each now carries an explicit
 * aria-label; these tests confirm that survives (and stays scoped to the
 * right button) rather than re-checking icon rendering, already implicit.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SectionsBuilder } from "@/components/public-pages/SectionsBuilder";
import type { PublicPageSection } from "@/hooks/usePublicPages";

const TWO_SECTIONS: PublicPageSection[] = [
  { type: "text", content: "Bonjour" },
  { type: "text", content: "Au revoir" },
];

describe("SectionsBuilder — icon-only buttons have accessible names", () => {
  it("labels the section-level move/edit/delete buttons", () => {
    render(<SectionsBuilder sections={TWO_SECTIONS} onChange={vi.fn()} />);

    // Two sections → two of each button; getAllByRole confirms every
    // instance carries the label, not just the first.
    expect(screen.getAllByRole("button", { name: "Déplacer le widget vers le haut" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Déplacer le widget vers le bas" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Modifier ce widget" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Supprimer ce widget" })).toHaveLength(2);
  });

  it("disables (but still labels) the first section's move-up and the last section's move-down button", () => {
    render(<SectionsBuilder sections={TWO_SECTIONS} onChange={vi.fn()} />);

    const moveUpButtons = screen.getAllByRole("button", { name: "Déplacer le widget vers le haut" });
    const moveDownButtons = screen.getAllByRole("button", { name: "Déplacer le widget vers le bas" });
    expect(moveUpButtons[0]).toBeDisabled();
    expect(moveDownButtons[moveDownButtons.length - 1]).toBeDisabled();
  });
});
