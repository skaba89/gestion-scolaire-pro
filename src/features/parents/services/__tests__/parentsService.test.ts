import { describe, it, expect, vi, beforeEach } from "vitest";
import { parentsService } from "../parentsService";

// Supabase shim removed (P2-22) — replaced by direct API calls via apiClient.
// Local stub kept for backward-compatible test assertions only.
const supabase = {
    from: vi.fn(),
};

describe("parentsService", () => {
    const mockSingle = vi.fn();
    const mockEq = vi.fn();
    const mockSelect = vi.fn();
    const mockOrder = vi.fn();
    const mockIn = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup a more robust mock chain
        const mockQuery: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockReturnThis(),
            // Make it awaitable
            then: vi.fn().mockImplementation((onFulfilled) => {
                return Promise.resolve({ data: [], error: null }).then(onFulfilled);
            }),
        };

        (supabase.from as any).mockReturnValue(mockQuery);
    });

    describe("getChildren", () => {
        it("should return empty array if no parentId", async () => {
            const result = await parentsService.getChildren("");
            expect(result).toEqual([]);
        });

        it("should return children on success", async () => {
            const mockData = [
                { id: "1", student_id: "s1", students: { id: "s1", first_name: "John" } }
            ];
            const mockQuery = (supabase.from as any)();
            mockQuery.then.mockImplementation((onFulfilled: any) => {
                return Promise.resolve({ data: mockData, error: null }).then(onFulfilled);
            });

            const result = await parentsService.getChildren("p1");

            expect(result).toHaveLength(1);
            expect(result[0].student.first_name).toBe("John");
        });
    });

    describe("getInvoices", () => {
        it("should return empty array if no studentIds", async () => {
            const result = await parentsService.getInvoices([]);
            expect(result).toEqual([]);
        });

        it("should fetch invoices on success", async () => {
            const mockData = [{ id: "inv-1", amount: 100 }];
            const mockQuery = (supabase.from as any)();
            mockQuery.then.mockImplementation((onFulfilled: any) => {
                return Promise.resolve({ data: mockData, error: null }).then(onFulfilled);
            });

            const result = await parentsService.getInvoices(["s1", "s2"]);

            expect(result).toEqual(mockData);
        });
    });
});
