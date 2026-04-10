export interface StudentRisk {
    id: string;
    name: string;
    classroom: string;
    riskLevel: "high" | "medium" | "low";
    riskScore: number;
    factors: string[];
    avgGrade: number;
    attendanceRate: number;
}

export interface Prediction {
    type: string;
    title: string;
    description: string;
    confidence: number;
    trend: "up" | "down" | "stable";
    value: string;
}

export interface Recommendation {
    id: string;
    category: string;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    impact: string;
}

export interface TrendData {
    month: string;
    moyenne: number;
    presence: number;
    risques: number;
}
