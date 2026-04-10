/**
 * Homework Service
 * Handles all API calls related to homework
 */

import { apiClient } from "@/api/client";
import type { Homework, HomeworkFormData, HomeworkSubmission, HomeworkFilters } from "../types/homework";

export const homeworkService = {
  /**
   * List all homework for a tenant with optional filters
   */
  async listHomework(tenantId: string, filters?: HomeworkFilters) {
    const params: Record<string, string> = { tenant_id: tenantId };
    if (filters?.classId) params.class_id = filters.classId;
    if (filters?.subjectId) params.subject_id = filters.subjectId;
    if (filters?.search) params.search = filters.search;
    if (filters?.dateRange) {
      params.due_date_start = filters.dateRange[0];
      params.due_date_end = filters.dateRange[1];
    }

    const { data } = await apiClient.get<Homework[]>("/homework/", { params });
    return data || [];
  },

  /**
   * Get a single homework by ID with submissions
   */
  async getHomework(id: string) {
    const { data } = await apiClient.get<Homework & { homework_submissions?: HomeworkSubmission[] }>(`/homework/${id}/`);
    return data;
  },

  /**
   * Get homework submissions for a student
   */
  async getStudentSubmissions(studentId: string, homeworkId?: string) {
    const params: Record<string, string> = { student_id: studentId };
    if (homeworkId) params.homework_id = homeworkId;

    const { data } = await apiClient.get<HomeworkSubmission[]>("/homework/submissions/", { params });
    return data || [];
  },

  /**
   * Create new homework
   */
  async createHomework(tenantId: string, data: HomeworkFormData) {
    const { data: result } = await apiClient.post<Homework>("/homework/", { ...data, tenant_id: tenantId });
    return result;
  },

  /**
   * Update homework
   */
  async updateHomework(id: string, data: Partial<HomeworkFormData>) {
    const { data: result } = await apiClient.patch<Homework>(`/homework/${id}/`, data);
    return result;
  },

  /**
   * Delete homework
   */
  async deleteHomework(id: string) {
    await apiClient.delete(`/homework/${id}/`);
  },

  /**
   * Submit homework (create submission)
   */
  async submitHomework(
    homeworkId: string,
    studentId: string,
    tenantId: string,
    submissionData: Partial<HomeworkSubmission>
  ) {
    const { data } = await apiClient.post<HomeworkSubmission>("/homework/submissions/", {
      homework_id: homeworkId,
      student_id: studentId,
      tenant_id: tenantId,
      submitted_at: new Date().toISOString(),
      ...submissionData,
    });
    return data;
  },

  /**
   * Grade a homework submission
   */
  async gradeSubmission(
    submissionId: string,
    grade: number,
    feedback?: string
  ) {
    const { data } = await apiClient.patch<HomeworkSubmission>(`/homework/submissions/${submissionId}/`, {
      grade,
      feedback,
      graded_at: new Date().toISOString(),
    });
    return data;
  },
};
