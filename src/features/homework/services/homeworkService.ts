/**
 * Homework Service
 * Handles all API calls related to homework
 */

import { supabase } from "@/integrations/supabase/client";
import type { Homework, HomeworkFormData, HomeworkSubmission, HomeworkFilters } from "../types/homework";

export const homeworkService = {
  /**
   * List all homework for a tenant with optional filters
   */
  async listHomework(tenantId: string, filters?: HomeworkFilters) {
    let query = supabase
      .from("homework")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("due_date", { ascending: true });

    if (filters?.classId) {
      query = query.eq("class_id", filters.classId);
    }

    if (filters?.subjectId) {
      query = query.eq("subject_id", filters.subjectId);
    }

    if (filters?.search) {
      query = query.ilike("title", `%${filters.search}%`);
    }

    if (filters?.dateRange) {
      const [start, end] = filters.dateRange;
      query = query.gte("due_date", start).lte("due_date", end);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch homework: ${error.message}`);
    return (data || []) as unknown as Homework[];
  },

  /**
   * Get a single homework by ID with submissions
   */
  async getHomework(id: string) {
    const { data, error } = await supabase
      .from("homework")
      .select("*, homework_submissions(*)")
      .eq("id", id)
      .single();

    if (error) throw new Error(`Failed to fetch homework: ${error.message}`);
    return data;
  },

  /**
   * Get homework submissions for a student
   */
  async getStudentSubmissions(studentId: string, homeworkId?: string) {
    let query = supabase
      .from("homework_submissions")
      .select("*")
      .eq("student_id", studentId);

    if (homeworkId) {
      query = query.eq("homework_id", homeworkId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch submissions: ${error.message}`);
    return (data || []) as unknown as HomeworkSubmission[];
  },

  /**
   * Create new homework
   */
  async createHomework(tenantId: string, data: HomeworkFormData) {
    const { data: result, error } = await supabase
      .from("homework")
      .insert({
        ...data,
        tenant_id: tenantId,
      })
      .select();

    if (error) throw new Error(`Failed to create homework: ${error.message}`);
    return result?.[0] as unknown as Homework;
  },

  /**
   * Update homework
   */
  async updateHomework(id: string, data: Partial<HomeworkFormData>) {
    const { data: result, error } = await supabase
      .from("homework")
      .update(data)
      .eq("id", id)
      .select();

    if (error) throw new Error(`Failed to update homework: ${error.message}`);
    return result?.[0] as unknown as Homework;
  },

  /**
   * Delete homework
   */
  async deleteHomework(id: string) {
    const { error } = await supabase
      .from("homework")
      .delete()
      .eq("id", id);

    if (error) throw new Error(`Failed to delete homework: ${error.message}`);
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
    const { data, error } = await supabase
      .from("homework_submissions")
      .insert({
        homework_id: homeworkId,
        student_id: studentId,
        tenant_id: tenantId,
        submitted_at: new Date().toISOString(),
        ...submissionData,
      })
      .select();

    if (error) throw new Error(`Failed to submit homework: ${error.message}`);
    return data?.[0] as unknown as HomeworkSubmission;
  },

  /**
   * Grade a homework submission
   */
  async gradeSubmission(
    submissionId: string,
    grade: number,
    feedback?: string
  ) {
    const { data, error } = await supabase
      .from("homework_submissions")
      .update({
        grade,
        feedback,
        graded_at: new Date().toISOString(),
      })
      .eq("id", submissionId)
      .select();

    if (error) throw new Error(`Failed to grade submission: ${error.message}`);
    return data?.[0] as unknown as HomeworkSubmission;
  },
};
