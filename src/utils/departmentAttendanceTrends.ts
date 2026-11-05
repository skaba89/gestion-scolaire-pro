/** Attendance response rows for the department dashboard. */
export interface AttendanceRow {
  date: string;
  status: string;
  classroom_id: string | null;
}
export interface AttendanceDay { date: string; label: string }
export interface AttendanceTrend { date: string; present: number; absent: number; late: number }

/** Aggregate only allowed classrooms and days; exclude EXCUSED from the three plotted series. */
export function buildDepartmentAttendanceTrends(
  rows: AttendanceRow[],
  days: AttendanceDay[],
  classroomIds: string[],
): AttendanceTrend[] {
  const allowedClasses = new Set(classroomIds);
  const totals = new Map(days.map(day => [day.date, {
    date: day.label,
    present: 0,
    absent: 0,
    late: 0,
  }]));

  for (const row of rows) {
    if (!row || !row.classroom_id || !allowedClasses.has(row.classroom_id)) continue;
    const bucket = totals.get(row.date);
    if (!bucket) continue;
    switch (row.status.toUpperCase()) {
      case 'PRESENT': bucket.present++; break;
      case 'ABSENT': bucket.absent++; break;
      case 'LATE': bucket.late++; break;
      default: break;
    }
  }
  return [...totals.values()];
}
