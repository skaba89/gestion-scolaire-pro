import { apiClient } from "@/api/client";

export interface Grade {
    score: number;
    max_score: number;
    weight: number;
    subject_id: string;
    subject_name: string;
    coefficient: number;
}

export interface StudentResult {
    student_id: string;
    subject_id?: string;
    average: number;
    rank?: number;
    mention?: string;
}

/**
 * Pedagogical Engine for calculating averages, ranks and mentions
 */
export const pedagogicalEngine = {
    /**
     * Calculate normalized average (out of 20) for a set of grades
     */
    calculateAverage(grades: Grade[]): number {
        if (grades.length === 0) return 0;

        let totalPoints = 0;
        let totalWeights = 0;

        grades.forEach((g) => {
            // Normalize to 20
            const normalizedScore = (g.score / g.max_score) * 20;
            const weight = g.weight || 1.0;
            totalPoints += normalizedScore * weight;
            totalWeights += weight;
        });

        return totalWeights > 0 ? totalPoints / totalWeights : 0;
    },

    /**
     * Get mention based on average
     */
    getMention(average: number): string {
        if (average >= 18) return "Excellent";
        if (average >= 16) return "Très Bien";
        if (average >= 14) return "Bien";
        if (average >= 12) return "Assez Bien";
        if (average >= 10) return "Passable";
        return "Insuffisant";
    },

    /**
     * Calculate general average and ranks for a class
     */
    async calculateClassResults(classId: string, termId: string, tenantId: string) {
        // 1. Fetch all grades for this class and term
        const { data: gradesData } = await apiClient.get("/students/grades/", {
            params: {
                tenant_id: tenantId,
                term_id: termId,
                class_id: classId,
            },
        });

        // 2. Fetch class subject overrides (coefficients)
        const { data: overrides } = await apiClient.get("/students/class-subjects/", {
            params: {
                class_id: classId,
            },
        });

        const coeffOverrides = new Map(overrides?.map((o: any) => [o.subject_id, o.coefficient]) || []);

        // 3. Group by student
        const studentGrades = new Map<string, Grade[]>();
        (gradesData || []).forEach((g: any) => {
            const list = studentGrades.get(g.student_id) || [];
            const subjectId = g.subject_id;
            const baseCoeff = g.coefficient || 1;
            const coeff = coeffOverrides.get(subjectId) || baseCoeff;

            list.push({
                score: Number(g.score),
                max_score: Number(g.max_score),
                weight: Number(g.weight),
                subject_id: subjectId,
                subject_name: g.subject_name || "Unknown",
                coefficient: Number(coeff)
            });
            studentGrades.set(g.student_id, list);
        });

        // 4. Calculate averages per student
        const results: { student_id: string; average: number }[] = [];

        for (const [studentId, grades] of studentGrades.entries()) {
            // Group grades by subject to get subject average first
            const bySubject = new Map<string, Grade[]>();
            grades.forEach(g => {
                const sList = bySubject.get(g.subject_id) || [];
                sList.push(g);
                bySubject.set(g.subject_id, sList);
            });

            let totalWeightedAverages = 0;
            let totalCoefficients = 0;

            for (const [, sGrades] of bySubject.entries()) {
                const subjectAverage = this.calculateAverage(sGrades);
                const coeff = sGrades[0].coefficient;

                totalWeightedAverages += subjectAverage * coeff;
                totalCoefficients += coeff;
            }

            const generalAverage = totalCoefficients > 0 ? totalWeightedAverages / totalCoefficients : 0;
            results.push({ student_id: studentId, average: generalAverage });
        }

        // 5. Sort by average and determine ranks
        results.sort((a, b) => b.average - a.average);

        return results.map((r, index) => ({
            ...r,
            rank: index + 1,
            mention: this.getMention(r.average)
        }));
    },

    /**
     * Identify students eligible for remedial sessions
     */
    async identifyStudentsForRemedial(classId: string, termId: string, tenantId: string) {
        // 1. Get class results
        const results = await this.calculateClassResults(classId, termId, tenantId);

        // 2. Fetch tenant settings for thresholds
        const { data: tenant } = await apiClient.get(`/tenants/${tenantId}/`);

        const passingGrade = tenant?.settings?.passingScore || 10;
        const remedialThreshold = tenant?.settings?.remedialThreshold || 8;
        const enableRemedial = tenant?.settings?.enableRemedial || false;

        if (!enableRemedial) return [];

        // 3. Filter students in the remedial zone
        return results.filter(r => r.average >= remedialThreshold && r.average < passingGrade);
    },

    /**
     * Persist results back to database
     */
    async saveTermResults(results: any[], tenantId: string, classId: string, termId: string) {
        const inserts = results.map(r => ({
            tenant_id: tenantId,
            student_id: r.student_id,
            class_id: classId,
            term_id: termId,
            score: r.average,
            rank: r.rank,
            mention: r.mention,
            updated_at: new Date().toISOString()
        }));

        await apiClient.post("/students/term-results/bulk/", { results: inserts });
    }
};
