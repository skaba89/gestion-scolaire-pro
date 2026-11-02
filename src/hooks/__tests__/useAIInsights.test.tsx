import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import "@/i18n/config";
import { useAIInsights } from "@/hooks/useAIInsights";
import { PredictionCard } from "@/components/admin/ai/PredictionCard";
import { RecommendationCard } from "@/components/admin/ai/RecommendationCard";
import { StudentRiskCard } from "@/components/admin/ai/StudentRiskCard";

const mockGet = vi.fn();

vi.mock("@/api/client", () => {
  const client = { get: (...args: unknown[]) => mockGet(...args) };
  return { apiClient: client, default: client };
});

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "École Test" } }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const AT_RISK = {
  students: [
    { student_id: "s1", first_name: "Fatou", last_name: "Camara", avg_grade: 7.25, grade_count: 4, risk_level: "critical" },
    { student_id: "s2", first_name: "Ibrahima", last_name: "Sow", avg_grade: 11.5, grade_count: 3, risk_level: "moderate" },
  ],
  summary: { total: 2, critical: 1, high: 0, moderate: 1, low: 0 },
};

beforeEach(() => {
  mockGet.mockReset();
});

describe("useAIInsights — aucune donnée inventée", () => {
  it("n'utilise jamais Math.random dans les données de la page", () => {
    const files = [
      "src/hooks/useAIInsights.ts",
      "src/components/admin/ai/AICharts.tsx",
      "src/components/admin/ai/PredictionCard.tsx",
      "src/components/admin/ai/RecommendationCard.tsx",
    ];
    for (const file of files) {
      expect(readFileSync(resolve(process.cwd(), file), "utf8"), file).not.toMatch(/Math\.random/);
    }
  });

  it("reprend les valeurs de l'API, moyennes sur 20, présence par élève inconnue", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/analytics/students-at-risk/") return Promise.resolve({ data: AT_RISK });
      if (url === "/analytics/academic-kpis/")
        return Promise.resolve({ data: { averageGrade: 12.34, overallSuccessRate: 42, totalStudents: 310 } });
      if (url === "/analytics/operational-kpis/") return Promise.resolve({ data: { studentAttendanceRate: 73.6 } });
      return Promise.reject(new Error(url));
    });
    const { result } = renderHook(() => useAIInsights(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.studentRisks[0]).toMatchObject({ name: "Fatou Camara", avgGrade: 7.3, riskLevel: "high", attendanceRate: null });
    const values = Object.fromEntries(result.current.predictions.map((p) => [p.type, p.value]));
    expect(values).toEqual({ grades: "12.3/20", attendance: "74 %", risk: "1", success: "42 %" });
    // Le taux de réussite n'est plus forcé à 60 % minimum.
    expect(values.success).not.toBe("60 %");
    // Recommandation présence déclenchée par un vrai taux < 80 %, sans impact chiffré.
    expect(result.current.recommendations.map((r) => r.id)).toEqual(["follow-up", "attendance"]);
    expect(JSON.stringify(result.current.recommendations)).not.toMatch(/%\s*de l'engagement|impact/i);
  });

  it("affiche « Non disponible » plutôt qu'un chiffre quand l'API échoue", async () => {
    mockGet.mockRejectedValue(new Error("503"));
    const { result } = renderHook(() => useAIInsights(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.predictions.map((p) => p.value)).toEqual([
      "Non disponible",
      "Non disponible",
      "Non disponible",
      "Non disponible",
    ]);
    expect(result.current.kpis).toEqual({ averageGrade: null, attendanceRate: null, successRate: null, totalStudents: null });
    expect(result.current.recommendations).toEqual([]);
  });
});

describe("Cartes IA — plus d'éléments décoratifs", () => {
  it("la carte d'indicateur n'affiche aucune « confiance »", () => {
    render(<PredictionCard prediction={{ type: "grades", title: "Moyenne générale", description: "d", value: "12.3/20" }} />);
    expect(screen.getByText("12.3/20")).toBeInTheDocument();
    expect(screen.queryByText(/confiance/i)).not.toBeInTheDocument();
  });

  it("la recommandation n'a plus de bouton « Appliquer » sans action", () => {
    render(
      <RecommendationCard
        recommendation={{ id: "r", category: "Suivi", title: "Titre", description: "Desc", priority: "high" }}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Priorité haute")).toBeInTheDocument();
  });

  it("la fiche élève affiche la moyenne sur 20 et masque une présence inconnue", () => {
    render(
      <StudentRiskCard
        student={{ id: "s", name: "Fatou Camara", classroom: "", riskLevel: "high", riskScore: 75, factors: [], avgGrade: 7.3, attendanceRate: null }}
      />,
    );
    expect(screen.getByText("7.3/20")).toBeInTheDocument();
    expect(screen.queryByText("Présence")).not.toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });
});
