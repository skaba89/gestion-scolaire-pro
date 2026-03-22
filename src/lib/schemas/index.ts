/**
 * Zod Validation Schemas Index
 * Centralized export of all validation schemas
 */

export {
  StudentSchema,
  CreateStudentSchema,
  UpdateStudentSchema,
  type StudentFormData,
} from "./studentSchema";

export {
  HomeworkSchema,
  CreateHomeworkSchema,
  UpdateHomeworkSchema,
  type HomeworkFormData,
} from "./homeworkSchema";

export {
  GradeSchema,
  CreateGradeSchema,
  UpdateGradeSchema,
  type GradeFormData,
} from "./gradeSchema";

export {
  AttendanceSchema,
  CreateAttendanceSchema,
  type AttendanceFormData,
} from "./attendanceSchema";

export {
  UserSchema,
  LoginSchema,
  RegisterSchema,
  type LoginFormData,
  type RegisterFormData,
} from "./userSchema";
