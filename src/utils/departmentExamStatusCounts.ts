export interface ExamStatusCount {
  name: string;
  value: number;
  color: string;
}
type Exam = { status?: unknown; exam_date?: unknown };

/**
 * Accept the department API's {exams} response, arrays or paginated {items}.
 * An invalid result throws instead of reporting zero exams.
 */
export function buildDepartmentExamStatusCounts(
  response: unknown,
  startDate?: string,
  endDate?: string,
): ExamStatusCount[] {
  let records: unknown;
  if (Array.isArray(response)) records = response;
  else if (response !== null && typeof response === 'object' && 'exams' in response) {
    records = (response as { exams: unknown }).exams;
  } else if (response !== null && typeof response === 'object' && 'items' in response) {
    records = (response as { items: unknown }).items;
  }
  if (!Array.isArray(records)) {
    throw new Error('Réponse des examens non conforme');
  }
  const counts = { scheduled: 0, completed: 0, cancelled: 0 };
  for (const item of records as Exam[]) {
    if (startDate || endDate) {
      const date = item?.exam_date;
      // Compare ISO calendar dates, not timestamps; invalid/missing exam
      // dates cannot be counted as exams during a given month.
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (startDate && date < startDate) continue;
      if (endDate && date > endDate) continue;
    }
    const status = item?.status;
    if (status === 'scheduled' || status === 'completed' || status === 'cancelled') {
      counts[status]++;
    }
  }
  return [
    { name: 'Programmés', value: counts.scheduled, color: '#3b82f6' },
    { name: 'Terminés', value: counts.completed, color: '#10b981' },
    { name: 'Annulés', value: counts.cancelled, color: '#ef4444' },
  ];
}
