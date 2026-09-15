// Plain (non-hook) terminology helper — for use outside React components
// (PDF generators, print windows, etc.) where useTerminology()/useStudentLabel()
// aren't callable. Mirrors the isUniversity detection in
// src/hooks/useTerminology.ts and src/contexts/TenantContext.tsx.

export function isUniversityTenant(tenant: { type?: string | null } | null | undefined): boolean {
    const type = (tenant?.type || "").toUpperCase().trim();
    return [
        "UNIVERSITY", "UNIVERSITÉ", "UNIVERSITE",
        "HIGHER_EDUCATION", "ENSEIGNEMENT_SUPERIEUR", "ENSEIGNEMENT SUPERIEUR",
        "FACULTE", "FACULTÉ", "INSTITUT", "ECOLE_SUPERIEURE", "ÉCOLE_SUPÉRIEURE",
        "BTS", "IUT",
    ].includes(type);
}

export function isTrainingTenant(tenant: { type?: string | null } | null | undefined): boolean {
    return (tenant?.type || "").toLowerCase().trim() === "training";
}

export function getStudentLabel(
    tenant: { type?: string | null } | null | undefined,
    options: { plural?: boolean; capitalize?: boolean } = {}
): string {
    const { plural = false, capitalize = false } = options;
    // Terminology fix (2026-09): was isUniversityTenant-only, so a training
    // center's PDFs (analytics reports, dashboards, student sheets) printed
    // "élève" instead of "étudiant" — see useTerminology.ts's isHigherEd,
    // which this mirrors, for why a training center counts the same as a
    // university here.
    const higherEd = isUniversityTenant(tenant) || isTrainingTenant(tenant);
    let label = higherEd
        ? (plural ? "étudiants" : "étudiant")
        : (plural ? "élèves" : "élève");
    if (capitalize) label = label.charAt(0).toUpperCase() + label.slice(1);
    return label;
}
