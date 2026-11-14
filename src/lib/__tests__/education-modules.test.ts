import { describe, expect, it } from "vitest";
import { CORE_EDUCATION_MODULES, INSTITUTION_TYPES, moduleForPage, toggleDraftModule, type EducationCatalog } from "@/lib/education-modules";
import { shouldPersistQuery } from "@/lib/offline-persistence";

const catalog: EducationCatalog = { catalog_version: 1, profiles: [], modules: [
  { id: "finance", label: "Finance", core: true, available: true, dependencies: [] },
  { id: "academics", label: "Classes", core: false, available: true, dependencies: [] },
  { id: "assessments", label: "Notes", core: false, available: true, dependencies: ["academics"] },
  { id: "lmd", label: "LMD", core: false, available: true, dependencies: ["assessments"] },
  { id: "competencies", label: "Compétences", core: false, available: false, dependencies: [] },
] };

describe("catalogue et règles des modules", () => {
  it("présente neuf types distincts et garde le socle commun", () => {
    expect(new Set(INSTITUTION_TYPES.map(t => t.value)).size).toBe(9);
    expect(CORE_EDUCATION_MODULES.size).toBe(8);
  });
  it("montre les dépendances ajoutées et conserve le brouillon d'origine", () => {
    const original = new Set(["finance"]);
    expect([...toggleDraftModule(catalog, original, "lmd", true)].sort()).toEqual(["academics", "assessments", "finance", "lmd"]);
    expect([...original]).toEqual(["finance"]);
  });
  it("retire tous les dépendants et protège le socle et les modules absents", () => {
    const original = new Set(["finance", "academics", "assessments", "lmd"]);
    expect([...toggleDraftModule(catalog, original, "academics", false)]).toEqual(["finance"]);
    expect(toggleDraftModule(catalog, original, "finance", false).has("finance")).toBe(true);
    expect(toggleDraftModule(catalog, original, "competencies", true).has("competencies")).toBe(false);
  });
  it.each([
    ["/ecole/admin/library", "library"], ["/admin/admin/subjects", "academics"],
    ["/teacher/student/courses?lesson=1", "elearning"], ["/student/grades", "assessments"],
    ["/ecole/parent/attendance", "attendance"], ["/ecole/alumni/dashboard", "student_life"],
    ["/ecole/admin/settings", undefined], ["/ecole/parent/messages", undefined],
    ["/ecole/admin/invoices", undefined], ["/ecole/login", undefined],
  ])("associe %s à son module", (path, expected) => expect(moduleForPage(path)).toBe(expected));
  it("ne persiste aucune autorisation d'activation hors ligne", () => {
    expect(shouldPersistQuery(["education-configuration", "tenant", "user"])).toBe(false);
    expect(shouldPersistQuery(["education-catalog"])).toBe(false);
  });
});
