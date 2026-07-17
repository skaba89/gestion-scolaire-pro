import { describe, it, expect, vi, beforeEach } from "vitest";
import { studentsService } from "../studentsService";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  apiClient: {
    get: mocks.get,
    post: mocks.post,
    put: mocks.put,
    delete: mocks.delete,
  },
}));

describe("studentsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listStudents (administration)", () => {
    it("mappe la réponse paginée {items,total} vers {students,totalCount}", async () => {
      mocks.get.mockResolvedValue({
        data: { items: [{ id: "s1" }], total: 42, page: 2, page_size: 10, pages: 5 },
      });

      const result = await studentsService.listStudents("tenant-1", {
        page: 2,
        pageSize: 10,
        search: "cam",
      });

      expect(result).toEqual({ students: [{ id: "s1" }], totalCount: 42 });
      expect(mocks.get).toHaveBeenCalledWith("/students/", {
        params: { page: 2, page_size: 10, search: "cam", status: "ACTIVE" },
      });
    });

    it("la vue archivés filtre sur le statut de sortie", async () => {
      mocks.get.mockResolvedValue({ data: { items: [], total: 0 } });

      await studentsService.listStudents("tenant-1", { isArchived: true });

      expect(mocks.get.mock.calls[0][1].params.status).toBe("DROPPED_OUT");
    });

    it("retourne une liste vide sans tenant", async () => {
      const result = await studentsService.listStudents("");
      expect(result).toEqual({ students: [], totalCount: 0 });
      expect(mocks.get).not.toHaveBeenCalled();
    });
  });

  describe("createStudent", () => {
    it("poste sur /students/ avec le tenant et retourne l'élève créé", async () => {
      const created = { id: "s-new", first_name: "Aminata" };
      mocks.post.mockResolvedValue({ data: created });

      const result = await studentsService.createStudent("tenant-1", {
        first_name: "Aminata",
        last_name: "CAMARA",
        gender: "FEMALE",
      });

      expect(result).toEqual(created);
      expect(mocks.post).toHaveBeenCalledWith("/students/", {
        first_name: "Aminata",
        last_name: "CAMARA",
        gender: "FEMALE",
        tenant_id: "tenant-1",
      });
    });
  });

  describe("archiveStudent", () => {
    it("archive via le statut métier (pas de colonne is_archived)", async () => {
      mocks.put.mockResolvedValue({ data: { id: "s1", status: "DROPPED_OUT" } });

      await studentsService.archiveStudent("s1", true);
      expect(mocks.put).toHaveBeenCalledWith("/students/s1/", { status: "DROPPED_OUT" });

      await studentsService.archiveStudent("s1", false);
      expect(mocks.put).toHaveBeenLastCalledWith("/students/s1/", { status: "ACTIVE" });
    });
  });

  describe("createStudentAccount", () => {
    it("convertit la fiche en compte via /users/convert/", async () => {
      mocks.post.mockResolvedValue({ data: { delivery: { expires_in: 900 } } });

      const result = await studentsService.createStudentAccount(
        { id: "s1", email: "eleve@ecole.gn", first_name: "A", last_name: "B" },
        { id: "tenant-1" },
      );

      expect(result.emailSent).toBe(true);
      expect(mocks.post).toHaveBeenCalledWith("/users/convert/", {
        type: "student",
        id: "s1",
        email: "eleve@ecole.gn",
        first_name: "A",
        last_name: "B",
      });
    });

    it("refuse une fiche sans email avec un message clair", async () => {
      await expect(
        studentsService.createStudentAccount({ id: "s1", email: "" }, { id: "t1" }),
      ).rejects.toThrow(/adresse email/);
      expect(mocks.post).not.toHaveBeenCalled();
    });
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
