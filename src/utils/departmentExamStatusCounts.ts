export interface ExamStatusCount {
  name: string;
  value: number;
  color: string;
}
type Exam = { status?: unknown };

/**
 * Accept the API's array response or a paginated {items} response.
 * An invalid result throws instead of reporting zero exams.
 */
export function buildDepartmentExamStatusCounts(response: unknown): ExamStatusCount[] {
  let records: unknown;
  if (Array.isArray(response)) records = response;
  else if (response !== null && typeof response === 'object' && 'items' in response) {
    records = (response as { items: unknown }).items;
  }
  if (!Array.isArray(records)) {
    throw new Error('Réponse des examens non conforme');
  }
  const counts = { scheduled: 0, completed: 0, cancelled: 0 };
  for (const item of records as Exam[]) {
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
