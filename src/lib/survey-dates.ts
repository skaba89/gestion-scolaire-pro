/** Map API date/datetime strings to the YYYY-MM-DD value expected by <input type="date">. */
export function surveyDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/.exec(value);
  return match?.[1] ?? '';
}
