import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, put, patch } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  apiClient: { get, post, put, patch, delete: vi.fn() },
}));

import { homeworkService } from "../services/homeworkService";

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { items: [] } });
  post.mockResolvedValue({ data: { id: "submission-1" } });
  put.mockResolvedValue({ data: { message: "Homework updated" } });
});

describe("homeworkService FastAPI contract", () => {
  it("uses due_date_from/to rather than unsupported query filters", async () => {
    await homeworkService.listHomework("tenant-1", { dateRange: ["2026-11-01", "2026-11-30"] });
    expect(get).toHaveBeenCalledWith("/homework/", {
      params: expect.objectContaining({ due_date_from: "2026-11-01", due_date_to: "2026-11-30" }),
    });
    const params = get.mock.calls[0][1].params;
    expect(params).not.toHaveProperty("due_date_start");
    expect(params).not.toHaveProperty("due_date_end");
  });

  it("updates homework using the supported PUT route", async () => {
    await homeworkService.updateHomework("hw-1", { title: "Devoir corrigé" });
    expect(put).toHaveBeenCalledWith("/homework/hw-1/", { title: "Devoir corrigé" });
    expect(patch).not.toHaveBeenCalled();
  });

  it("submits only server-supported fields to the homework-specific route", async () => {
    await homeworkService.submitHomework("hw-1", "student-1", "tenant-1", {
      content: "Ma réponse",
      id: "unsafe-id",
      student_id: "other-student",
      tenant_id: "other-tenant",
    });
    expect(post).toHaveBeenCalledWith("/homework/hw-1/submit/", {
      homework_id: "hw-1", student_id: "student-1", content: "Ma réponse",
    });
  });

  it("grades a submission using POST /grade, not PATCH /submissions", async () => {
    await homeworkService.gradeSubmission("sub-1", 16, "Bien");
    expect(post).toHaveBeenCalledWith("/homework/submissions/sub-1/grade/", {
      grade: 16, feedback: "Bien",
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it("propagates server errors instead of faking a successful submission", async () => {
    post.mockRejectedValueOnce(new Error("HTTP 403"));
    await expect(homeworkService.submitHomework("hw-1", "student-1", "tenant-1", {
      content: "Réponse",
    })).rejects.toThrow("HTTP 403");
  });
});
