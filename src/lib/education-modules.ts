export const INSTITUTION_TYPES = [
  { value: "preschool", label: "Maternelle" },
  { value: "primary", label: "École primaire" },
  { value: "middle", label: "Collège" },
  { value: "high", label: "Lycée" },
  { value: "university", label: "Université" },
  { value: "higher_education", label: "École supérieure" },
  { value: "training", label: "Centre de formation" },
  { value: "vocational", label: "Formation professionnelle" },
  { value: "mixed", label: "Établissement mixte multi-cycles" },
] as const;

export interface EducationConfiguration {
  tenant_id: string;
  revision: number;
  mode: "legacy" | "configured";
  profile_id: string;
  overrides: Record<string, boolean>;
  enabled_modules: string[];
  scope: "institution";
  cycle_policy_available: boolean;
}

export interface EducationChoice {
  profile_id: string;
  overrides: Record<string, boolean>;
  expected_revision: number;
}

export interface EducationCatalog {
  catalog_version: number;
  modules: { id: string; label: string; core: boolean; available: boolean; dependencies: string[] }[];
  profiles: { id: string; label: string; default_modules: string[]; period_type: string; learner_term: string; default_levels: string[] }[];
}

export interface EducationPreview extends EducationConfiguration {
  added: string[];
  removed: string[];
  preserves_history: boolean;
}

export const CORE_EDUCATION_MODULES = new Set([
  "authentication", "users", "institutions", "security", "finance", "notifications", "audit", "reporting",
]);

const PAGE_MODULE: Record<string, string> = {
  library: "library", elearning: "elearning", courses: "elearning",
  grades: "assessments", assessments: "assessments", exams: "assessments", "exam-calendar": "assessments",
  attendance: "attendance", "live-attendance": "attendance", badges: "attendance", scan: "attendance",
  "session-attendance": "attendance", "kiosk-devices": "attendance",
  schedule: "schedule", bookings: "schedule", homework: "homework", admissions: "admissions", "pre-registration": "admissions",
  semesters: "lmd", faculties: "lmd", hr: "hr", "teacher-hours": "hr", inventory: "inventory", orders: "inventory",
  clubs: "student_life", events: "student_life", careers: "student_life", gamification: "student_life",
  "alumni-mentors": "student_life", "alumni-requests": "student_life", "early-warnings": "student_life",
  "ai-insights": "ai", students: "academics", enrollments: "academics", "class-lists": "academics",
  teachers: "academics", levels: "academics", classrooms: "academics", classes: "academics", subjects: "academics",
  programs: "academics", departments: "academics", "data-import": "academics",
};

export function moduleForPage(path: string): string | undefined {
  const parts = path.split(/[?#]/, 1)[0].split("/").filter(Boolean);
  const portals = new Set(["admin", "teacher", "student", "parent", "department", "alumni"]);
  const portal = portals.has(parts[1]) ? 1 : portals.has(parts[0]) ? 0 : -1;
  if (portal < 0) return undefined;
  if (["messages", "profile", "settings", "notifications"].includes(parts[portal + 1])) return undefined;
  if (parts[portal] === "alumni") return "student_life";
  return PAGE_MODULE[parts[portal + 1]];
}

/** Keep dependency changes explicit in the draft shown by the preview. */
export function toggleDraftModule(catalog: EducationCatalog, active: Set<string>, moduleId: string, enabled: boolean): Set<string> {
  const next = new Set(active);
  const definitions = new Map(catalog.modules.map(m => [m.id, m]));
  if (enabled) {
    const add = (id: string) => {
      const module = definitions.get(id);
      if (!module?.available || next.has(id)) return;
      next.add(id);
      module.dependencies.forEach(add);
    };
    add(moduleId);
  } else {
    if (definitions.get(moduleId)?.core) return next;
    next.delete(moduleId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const module of catalog.modules) {
        if (!module.core && next.has(module.id) && module.dependencies.some(dep => !next.has(dep))) {
          next.delete(module.id);
          changed = true;
        }
      }
    }
  }
  return next;
}
