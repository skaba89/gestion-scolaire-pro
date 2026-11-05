import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/api/client", () => ({
  apiClient: { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
import { gradesService } from "../services/gradesService";

beforeEach(() => vi.clearAllMocks());

describe("student grade average consistency", () => {
  it("uses the server's /20 coefficient-weighted average, not raw score arithmetic", async () => {
    get.mockResolvedValueOnce({ data: { items: [
      { id: "a", score: 15, max_score: 20 },
      { id: "b", score: 6, max_score: 20 },
    ] } });
    get.mockResolvedValueOnce({ data: { average: 11.4, count: 2 } });
    const result = await gradesService.getStudentGrades("student-1");
    expect(get).toHaveBeenNthCalledWith(1, "/grades/?student_id=student-1");
    expect(get).toHaveBeenNthCalledWith(2, "/grades/student/student-1/average/");
    expect(result.average).toBe(11.4);
    expect(result.highest).toBe(15);
    expect(result.lowest).toBe(6);
    expect(result.grades).toHaveLength(2);
  });

  it("does not invent a zero average when the authoritative endpoint fails", async () => {
    get.mockResolvedValueOnce({ data: { items: [{ score: 12 }] } });
    get.mockRejectedValueOnce(new Error("HTTP 503"));
    await expect(gradesService.getStudentGrades("student-1")).rejects.toThrow("HTTP 503");
  });

  it("keeps the real zero average for a successful empty response", async () => {
    get.mockResolvedValueOnce({ data: { items: [] } });
    get.mockResolvedValueOnce({ data: { average: 0, count: 0 } });
    const result = await gradesService.getStudentGrades("student-1");
    expect(result).toMatchObject({ average: 0, highest: 0, lowest: 0, grades: [] });
  });

  it("propagates grade-list errors without requesting an average", async () => {
    get.mockRejectedValueOnce(new Error("HTTP 403"));
    await expect(gradesService.getStudentGrades("student-1")).rejects.toThrow("HTTP 403");
    expect(get).toHaveBeenCalledOnce();
  });
});
