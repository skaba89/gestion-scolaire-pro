/**
 * Règles académiques (moyenne de passage, seuils de mention) — miroir côté
 * écran de `backend/app/services/academic_rules.py`. Le serveur valide et fait
 * autorité ; ces fonctions servent à l'aperçu et au retour immédiat.
 */
export const MENTION_LABELS = ["Assez Bien", "Bien", "Très Bien", "Excellent"] as const;
export type MentionLabel = (typeof MENTION_LABELS)[number];

export interface AcademicRules {
  passing_grade: number;
  mentions: { label: MentionLabel; min: number }[];
}

export interface AcademicRulesResponse {
  defaults: AcademicRules;
  mention_labels: MentionLabel[];
  default: AcademicRules | null;
  levels: { level_id: string; level_name: string; rules: AcademicRules }[];
  available_levels: { id: string; name: string }[];
}

export const SCALE_MAX = 20;

/** Premier problème trouvé (clé i18n + valeurs), ou null si les règles sont valides. */
export function firstRuleProblem(r: AcademicRules): { key: string; values?: Record<string, string | number> } | null {
  if (!(r.passing_grade > 0 && r.passing_grade <= SCALE_MAX)) {
    return { key: "academicRules.errPassing", values: { max: SCALE_MAX } };
  }
  let previous = r.passing_grade;
  for (const label of MENTION_LABELS) {
    const m = r.mentions.find((x) => x.label === label);
    if (!m || !(m.min > previous && m.min <= SCALE_MAX)) {
      return { key: "academicRules.errMention", values: { label, previous, max: SCALE_MAX } };
    }
    previous = m.min;
  }
  return null;
}

/** Bandes affichées dans l'aperçu : « Insuffisant < 10 ≤ Passable < 12 ≤ … ». */
export function mentionBands(r: AcademicRules): { label: string; from: number | null; to: number | null }[] {
  const sorted = MENTION_LABELS.map((label) => r.mentions.find((m) => m.label === label)!);
  const bands: { label: string; from: number | null; to: number | null }[] = [
    { label: "Insuffisant", from: null, to: r.passing_grade },
    { label: "Passable", from: r.passing_grade, to: sorted[0]?.min ?? null },
  ];
  sorted.forEach((m, i) => bands.push({ label: m.label, from: m.min, to: sorted[i + 1]?.min ?? null }));
  return bands;
}

export const cloneRules = (r: AcademicRules): AcademicRules => ({
  passing_grade: r.passing_grade,
  mentions: r.mentions.map((m) => ({ ...m })),
});
