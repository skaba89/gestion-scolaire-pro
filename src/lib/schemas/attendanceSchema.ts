/**
 * Attendance Validation Schema
 * Zod schema for attendance CRUD operations
 */

import { z } from "zod";

export const AttendanceSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  class_id: z.string().uuid(),
  date: z
    .union([z.date(), z.string()])
    .transform((v) => (typeof v === "string" ? new Date(v) : v))
    .refine((v) => v <= new Date(), "Attendance date cannot be in the future"),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
  notes: z.string().max(500).optional().nullable(),
  recorded_by: z.string().uuid().optional().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const CreateAttendanceSchema = AttendanceSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).refine((data) => data.tenant_id, "Tenant ID is required")
  .refine((data) => data.student_id, "Student ID is required")
  .refine((data) => data.class_id, "Classroom ID is required");

export const UpdateAttendanceSchema = AttendanceSchema.omit({
  created_at: true,
  updated_at: true,
  tenant_id: true,
  student_id: true,
  class_id: true,
  date: true,
}).partial();

export type Attendance = z.infer<typeof AttendanceSchema>;
export type AttendanceFormData = z.infer<typeof CreateAttendanceSchema>;
