/**
 * Lot S1 (2026-11-23) : plus d'indicateur inventé ni de bouton sans effet à l'écran.
 * ANALYTICS-MOCK-01 (présence des enseignants, points de gamification), EXPORT-NOOP-01.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));
vi.mock("@/hooks/useStudentLabel", () => ({
  useStudentLabel: () => ({ studentsLabel: "élèves", StudentsLabel: "Élèves", studentLabel: "élève" }),
}));

import { OperationalExecutiveKPIs } from "@/components/admin/dashboard/ExecutiveKPIs";
import { AnalyticsHeader } from "@/components/admin/analytics/AnalyticsHeader";
import { GamificationStats } from "@/components/admin/gamification/GamificationStats";

describe("indicateurs non mesurés", () => {
  it("la présence des enseignants non mesurée s'affiche « — », jamais 0 %", () => {
    render(
      <OperationalExecutiveKPIs
        data={{
          studentAttendanceRate: 92, teacherAttendanceRate: null, totalEnrollments: 10,
          dropoutRate: 2.5, dropoutCount: 1, totalTeacherHours: 5.5,
        }}
      />,
    );

    expect(screen.getByText("Non mesuré")).toBeInTheDocument();
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
    expect(screen.getByText("5.5h")).toBeInTheDocument();
  });

  it("la gamification n'affiche plus de points inexistants", () => {
    render(<GamificationStats stats={{ totalPoints: null, totalAchievements: 3, totalStudents: 2 }} />);

    expect(screen.queryByText("Points Distribués")).not.toBeInTheDocument();
    expect(screen.queryByText("Moyenne/Étudiant")).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("boutons d'export", () => {
  it("aucun bouton d'export sans action d'export réelle", () => {
    render(
      <AnalyticsHeader title="Analytics" subtitle="Vue" selectedPeriod="month" onPeriodChange={() => undefined} />,
    );
    expect(screen.queryByRole("button", { name: /adminAnalytics.header.export/ })).not.toBeInTheDocument();
  });

  it("le bouton d'export reste affiché quand un export est branché", () => {
    render(
      <AnalyticsHeader
        title="Analytics" subtitle="Vue" selectedPeriod="month" onPeriodChange={() => undefined}
        onExport={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /adminAnalytics.header.export/ })).toBeInTheDocument();
  });
});
