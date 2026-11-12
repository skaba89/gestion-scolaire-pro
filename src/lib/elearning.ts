import { apiClient } from "@/api/client";

/** E-learning : modules, leçons et progression (backend : academic/elearning.py). */

export type LessonType = "text" | "video" | "document";

export interface ElearningLesson {
  id: string;
  course_id: string;
  module_id: string;
  title: string;
  content: string | null;
  resource_url: string | null;
  lesson_type: LessonType;
  duration_minutes: number | null;
  order_index: number;
  is_published: boolean;
  completed?: boolean;
}

export interface ElearningModule {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  order_index: number;
  lessons: ElearningLesson[];
}

export interface LessonInput {
  title: string;
  content?: string | null;
  resource_url?: string | null;
  lesson_type: LessonType;
  duration_minutes?: number | null;
  is_published: boolean;
}

export interface ModuleInput {
  title: string;
  description?: string | null;
}

export interface StudentCourseSummary {
  id: string;
  title: string;
  description: string | null;
  duration_hours: number | null;
  subject_name: string | null;
  lesson_count: number;
  completed_count: number;
}

const STAFF = "/analytics/elearning";
const ME = "/me/elearning";

export const elearningKeys = {
  content: (courseId: string) => ["elearning-content", courseId] as const,
  myCourses: ["my-elearning-courses"] as const,
  myCourse: (courseId: string) => ["my-elearning-course", courseId] as const,
};

export async function fetchCourseContent(courseId: string): Promise<ElearningModule[]> {
  const { data } = await apiClient.get(`${STAFF}/courses/${courseId}/content/`);
  return data?.modules ?? [];
}

export const createModule = (courseId: string, body: ModuleInput) =>
  apiClient.post(`${STAFF}/courses/${courseId}/modules/`, body);
export const updateModule = (moduleId: string, body: Partial<ModuleInput>) =>
  apiClient.put(`${STAFF}/modules/${moduleId}/`, body);
export const deleteModule = (moduleId: string) => apiClient.delete(`${STAFF}/modules/${moduleId}/`);

export const createLesson = (moduleId: string, body: LessonInput) =>
  apiClient.post(`${STAFF}/modules/${moduleId}/lessons/`, body);
export const updateLesson = (lessonId: string, body: Partial<LessonInput>) =>
  apiClient.put(`${STAFF}/lessons/${lessonId}/`, body);
export const deleteLesson = (lessonId: string) => apiClient.delete(`${STAFF}/lessons/${lessonId}/`);

export async function fetchMyCourses(): Promise<StudentCourseSummary[]> {
  const { data } = await apiClient.get(`${ME}/courses/`);
  return data ?? [];
}

export async function fetchMyCourse(courseId: string): Promise<{
  course: { id: string; title: string; description: string | null };
  modules: ElearningModule[];
}> {
  const { data } = await apiClient.get(`${ME}/courses/${courseId}/`);
  return data;
}

export const completeLesson = (lessonId: string) => apiClient.post(`${ME}/lessons/${lessonId}/complete/`);

/** Lien affichable : uniquement https (le backend refuse déjà le reste). */
export const safeHttpsUrl = (url: string | null | undefined): string | null =>
  url && /^https:\/\//i.test(url.trim()) ? url.trim() : null;
