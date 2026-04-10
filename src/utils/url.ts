/**
 * Resolve an uploaded file URL to the full backend URL.
 * Local paths like /uploads/... need to be prefixed with the backend API origin.
 */
export function resolveUploadUrl(url: string | null | undefined): string {
  if (!url) return url || '';
  // Already a full URL (http/https or data:)
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  // Relative path — prefix with backend origin
  const cfg = (window as any).__SCHOOLFLOW_CONFIG__;
  const apiUrl = cfg?.API_URL || '';
  if (!apiUrl) return url;
  return `${apiUrl}${url}`;
}
