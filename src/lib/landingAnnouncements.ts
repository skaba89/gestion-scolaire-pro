import type { TenantLandingAnnouncement } from '@/types/tenant';

/**
 * Pinned announcements first, then the rest, in their original order.
 * Previously duplicated verbatim (as 3 separate lines building
 * pinned/unpinned/merged arrays) in all 4 legacy site templates — audit
 * 2026-08-28 (templates de site public).
 */
export function sortAnnouncementsPinnedFirst(
  announcements: TenantLandingAnnouncement[],
): TenantLandingAnnouncement[] {
  const pinned = announcements.filter((a) => a.is_pinned);
  const unpinned = announcements.filter((a) => !a.is_pinned);
  return [...pinned, ...unpinned];
}
