import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

// Recharts mesure le conteneur (indisponible sous jsdom) : rendu neutre.
vi.mock("recharts", async (orig) => {
  const actual = await orig<typeof import("recharts")>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> };
});

import { PerformanceAnalytics, computeClassStats } from "../PerformanceAnalytics";

it("taux de réussite au seuil du niveau, pas au 10 écrit en dur", () => {
  // 11 et 11.5 réussissaient au seuil 10 ; au seuil 12 du niveau, non.
  const stats = computeClassStats([8, 11, 11.5, 12, 15], 12);
  expect(stats.successRate).toBe(40);
  expect(computeClassStats([8, 11, 11.5, 12, 15], 10).successRate).toBe(80);
});

it("médiane exacte pour un effectif pair, et distribution par tranche", () => {
  const stats = computeClassStats([16, 9, 12, 13], 10);
  expect(stats.median).toBe(12.5); // (12 + 13) / 2 — l'ancien calcul prenait 13
  expect(stats.min).toBe(9);
  expect(stats.max).toBe(16);
  expect(stats.average).toBe(12.5);
  expect(Object.fromEntries(stats.distribution.map((b) => [b.name, b.count]))).toMatchObject({
    "5-10": 1, "12-14": 2, "16-18": 1, "18-20": 0,
  });
  expect(computeClassStats([20], 10).distribution.at(-1)!.count).toBe(1);
});

it("affiche les valeurs officielles et le seuil appliqué", () => {
  render(<PerformanceAnalytics averages={[14.25, 9.5]} passingGrade={12} subjects={[]} termName="Semestre 1" />);
  expect(screen.getByTestId("analytics-average")).toHaveTextContent("11.88/20");
  expect(screen.getByTestId("analytics-success-rate")).toHaveTextContent("50%");
  expect(screen.getByText("Taux de réussite (≥ 12/20)")).toBeInTheDocument();
});

it("annonce l'absence de moyenne au lieu d'afficher 0/20", () => {
  render(<PerformanceAnalytics averages={[]} passingGrade={10} subjects={[]} termName="Semestre 1" />);
  expect(screen.getByText(/Aucune moyenne calculable pour cette période/)).toBeInTheDocument();
});
