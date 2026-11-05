/**
 * Grades Service
 * Centralized service for Grades and Assessments
 */

import { apiClient } from "@/api/client";
import type { Grade, GradeFormData, GradeFilters } from "../types/grades";

// Assessment Types
export interface Assessment {
  id: string;
  tenant_id: string;
  class_id: string;
  subject_id: string;
  term_id: string;
  name: string;
  type: string;
  date: string;
  max_score: number;
  weight: number;
  description?: string;
  created_at?: string;
  updated_at?: string;
  // Relations
  subjects?: { name: string; code: string | null };
  classrooms?: { name: string };
  terms?: { name: string };
}

export interface AssessmentFormData {
  class_id: string;
  subject_id: string;
  term_id: string;
  name: string;
  type: string;
  date: string;
  max_score: number;
  weight: number;
  description?: string;
}

export const gradesService = {
  // ----------------------------------------------------------------------
  // Assessments Operations
  // ----------------------------------------------------------------------

  async listAssessments(tenantId: string, filters?: { classId?: string; subjectId?: string; termId?: string }) {
    // Pass parameters
    const params = new URLSearchParams();
    if (filters?.classId && filters.classId !== "all") params.append("classId", filters.classId);
    if (filters?.subjectId) params.append("subjectId", filters.subjectId);
    if (filters?.termId) params.append("termId", filters.termId);

    const response = await apiClient.get(`/assessments/?${params.toString()}`);
    return (response.data?.items || response.data || []) as unknown as Assessment[];
  },

  async getAssessment(id: string) {
    const response = await apiClient.get(`/assessments/${id}/`);
    return response.data as unknown as Assessment;
  },

  async createAssessment(tenantId: string, data: AssessmentFormData) {
    const response = await apiClient.post(`/assessments/`, data);
    return response.data as unknown as Assessment;
  },

  async updateAssessment(id: string, data: Partial<AssessmentFormData>) {
    const response = await apiClient.put(`/assessments/${id}/`, data);
    return response.data as unknown as Assessment;
  },

  async deleteAssessment(id: string) {
    await apiClient.delete(`/assessments/${id}/`);
  },

  // ----------------------------------------------------------------------
  // Grades Operations
  // ----------------------------------------------------------------------

  async listGrades(tenantId: string, filters?: GradeFilters) {
    const params = new URLSearchParams();
    if (filters?.studentId) params.append("student_id", filters.studentId);
    if ((filters as any)?.assessmentId) params.append("assessment_id", (filters as any).assessmentId);

    // Fast Api Endpoint
    const response = await apiClient.get(`/grades/?${params.toString()}`);
    // Extract array from paginated response
    return (response.data?.items || response.data || []) as unknown as Grade[];
  },

  async getStudentGrades(studentId: string) {
    // A network/authentication failure must never be displayed as a zero average.
    const response = await apiClient.get(`/grades/?student_id=${studentId}`);
    const listRes = response.data;
    const grades = (listRes?.items || listRes || []) as unknown as (Grade & { assessments: Assessment })[];
    const validScores = grades.filter((g) => g.score !== undefined && g.score !== null).map((g) => g.score);

    return {
      student_id: studentId,
      grades,
      average: validScores.length ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0,
      highest: validScores.length ? Math.max(...validScores) : 0,
      lowest: validScores.length ? Math.min(...validScores) : 0,
    };
  },

  async createGrade(tenantId: string, data: GradeFormData) {
    const response = await apiClient.post(`/grades/`, data);
    return response.data as unknown as Grade;
  },

  async updateGrade(id: string, data: Partial<GradeFormData>, reason?: string) {
    const response = await apiClient.put(`/grades/${id}/`, data);
    return response.data as unknown as Grade;
  },

  async upsertGrade(tenantId: string, data: GradeFormData) {
    // Only a successful lookup may authorize a create. A failed lookup
    // (network outage / 403 / 500) is NOT proof the grade is absent.
    const response = await apiClient.get(`/grades/?student_id=${data.student_id}`);
    const list = response.data?.items || response.data || [];
    const existing = list.find((g: Grade) => g.assessment_id === data.assessment_id);
    if (existing?.id) {
      return this.updateGrade(existing.id, data);
    }
    return this.createGrade(tenantId, data);
  },

  async deleteGrade(id: string) {
    await apiClient.delete(`/grades/${id}/`);
  },

  async bulkCreateGrades(tenantId: string, grades: GradeFormData[]) {
    // If backend doesn't support bulk, we simulate it
    try {
      const response = await apiClient.post(`/grades/bulk/`, { grades });
      return response.data as unknown as Grade[];
    } catch (error) {
      // fallback: loop
      console.warn("Bulk grade fallback triggered");
      const results = [];
      for (const grade of grades) {
        const res = await this.createGrade(tenantId, grade as any);
        results.push(res);
      }
      return results;
    }
  },
};
