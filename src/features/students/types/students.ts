/**
 * Students Feature Types
 */

export interface Student {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  city?: string;
  country?: string;
  nationality?: string;
  guardian_first_name?: string;
  guardian_last_name?: string;
  guardian_email?: string;
  guardian_phone?: string;
  emergency_contact?: string;
  emergency_phone?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  is_archived?: boolean;
  photo_url?: string;
}

export interface StudentFormData {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  city?: string;
  country?: string;
  nationality?: string;
  guardian_first_name?: string;
  guardian_last_name?: string;
  guardian_email?: string;
  guardian_phone?: string;
  emergency_contact?: string;
  emergency_phone?: string;
}

export interface StudentFilters {
  levelId?: string;
  classroomId?: string;
  academicYearId?: string;
  searchTerm?: string;
}

export interface StudentStats {
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  transferredStudents: number;
  graduatedStudents: number;
}

export interface StudentWithDetails extends Student {
  level?: {
    id: string;
    name: string;
  };
  classroom?: {
    id: string;
    name: string;
  };
  grades?: Array<{
    id: string;
    subject_id: string;
    grade: number;
  }>;
}
