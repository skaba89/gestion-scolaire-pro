/**
 * Terminology fix (2026-09): isTraining was computed in useTerminology()
 * but never actually used — every label only checked isUniversity, so a
 * training center ("centre de formation") silently got K-12 wording
 * (élève, trimestre, matière...) instead of higher-ed wording. This suite
 * pins the intended behaviour: "élève" only for an actual school; a
 * training center gets the same vocabulary as a university.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { mockUseTenant } = vi.hoisted(() => ({ mockUseTenant: vi.fn() }));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: mockUseTenant,
}));

import { useTerminology } from "@/hooks/useTerminology";

function withTenantType(type: string) {
  mockUseTenant.mockReturnValue({ tenant: { type } });
  return renderHook(() => useTerminology()).result.current;
}

describe("useTerminology — student label by institution type", () => {
  it("uses 'élève' for a primary school", () => {
    const t = withTenantType("primary");
    expect(t.studentLabel).toBe("élève");
    expect(t.isHigherEd).toBe(false);
  });

  it("uses 'étudiant' for a university", () => {
    const t = withTenantType("UNIVERSITY");
    expect(t.studentLabel).toBe("étudiant");
    expect(t.isHigherEd).toBe(true);
  });

  it("uses 'étudiant' for a training center — the bug this fix closes", () => {
    const t = withTenantType("training");
    expect(t.studentLabel).toBe("étudiant");
    expect(t.studentsLabel).toBe("étudiants");
    expect(t.isTraining).toBe(true);
    expect(t.isHigherEd).toBe(true);
    expect(t.isSchool).toBe(false);
  });

  it("also applies higher-ed wording to term/subject/coefficient for a training center", () => {
    const t = withTenantType("training");
    expect(t.termLabel).toBe("Semestre");
    expect(t.subjectLabel).toBe("Unité d'enseignement (UE)");
    expect(t.coefficientLabel).toBe("Crédits (ECTS)");
  });
});

describe("useTerminology — translated vocabulary (audit des langues 2026-11-13)", () => {
  it("follows the interface language", async () => {
    const { default: i18n } = await import("@/i18n/config");
    await i18n.changeLanguage("en");
    try {
      expect(withTenantType("primary").StudentsLabel).toBe("Pupils");
      expect(withTenantType("UNIVERSITY").termsLabel).toBe("Semesters");
      await i18n.changeLanguage("ar");
      expect(withTenantType("UNIVERSITY").studentsLabel).toBe("طلاب");
    } finally {
      await i18n.changeLanguage("fr");
    }
    expect(withTenantType("UNIVERSITY").studentsLabel).toBe("étudiants");
  });
});
