import { apiClient } from "@/api/client";

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface RiskFactor {
    category: string;
    score: number;
    weight: number;
    details: string;
}

export interface StudentRiskProfile {
    student_id: string;
    risk_score: number;
    risk_level: RiskLevel;
    factors: RiskFactor[];
    calculated_at: string;
}

/**
 * Risk Assessment Engine for Early Warning System
 */
export const riskAssessment = {
    /**
     * Calculate risk level from score
     */
    getRiskLevel(score: number): RiskLevel {
        if (score >= 80) return "CRITICAL";
        if (score >= 60) return "HIGH";
        if (score >= 40) return "MODERATE";
        return "LOW";
    },

    /**
     * Calculate academic risk based on grades and trends
     */
    async calculateAcademicRisk(studentId: string, termId: string, tenantId: string): Promise<RiskFactor> {
        // 1. Get current term results
        let currentAverage = 0;
        try {
            const { data: currentResults } = await apiClient.get("/students/term-results/", {
                params: {
                    student_id: studentId,
                    term_id: termId,
                    subject_id: 'null',
                },
            });
            currentAverage = currentResults?.score || 0;
        } catch {
            // no results found
        }

        // 2. Get tenant passing grade
        let passingGrade = 10;
        try {
            const { data: tenant } = await apiClient.get(`/tenants/${tenantId}/`);
            passingGrade = tenant?.settings?.passingScore || 10;
        } catch {
            // default
        }

        // 3. Get previous term for trend analysis
        let trend = 0;
        try {
            const { data: terms } = await apiClient.get("/students/terms/", {
                params: {
                    tenant_id: tenantId,
                    limit: 2,
                },
            });

            if (terms && terms.length >= 2) {
                const previousTermId = terms[1].id;
                const { data: previousResults } = await apiClient.get("/students/term-results/", {
                    params: {
                        student_id: studentId,
                        term_id: previousTermId,
                        subject_id: 'null',
                    },
                });

                if (previousResults) {
                    trend = currentAverage - previousResults.score;
                }
            }
        } catch {
            // trend stays 0
        }

        // 4. Calculate risk score (0-100)
        let academicRisk = 0;

        // Below passing grade
        if (currentAverage < passingGrade) {
            const gap = passingGrade - currentAverage;
            academicRisk += Math.min(gap * 5, 50); // Max 50 points for being below threshold
        }

        // Negative trend
        if (trend < -2) {
            academicRisk += Math.min(Math.abs(trend) * 5, 30); // Max 30 points for declining
        }

        // Very low average
        if (currentAverage < 5) {
            academicRisk += 20; // Critical bonus
        }

        return {
            category: "Academic Performance",
            score: Math.min(academicRisk, 100),
            weight: 0.4,
            details: `Average: ${currentAverage.toFixed(2)}/20, Trend: ${trend > 0 ? '+' : ''}${trend.toFixed(1)}`
        };
    },

    /**
     * Calculate attendance risk based on absences and tardiness
     */
    async calculateAttendanceRisk(studentId: string, termId: string): Promise<RiskFactor> {
        // 1. Get term dates
        let term: any = null;
        try {
            const { data } = await apiClient.get(`/students/terms/${termId}/`);
            term = data;
        } catch {
            return {
                category: "Attendance",
                score: 0,
                weight: 0.4,
                details: "No term data"
            };
        }

        if (!term) {
            return {
                category: "Attendance",
                score: 0,
                weight: 0.4,
                details: "No term data"
            };
        }

        // 2. Get attendance records
        let attendance: any[] = [];
        try {
            const { data } = await apiClient.get("/students/attendance/", {
                params: {
                    student_id: studentId,
                    from_date: term.start_date,
                    to_date: term.end_date,
                },
            });
            attendance = data || [];
        } catch {
            return {
                category: "Attendance",
                score: 0,
                weight: 0.4,
                details: "No attendance data"
            };
        }

        if (attendance.length === 0) {
            return {
                category: "Attendance",
                score: 0,
                weight: 0.4,
                details: "No attendance data"
            };
        }

        // 3. Calculate metrics
        const totalDays = attendance.length;
        const absences = attendance.filter((a: any) => a.status === "ABSENT").length;
        const lates = attendance.filter((a: any) => a.status === "LATE").length;
        const excused = attendance.filter((a: any) => a.status === "EXCUSED").length;

        const absenceRate = (absences / totalDays) * 100;
        const lateRate = (lates / totalDays) * 100;

        // 4. Calculate risk score
        let attendanceRisk = 0;

        // Absence rate thresholds
        if (absenceRate > 20) attendanceRisk += 60; // Critical
        else if (absenceRate > 15) attendanceRisk += 45;
        else if (absenceRate > 10) attendanceRisk += 30;
        else if (absenceRate > 5) attendanceRisk += 15;

        // Late rate
        if (lateRate > 15) attendanceRisk += 20;
        else if (lateRate > 10) attendanceRisk += 10;

        // Unexcused absences
        const unexcusedRate = ((absences - excused) / totalDays) * 100;
        if (unexcusedRate > 10) attendanceRisk += 20;

        return {
            category: "Attendance",
            score: Math.min(attendanceRisk, 100),
            weight: 0.4,
            details: `Absences: ${absenceRate.toFixed(1)}%, Lates: ${lateRate.toFixed(1)}%`
        };
    },

    /**
     * Calculate trend risk (recent changes)
     */
    async calculateTrendRisk(studentId: string, termId: string): Promise<RiskFactor> {
        // Get last 4 weeks of grades
        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

        let recentGrades: any[] = [];
        try {
            const { data } = await apiClient.get("/students/grades/", {
                params: {
                    student_id: studentId,
                    from_date: fourWeeksAgo.toISOString().split('T')[0],
                },
            });
            recentGrades = data || [];
        } catch {
            return {
                category: "Recent Trend",
                score: 0,
                weight: 0.2,
                details: "Insufficient recent data"
            };
        }

        if (recentGrades.length < 3) {
            return {
                category: "Recent Trend",
                score: 0,
                weight: 0.2,
                details: "Insufficient recent data"
            };
        }

        // Calculate normalized scores
        const normalizedScores = recentGrades.map((g: any) =>
            (Number(g.score) / Number(g.max_score)) * 20
        );

        // Simple linear regression to detect trend
        const n = normalizedScores.length;
        const xMean = (n - 1) / 2;
        const yMean = normalizedScores.reduce((a, b) => a + b, 0) / n;

        let numerator = 0;
        let denominator = 0;

        for (let i = 0; i < n; i++) {
            numerator += (i - xMean) * (normalizedScores[i] - yMean);
            denominator += Math.pow(i - xMean, 2);
        }

        const slope = numerator / denominator;

        // Calculate risk based on slope
        let trendRisk = 0;
        if (slope < -0.5) trendRisk = 70; // Steep decline
        else if (slope < -0.3) trendRisk = 50;
        else if (slope < -0.1) trendRisk = 30;

        return {
            category: "Recent Trend",
            score: trendRisk,
            weight: 0.2,
            details: `Slope: ${slope.toFixed(2)} (${slope < 0 ? 'declining' : 'improving'})`
        };
    },

    /**
     * Calculate overall risk profile for a student
     */
    async calculateStudentRisk(
        studentId: string,
        termId: string,
        tenantId: string
    ): Promise<StudentRiskProfile> {
        // Calculate all risk factors
        const academicRisk = await this.calculateAcademicRisk(studentId, termId, tenantId);
        const attendanceRisk = await this.calculateAttendanceRisk(studentId, termId);
        const trendRisk = await this.calculateTrendRisk(studentId, termId);

        const factors = [academicRisk, attendanceRisk, trendRisk];

        // Calculate weighted overall score
        const overallScore = factors.reduce((sum, factor) =>
            sum + (factor.score * factor.weight), 0
        );

        return {
            student_id: studentId,
            risk_score: Math.round(overallScore),
            risk_level: this.getRiskLevel(overallScore),
            factors,
            calculated_at: new Date().toISOString()
        };
    },

    /**
     * Calculate risk for all students in a class
     */
    async calculateClassRisks(
        classId: string,
        termId: string,
        tenantId: string
    ): Promise<StudentRiskProfile[]> {
        // Get all active students in class
        let enrollments: any[] = [];
        try {
            const { data } = await apiClient.get("/students/", {
                params: {
                    class_id: classId,
                    status: 'active',
                },
            });
            enrollments = data || [];
        } catch {
            return [];
        }

        if (enrollments.length === 0) return [];

        const riskProfiles: StudentRiskProfile[] = [];

        for (const enrollment of enrollments) {
            try {
                const profile = await this.calculateStudentRisk(
                    enrollment.id || enrollment.student_id,
                    termId,
                    tenantId
                );
                riskProfiles.push(profile);
            } catch (error) {
                console.error(`Error calculating risk for student ${enrollment.id || enrollment.student_id}:`, error);
            }
        }

        return riskProfiles.sort((a, b) => b.risk_score - a.risk_score);
    }
};
