import { describe, it, expect, vi, beforeEach } from "vitest";
import { parentsService } from "../parentsService";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  apiClient: {
    get: mocks.get,
  },
}));

describe("parentsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getChildren", () => {
    it("returns an empty array without a parent identifier", async () => {
      const result = await parentsService.getChildren("");

      expect(result).toEqual([]);
      expect(mocks.get).not.toHaveBeenCalled();
    });

    it("maps children returned by the API", async () => {
      mocks.get.mockResolvedValue({
        data: [
          {
            id: "1",
            student_id: "s1",
            students: { id: "s1", first_name: "John" },
          },
        ],
      });

      const result = await parentsService.getChildren("p1");

      expect(result).toHaveLength(1);
      expect(result[0].student.first_name).toBe("John");
      expect(mocks.get).toHaveBeenCalledWith("/parents/children/", {
        params: { parent_id: "p1" },
      });
    });
  });

  describe("getInvoices", () => {
    it("returns an empty array without student identifiers", async () => {
      const result = await parentsService.getInvoices([]);

      expect(result).toEqual([]);
      expect(mocks.get).not.toHaveBeenCalled();
    });

    it("lets the server scope « Tous » to the parent's children (no student_id)", async () => {
      // Avant : student_id=s1,s2 vers l'alias /invoices/ (identifiant
      // invalide, et l'alias ne filtrait pas par famille).
      const invoices = [{ id: "inv-1", status: "PENDING" }];
      mocks.get.mockResolvedValue({ data: { items: invoices, total: 1 } });

      const result = await parentsService.getInvoices(["s1", "s2"]);

      expect(result).toEqual(invoices);
      expect(mocks.get).toHaveBeenCalledWith("/payments/invoices/", {
        params: { page_size: 100 },
      });
    });

    it("filters invoices for one selected student", async () => {
      mocks.get.mockResolvedValue({ data: { items: [] } });

      const result = await parentsService.getInvoices(["s1", "s2"], "s2");

      expect(result).toEqual([]);
      expect(mocks.get).toHaveBeenCalledWith("/payments/invoices/", {
        params: { page_size: 100, student_id: "s2" },
      });
    });

    it("keeps only unpaid invoices for the unpaid list", async () => {
      mocks.get.mockResolvedValue({ data: { items: [
        { id: "a", status: "PENDING" }, { id: "b", status: "PAID" },
        { id: "c", status: "PARTIAL" }, { id: "d", status: "OVERDUE" },
      ] } });

      const result = await parentsService.getUnpaidInvoices(["s1"]);

      expect(result.map((inv) => inv.id)).toEqual(["a", "c", "d"]);
    });
  });
});
