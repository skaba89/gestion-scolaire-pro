// Type definitions for the School Management Platform

export type AppRole =
  | "SUPER_ADMIN"
  | "TENANT_ADMIN"
  | "DIRECTOR"
  | "DEPARTMENT_HEAD"
  | "TEACHER"
  | "STUDENT"
  | "PARENT"
  | "ACCOUNTANT"
  | "STAFF"
  | "SECRETARY"
  | "ALUMNI";

export type AdmissionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ACCEPTED"
  | "REJECTED"
  | "CONVERTED_TO_STUDENT";

export type PaymentStatus =
  | "PENDING"
  | "PARTIAL"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface TenantSettings {
  onboarding_step?: number;
  onboarding_completed?: boolean;
  currency?: string;
  theme?: {
    colors?: {
      primary?: string;
      secondary?: string;
      accent?: string;
    };
    typography?: {
      fontFamily?: string;
      fontSize?: string;
    };
    logo_height?: string;
  };
  operational?: {
    academic_year_start?: string;
    academic_year_end?: string;
    levels?: string[];
    country?: string;
  };
  [key: string]: any;
}

// NOTE: This is the canonical Tenant type
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  banner_url?: string;
  description?: string;
  mission?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  type: string;
  country?: string;
  currency?: string;
  is_active: boolean;
  settings?: TenantSettings;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  tenant_id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  is_current: boolean;
  must_change_password?: boolean;
  two_factor_enabled?: boolean;
  two_factor_secret?: string;
  two_factor_backup_codes?: string[];
  two_factor_verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  tenant_id: string;
  role: AppRole;
  created_at: string;
}

export interface AcademicYear {
  id: string;
  tenant_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at: string;
}

export interface Term {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at: string;
}

export interface Level {
  id: string;
  tenant_id: string;
  name: string;
  order_index: number;
  created_at: string;
}

export interface Classroom {
  id: string;
  tenant_id: string;
  level_id?: string;
  campus_id?: string;
  name: string;
  capacity?: number;
  created_at: string;
}

export interface Subject {
  id: string;
  tenant_id: string;
  name: string;
  code?: string;
  coefficient: number;
  created_at: string;
}

export interface Student {
  id: string;
  tenant_id: string;
  user_id?: string;
  registration_number?: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  phone?: string;
  email?: string;
  photo_url?: string;
  emergency_contact?: string;
  emergency_phone?: string;
  medical_info?: string;
  is_archived: boolean;
  admission_application_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AdmissionApplication {
  id: string;
  tenant_id: string;
  academic_year_id?: string;
  level_id?: string;
  student_first_name: string;
  student_last_name: string;
  student_date_of_birth?: string;
  student_gender?: string;
  student_address?: string;
  student_previous_school?: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  parent_phone: string;
  parent_address?: string;
  parent_occupation?: string;
  status: AdmissionStatus;
  notes?: string;
  documents: unknown[];
  submitted_at?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  converted_student_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  student_id: string;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  status: PaymentStatus;
  due_date?: string;
  items: unknown[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  tenant_id: string;
  conversation_id: string;
  sender_id?: string;
  content: string;
  attachments: unknown[];
  created_at: string;
}

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  message?: string;
  type: string;
  is_read: boolean;
  link?: string;
  created_at: string;
}

// Dashboard Statistics
export interface DashboardStats {
  totalStudents: number;
  activeEnrollments: number;
  pendingAdmissions: number;
  totalRevenue: number;
  pendingPayments: number;
  attendanceRate: number;
}
