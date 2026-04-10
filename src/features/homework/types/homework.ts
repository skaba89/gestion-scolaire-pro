/**
 * Homework feature types
 * Centralized TypeScript interfaces for homework-related data
 */

export type Json = Record<string, unknown>;

export interface Homework {
  id: string;
  tenant_id: string;
  title: string;
  description?: string;
  class_id: string;
  subject_id: string;
  teacher_id?: string;
  due_date: string;
  due_time?: string;
  is_published?: boolean;
  max_points?: number;
  attachments?: Json;
  created_at?: string;
  updated_at?: string;
  status?: string;
}

export interface HomeworkSubmission {
  id: string;
  homework_id: string;
  student_id: string;
  submitted_at?: string;
  content?: string;
  graded_by?: string;
  graded_at?: string;
  grade?: number;
  feedback?: string;
  attachments?: Json;
  tenant_id: string;
}

export interface HomeworkFilters {
  classId?: string;
  subjectId?: string;
  dateRange?: [string, string];
  search?: string;
}

export interface HomeworkFormData {
  title: string;
  description?: string;
  class_id: string;
  subject_id: string;
  due_date: string;
  due_time?: string;
  is_published?: boolean;
  max_points?: number;
  attachments?: Json;
}

export interface HomeworkWithSubmissions extends Homework {
  submissions?: HomeworkSubmission[];
  submission_count?: number;
  graded_count?: number;
}
