/**
 * Attendance Feature Types
 */

export interface AttendanceRecord {
  id: string;
  tenant_id: string;
  student_id: string;
  class_id?: string;
  date: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  notes?: string;
  recorded_by?: string;
  created_at?: string;
}

export interface AttendanceFormData {
  student_id: string;
  class_id?: string;
  date: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  notes?: string;
  recorded_by?: string;
}

export interface AttendanceFilters {
  studentId?: string;
  startDate?: string;
  endDate?: string;
  status?: AttendanceRecord["status"];
  dateRange?: "today" | "week" | "month" | "custom";
}

export interface AttendanceStats {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  excusedDays: number;
  attendancePercentage: number;
}

export interface AttendanceSummary {
  student_id: string;
  stats: AttendanceStats;
  recentRecords: AttendanceRecord[];
}

export interface ClassAttendance {
  date: string;
  totalStudents: number;
  presentStudents: number;
  absentStudents: number;
  lateStudents: number;
  excusedStudents: number;
  attendancePercentage: number;
}
