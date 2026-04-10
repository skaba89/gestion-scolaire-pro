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

    try {
      // Temporary: if no assessment API exists, we might need to rely on returning empty array or hitting a generic endpoint
      // We assume /assessments exists on FastAPI
      const response = await apiClient.get(`/assessments/?${params.toString()}`);
      return (response.data?.items || response.data || []) as unknown as Assessment[];
    } catch (error) {
      console.error("No assessment API, fallback returning empty", error);
      return [];
    }
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
    try {
      // List all grades for student
      const response = await apiClient.get(`/grades/?student_id=${studentId}`);
      const listRes = response.data;
      const grades = (listRes?.items || listRes || []) as unknown as (Grade & { assessments: Assessment })[];

      const validGrades = grades.filter((g) => g.score !== undefined && g.score !== null);
      const validScores = validGrades.map((g) => g.score);

      if (validScores.length === 0) {
        return {
          student_id: studentId,
          grades,
          average: 0,
          highest: 0,
          lowest: 0,
        };
      }

      return {
        student_id: studentId,
        grades,
        average: validScores.reduce((a, b) => a + b, 0) / validScores.length,
        highest: Math.max(...validScores),
        lowest: Math.min(...validScores),
      };
    } catch (error) {
      console.error(error);
      return {
        student_id: studentId,
        grades: [],
        average: 0,
        highest: 0,
        lowest: 0,
      };
    }
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
    try {
      // We don't have a direct upsert on FastAPI, try to list grades first to see if it exists
      const response = await apiClient.get(`/grades/?student_id=${data.student_id}`);
      const list = response.data?.items || response.data || [];
      const existing = list.find((g: any) => g.assessment_id === data.assessment_id);

      if (existing && existing.id) {
        return this.updateGrade(existing.id, data);
      } else {
        return this.createGrade(tenantId, data);
      }
    } catch (error) {
      return this.createGrade(tenantId, data);
    }
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
