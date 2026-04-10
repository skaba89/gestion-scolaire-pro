/**
 * Grade Validation Schema
 * Zod schema for grade CRUD operations
 */

import { z } from "zod";

export const GradeSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
  term_id: z.string().uuid().optional().nullable(),
  assessment_id: z.string().uuid().optional().nullable(),
  score: z
    .number()
    .min(0, "Score must be at least 0")
    .max(100, "Score cannot exceed 100"),
  grade: z
    .enum(["A", "B", "C", "D", "E", "F"])
    .optional()
    .nullable(),
  weight: z
    .number()
    .min(0, "Weight must be positive")
    .default(1),
  feedback: z.string().max(1000).optional().nullable(),
  recorded_by: z.string().uuid().optional().nullable(),
  recorded_at: z
    .union([z.date(), z.string()])
    .transform((v) => (typeof v === "string" ? new Date(v) : v))
    .optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const CreateGradeSchema = GradeSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).refine((data) => data.tenant_id, "Tenant ID is required")
 .refine((data) => data.student_id, "Student ID is required")
 .refine((data) => data.subject_id, "Subject ID is required");

export const UpdateGradeSchema = GradeSchema.omit({
  created_at: true,
  updated_at: true,
  tenant_id: true,
  student_id: true,
}).partial();

export type Grade = z.infer<typeof GradeSchema>;
export type GradeFormData = z.infer<typeof CreateGradeSchema>;
