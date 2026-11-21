import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminQueries } from "./admin";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get, post } }));

describe("studentCheckInHistory", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it("actualise automatiquement le tableau de la secrétaire", () => {
    const options = adminQueries.studentCheckInHistory(
      "school",
      "2026-11-21T00:00:00.000Z",
      "2026-11-22T00:00:00.000Z",
    );

    expect(options.refetchInterval).toBe(5_000);
  });

  it("borne la lecture au jour demandé", async () => {
    get.mockResolvedValue({ data: [] });
    const start = "2026-11-21T00:00:00.000Z";
    const end = "2026-11-21T23:59:59.999Z";

    await adminQueries.studentCheckInHistory("school", start, end).queryFn();

    expect(get).toHaveBeenCalledWith("/student-check-ins/", {
      params: {
        tenant_id: "school",
        checked_at_gte: start,
        checked_at_lte: end,
        complete_day: true,
      },
    });
  });

  it("lit le dernier mouvement normalisé et transmet la direction réelle", async () => {
    get.mockResolvedValue({ data: [{ id: "movement", check_in_type: "ENTRY" }] });
    post.mockResolvedValue({ data: { id: "created" } });

    await expect(adminQueries.getStudentLastCheckIn("student", "school")).resolves.toMatchObject({
      id: "movement",
      check_in_type: "ENTRY",
    });
    expect(get).toHaveBeenCalledWith("/student-check-ins/", {
      params: { tenant_id: "school", student_id: "student" },
    });

    await adminQueries.createStudentCheckIn({
      student_id: "student",
      tenant_id: "school",
      check_in_type: "EXIT",
      checked_by: "secretary",
    });
    expect(post).toHaveBeenCalledWith("/school-life/check-ins/", {
      student_id: "student",
      direction: "OUT",
      source: "QR_SCAN",
    });
  });
});
