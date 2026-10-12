import { useTranslation } from "react-i18next";

export type GenderKey = "male" | "female" | "other";

/**
 * Normalise le genre d'un élève quelle que soit sa forme.
 *
 * L'API renvoie l'énumération `MALE` / `FEMALE` / `OTHER`, mais plusieurs
 * écrans comparaient à `"male"` ou à `"M"` : la fiche classe affichait
 * « Fille » pour tous les garçons, la fiche enfant du parent « N/A », et
 * l'export laissait la colonne vide. Les formes anciennes (M/F, H, male…)
 * restent acceptées.
 */
export function normalizeGender(value?: string | null): GenderKey | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (["MALE", "M", "H", "HOMME", "MASCULIN", "GARCON", "GARÇON"].includes(v)) return "male";
  if (["FEMALE", "F", "FEMME", "FEMININ", "FÉMININ", "FILLE"].includes(v)) return "female";
  if (["OTHER", "AUTRE", "O"].includes(v)) return "other";
  return null;
}

/** Libellé traduit du genre (`common.gender.*`), ou `fallback` si inconnu. */
export function useGenderLabel() {
  const { t } = useTranslation();
  return (value?: string | null, fallback = "-"): string => {
    const key = normalizeGender(value);
    return key ? t(`common.gender.${key}`) : fallback;
  };
}
