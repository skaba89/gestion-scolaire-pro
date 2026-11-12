import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/api/client", () => ({ apiClient: { get: (...a: unknown[]) => get(...a) } }));

import { fetchClassroomsWithRefs, fetchCurrentAcademicYear, fetchEnrollments } from "../academic-structure";

beforeEach(() => get.mockReset());

describe("academic-structure (routes réelles)", () => {
  it("joins level and campus names onto classrooms, sorted by name", async () => {
    get.mockImplementation((url: string) => Promise.resolve({ data: {
      "/infrastructure/classrooms/": [
        { id: "c2", name: "6e B", level_id: "l1", campus_id: null },
        { id: "c1", name: "6e A", level_id: "l1", campus_id: "k1" },
      ],
      "/levels/": [{ id: "l1", name: "6ème" }],
      "/campuses/": [{ id: "k1", name: "Kaloum" }],
    }[url] }));
    const rows = await fetchClassroomsWithRefs();
    expect(rows.map((c) => c.name)).toEqual(["6e A", "6e B"]);
    expect(rows[0].level?.name).toBe("6ème");
    expect(rows[0].campus?.name).toBe("Kaloum");
    expect(rows[1].campus).toBeNull();
  });

  it("returns the current year, else the most recent one", async () => {
    get.mockResolvedValueOnce({ data: [
      { id: "y1", name: "2025-2026", start_date: "2025-09-01", is_current: false },
      { id: "y2", name: "2026-2027", start_date: "2026-09-01", is_current: true },
    ] });
    expect((await fetchCurrentAcademicYear())?.id).toBe("y2");
    get.mockResolvedValueOnce({ data: [
      { id: "y1", name: "2025-2026", start_date: "2025-09-01", is_current: false },
      { id: "y3", name: "2027-2028", start_date: "2027-09-01", is_current: false },
    ] });
    expect((await fetchCurrentAcademicYear())?.id).toBe("y3");
  });

  it("splits class_ids into batches of 100 (API limit)", async () => {
    get.mockResolvedValue({ data: [{ id: "e" }] });
    const ids = Array.from({ length: 150 }, (_, i) => `c${i}`);
    const rows = await fetchEnrollments({ classIds: ids, status: "ACTIVE" });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0][0]).toBe("/enrollments/");
    expect(get.mock.calls[0][1].params.class_ids.split(",")).toHaveLength(100);
    expect(get.mock.calls[1][1].params.class_ids.split(",")).toHaveLength(50);
    expect(rows).toHaveLength(2);
  });
});
