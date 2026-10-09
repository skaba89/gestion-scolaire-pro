import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ text: [] as string[], saved: [] as string[] }));

vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { width: 210, height: 297, getWidth: () => 210 }, getNumberOfPages: () => 2 };
    lastAutoTable = { finalY: 60 };
    setFontSize() {}
    setTextColor() {}
    setFont() {}
    setFillColor() {}
    setDrawColor() {}
    rect() {}
    line() {}
    setPage() {}
    addPage() {}
    text(value: string | string[]) {
      calls.text.push(String(value));
    }
    save(name: string) {
      calls.saved.push(name);
    }
  },
}));
vi.mock("jspdf-autotable", () => ({ default: vi.fn() }));

import { generateDashboardPDF } from "../dashboardPdfGenerator";

describe("generateDashboardPDF", () => {
  beforeEach(() => {
    calls.text.length = 0;
    calls.saved.length = 0;
  });

  it("builds and saves the report (its footer used an undefined `tenant`: ReferenceError)", () => {
    expect(() =>
      generateDashboardPDF({
        tenantName: "École Démo",
        tenantType: "primary",
        period: "Octobre 2026",
        financial: { totalRevenue: "0 FG", collectionRate: "0%", paidRevenue: "0 FG", pendingRevenue: "0 FG" },
        academic: { successRate: "0%", totalStudents: 0, averageGrade: "—", failingStudents: 0 },
        operational: { attendanceRate: "0%", teacherAttendance: "0%", enrollments: 0, dropoutRate: "0%" },
      }),
    ).not.toThrow();

    expect(calls.saved).toHaveLength(1);
    expect(calls.text.some((t) => t.includes("Page 1 de 2 - École Démo"))).toBe(true);
  });
});
