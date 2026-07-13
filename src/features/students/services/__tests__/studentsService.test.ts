import { describe, it, expect, vi, beforeEach } from "vitest";
import { studentsService } from "../studentsService";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  apiClient: {
    get: mocks.get,
  },
}));

describe("studentsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProfile", () => {
    it("returns profile data on success", async () => {
      const profile = {
        id: "student-1",
        first_name: "John",
        last_name: "Doe",
      };
      mocks.get.mockResolvedValue({ data: profile });

      const result = await studentsService.getProfile("user-1", "tenant-1");

      expect(result).toEqual(profile);
      expect(mocks.get).toHaveBeenCalledWith("/students/profile/", {
        params: { user_id: "user-1", tenant_id: "tenant-1" },
      });
    });

    it("returns null without user or tenant identifiers", async () => {
      const result = await studentsService.getProfile("", "");

      expect(result).toBeNull();
      expect(mocks.get).not.toHaveBeenCalled();
    });

    it("propagates API errors", async () => {
      mocks.get.mockRejectedValue(new Error("DB Error"));

      await expect(
        studentsService.getProfile("user-1", "tenant-1")
      ).rejects.toThrow("DB Error");
    });
  });

  describe("getEnrollment", () => {
    it("returns the active enrollment", async () => {
      const enrollment = {
        id: "enr-1",
        class_id: "class-1",
        status: "active",
      };
      mocks.get.mockResolvedValue({ data: enrollment });

      const result = await studentsService.getEnrollment("student-1");

      expect(result).toEqual(enrollment);
      expect(mocks.get).toHaveBeenCalledWith(
        "/students/student-1/enrollment/",
        { params: { status: "active" } }
      );
    });
  });

  describe("getGrades", () => {
    it("returns student grades", async () => {
      const grades = [{ id: "grade-1", grade: 15 }];
      mocks.get.mockResolvedValue({ data: grades });

      const result = await studentsService.getGrades("student-1");

      expect(result).toEqual(grades);
      expect(mocks.get).toHaveBeenCalledWith("/grades/", {
        params: { student_id: "student-1" },
      });
    });
  });
});
