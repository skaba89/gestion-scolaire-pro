/**
 * Homework Validation Schema
 * Zod schema for homework CRUD operations
 */

import { z } from "zod";

export const HomeworkSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  class_id: z.string().uuid(),
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be less than 200 characters"),
  description: z.string().max(2000, "Description too long").optional().nullable(),
  instructions: z.string().max(2000).optional().nullable(),
  due_date: z
    .union([z.date(), z.string()])
    .transform((v) => (typeof v === "string" ? new Date(v) : v))
    .refine((v) => v > new Date(), "Due date must be in the future")
    .optional(),
  total_points: z
    .number()
    .min(0, "Points must be positive")
    .optional()
    .nullable(),
  attachment_urls: z.array(z.string().url()).default([]),
  is_published: z.boolean().default(true),
  allow_late_submission: z.boolean().default(false),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const CreateHomeworkSchema = HomeworkSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).refine((data) => data.tenant_id, "Tenant ID is required")
  .refine((data) => data.teacher_id, "Teacher ID is required")
  .refine((data) => data.class_id, "Classroom ID is required");

export const UpdateHomeworkSchema = HomeworkSchema.omit({
  created_at: true,
  updated_at: true,
  tenant_id: true,
}).partial();

export type Homework = z.infer<typeof HomeworkSchema>;
export type HomeworkFormData = z.infer<typeof CreateHomeworkSchema>;
