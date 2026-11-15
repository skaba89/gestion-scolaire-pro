import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));

vi.mock("@/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/useTerminology", () => ({ useTerminology: () => ({ levelLabel: "Niveau" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => ({
      "academicRules.save": "Enregistrer",
      "academicRules.cycleRulesTitle": "Règles propres à un cycle",
      "academicRules.archivedCycle": "cycle archivé",
    } as Record<string, string>)[key] ?? values?.name ?? key,
  }),
}));

import AcademicRules from "../AcademicRules";

const rules = (passing: number) => ({
  passing_grade: passing,
  mentions: [
    { label: "Assez Bien", min: 13 },
    { label: "Bien", min: 15 },
    { label: "Très Bien", min: 17 },
    { label: "Excellent", min: 19 },
  ],
});

const response = {
  defaults: rules(10),
  mention_labels: ["Assez Bien", "Bien", "Très Bien", "Excellent"],
  default: null,
  cycles: [{
    cycle_id: "cycle-a", cycle_name: "Collège", cycle_code: "COL",
    is_active: true, rules: rules(12),
  }],
  levels: [],
  available_cycles: [{ id: "cycle-a", code: "COL", name: "Collège", is_active: true }],
  available_levels: [{ id: "level-a", name: "7e", cycle_id: "cycle-a" }],
};

describe("règles académiques par cycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: response });
    api.put.mockResolvedValue({ data: response });
  });

  it("affiche et renvoie les règles du cycle sans perdre la hiérarchie", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AcademicRules /></QueryClientProvider>);

    expect(await screen.findByText("Collège")).toBeVisible();
    expect(screen.getByLabelText("academicRules.passingGrade", { selector: "#cycle-cycle-a-passing" })).toHaveValue(12);

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put.mock.calls[0][1]).toMatchObject({
      cycles: { "cycle-a": { passing_grade: 12 } },
      levels: {},
    });
  });
});
