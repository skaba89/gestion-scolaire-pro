/**
 * Types du profil de risque (utilisés par recommendationEngine.ts).
 *
 * 2026-11-12 (AUD-ROUTES) : le moteur de calcul côté navigateur qui était ici
 * n'était appelé nulle part et interrogeait des routes inexistantes
 * (/students/term-results/, /students/grades/, capturées par
 * /students/{id}/). Le risque est calculé côté serveur (risk-scores).
 */
export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | "UNKNOWN";

export interface RiskFactor {
    category: string;
    score: number;
    weight: number;
    details: string;
    /** false when this factor has no reliable observations. */
    available?: boolean;
}

export interface StudentRiskProfile {
    student_id: string;
    risk_score: number | null;
    risk_level: RiskLevel;
    assessment_status: "COMPLETE" | "INCOMPLETE";
    factors: RiskFactor[];
    calculated_at: string;
}
