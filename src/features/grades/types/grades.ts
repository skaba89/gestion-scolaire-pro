/**
 * Grades feature types
 */

export interface Grade {
  id: string;
  tenant_id: string;
  student_id: string;
  assessment_id: string;
  score?: number;
  comment?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GradeFormData {
  student_id: string;
  assessment_id?: string;
  subject_id?: string;
  academic_year_id?: string;
  term_id?: string;
  score?: number;
  comment?: string;
  grading_scale?: string;
}

export interface GradeFilters {
  studentId?: string;
  subjectId?: string;
  academicYearId?: string;
  termId?: string;
  minScore?: number;
  maxScore?: number;
}

export interface StudentGrade {
  student_id: string;
  grades: Grade[];
  average: number;
  highest: number;
  lowest: number;
}
