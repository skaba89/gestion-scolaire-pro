/**
 * Student Validation Schema
 * Zod schema for student CRUD operations
 */

import { z } from "zod";

export const StudentSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  first_name: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name must be less than 100 characters"),
  last_name: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name must be less than 100 characters"),
  email: z.string().email("Invalid email format").optional().nullable(),
  phone: z.string().max(20, "Phone number too long").optional().nullable(),
  date_of_birth: z
    .union([z.date(), z.string()])
    .transform((v) => (typeof v === "string" ? new Date(v) : v))
    .refine((v) => v < new Date(), "Date of birth must be in the past")
    .optional()
    .nullable(),
  gender: z
    .enum(["MALE", "FEMALE", "OTHER"])
    .optional()
    .nullable(),
  nationality: z.string().max(100).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  registration_number: z.string().max(50).optional().nullable(),
  student_id_card: z.string().max(50).optional().nullable(),
  admission_date: z
    .union([z.date(), z.string()])
    .transform((v) => (typeof v === "string" ? new Date(v) : v))
    .optional()
    .nullable(),
  notes: z.string().max(1000).optional().nullable(),
  status: z
    .enum(["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"])
    .default("ACTIVE"),
  is_archived: z.boolean().default(false),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const CreateStudentSchema = StudentSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).refine((data) => data.tenant_id, "Tenant ID is required");

export const UpdateStudentSchema = StudentSchema.omit({
  created_at: true,
  updated_at: true,
  tenant_id: true,
}).partial();

export type Student = z.infer<typeof StudentSchema>;
export type StudentFormData = z.infer<typeof CreateStudentSchema>;
