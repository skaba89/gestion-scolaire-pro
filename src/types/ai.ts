/**
 * Élève signalé par GET /analytics/students-at-risk/ (moyenne < 60 % du barème).
 * Aucune valeur n'est inventée : une donnée que l'API ne fournit pas vaut null.
 */
export interface StudentRisk {
    id: string;
    name: string;
    /** Non fourni par l'endpoint à ce jour : chaîne vide. */
    classroom: string;
    riskLevel: "high" | "medium" | "low";
    riskScore: number;
    factors: string[];
    /** Moyenne des notes, sur 20. */
    avgGrade: number;
    /** Présence de l'élève : non fournie par l'API (null), jamais 100 % par défaut. */
    attendanceRate: number | null;
}

/**
 * Indicateur ACTUEL calculé par le serveur. Ce n'est pas une prédiction :
 * ni tendance ni « confiance » ne sont affichées tant qu'aucun modèle ne les
 * calcule réellement (audit 2026-11-02, SIM-AI-01).
 */
export interface Prediction {
    type: string;
    title: string;
    description: string;
    value: string;
}

export interface Recommendation {
    id: string;
    category: string;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
}

/** Indicateurs globaux de l'établissement ; null si l'API ne les a pas fournis. */
export interface SchoolKpis {
    /** Moyenne générale, sur 20. */
    averageGrade: number | null;
    /** Taux de présence des élèves, en %. */
    attendanceRate: number | null;
    /** Part des notes ≥ moitié du barème, en %. */
    successRate: number | null;
    totalStudents: number | null;
}
