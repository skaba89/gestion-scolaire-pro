import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BadgeCard } from "../BadgeCard";
import type { BadgeDefinition } from "@/lib/badges-types";

const badge = {
  id: "b1",
  tenant_id: "t1",
  badge_type: "achievement",
  badge_template: "default",
  name: "Assiduité exemplaire",
  description: "Aucune absence ce trimestre",
  icon_url: null,
  color_primary: "#2563eb",
  color_secondary: "#1e40af",
  rarity: "rare",
  requirements: {},
  is_active: true,
  sort_order: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as unknown as BadgeDefinition;

describe("BadgeCard", () => {
  it("renders its rarity tag (used <Badge> without importing it: ReferenceError)", () => {
    render(<BadgeCard badge={badge} />);
    expect(screen.getByText("Assiduité exemplaire")).toBeInTheDocument();
    expect(screen.getByText("rare")).toBeInTheDocument();
  });
});
