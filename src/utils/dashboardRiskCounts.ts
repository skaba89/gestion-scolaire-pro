/** Dashboard risk counts must not label missing/incomplete assessments as LOW. */
export interface DashboardRiskRecord {
    risk_level?: string | null;
    assessment_status?: string | null;
    risk_score?: number | null;
}

export interface DashboardRiskCounts {
    total: number;
    critical: number;
    high: number;
    moderate: number;
    low: number;
    unknown: number;
}

export function summarizeDashboardRisks(data: unknown): DashboardRiskCounts {
    const rows: DashboardRiskRecord[] = Array.isArray(data) ? data : [];
    const counts: DashboardRiskCounts = {
        total: rows.length, critical: 0, high: 0, moderate: 0, low: 0, unknown: 0,
    };
    for (const row of rows) {
        if (!row || typeof row !== "object" ||
            row.assessment_status === "INCOMPLETE" ||
            row.risk_level === "UNKNOWN" ||
            (Object.prototype.hasOwnProperty.call(row, "risk_score") && row.risk_score === null)) {
            counts.unknown++;
            continue;
        }
        switch (row.risk_level) {
            case "CRITICAL": counts.critical++; break;
            case "HIGH": counts.high++; break;
            case "MODERATE": counts.moderate++; break;
            case "LOW": counts.low++; break;
            default: counts.unknown++; break;
        }
    }
    return counts;
}
