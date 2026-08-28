import { describe, expect, it } from "vitest";
import { sortAnnouncementsPinnedFirst } from "@/lib/landingAnnouncements";
import type { TenantLandingAnnouncement } from "@/types/tenant";

function makeAnnouncement(
  overrides: Partial<TenantLandingAnnouncement> = {},
): TenantLandingAnnouncement {
  return { title: "Titre", body: "Corps", is_pinned: false, ...overrides };
}

describe("sortAnnouncementsPinnedFirst", () => {
  it("place les annonces épinglées avant les autres", () => {
    const a = makeAnnouncement({ title: "A", is_pinned: false });
    const b = makeAnnouncement({ title: "B", is_pinned: true });
    const c = makeAnnouncement({ title: "C", is_pinned: false });

    const result = sortAnnouncementsPinnedFirst([a, b, c]);

    expect(result.map((x) => x.title)).toEqual(["B", "A", "C"]);
  });

  it("préserve l'ordre relatif au sein de chaque groupe", () => {
    const a = makeAnnouncement({ title: "A", is_pinned: true });
    const b = makeAnnouncement({ title: "B", is_pinned: true });
    const c = makeAnnouncement({ title: "C", is_pinned: false });
    const d = makeAnnouncement({ title: "D", is_pinned: false });

    const result = sortAnnouncementsPinnedFirst([c, a, d, b]);

    expect(result.map((x) => x.title)).toEqual(["A", "B", "C", "D"]);
  });

  it("gère un tableau vide", () => {
    expect(sortAnnouncementsPinnedFirst([])).toEqual([]);
  });
});
