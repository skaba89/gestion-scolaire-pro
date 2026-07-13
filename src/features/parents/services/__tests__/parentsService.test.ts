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

    it("fetches invoices for all selected students", async () => {
      const invoices = [{ id: "inv-1", amount: 100 }];
      mocks.get.mockResolvedValue({ data: invoices });

      const result = await parentsService.getInvoices(["s1", "s2"]);

      expect(result).toEqual(invoices);
      expect(mocks.get).toHaveBeenCalledWith("/invoices/", {
        params: { student_id: "s1,s2" },
      });
    });
  });
});
