import { describe, it, expect, vi, beforeEach } from "vitest";
import { studentsService } from "../studentsService";
import { supabase } from "@/integrations/supabase/client";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
    supabase: {
        from: vi.fn(),
    },
}));

describe("studentsService", () => {
    const mockSingle = vi.fn();
    const mockEq = vi.fn();
    const mockSelect = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup a more robust mock chain
        const mockQuery: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
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

    describe("getProfile", () => {
        it("should return profile data on success", async () => {
            const mockData = { id: "student-1", first_name: "John", last_name: "Doe" };
            const mockQuery = (supabase.from as any)();
            mockQuery.then.mockImplementation((onFulfilled: any) => {
                return Promise.resolve({ data: mockData, error: null }).then(onFulfilled);
            });

            const result = await studentsService.getProfile("user-1", "tenant-1");

            expect(result).toEqual(mockData);
        });

        it("should return null if no user id or tenant id is provided", async () => {
            const result = await studentsService.getProfile("", "");
            expect(result).toBeNull();
            expect(supabase.from).not.toHaveBeenCalled();
        });

        it("should throw error on database error", async () => {
            const mockError = new Error("DB Error");
            const mockQuery = (supabase.from as any)();
            mockQuery.then.mockImplementation((onFulfilled: any) => {
                return Promise.resolve({ data: null, error: mockError }).then(onFulfilled);
            });

            await expect(studentsService.getProfile("user-1", "tenant-1")).rejects.toThrow("DB Error");
        });
    });

    describe("getEnrollment", () => {
        it("should return active enrollment data", async () => {
            const mockData = { id: "enr-1", class_id: "class-1", status: "active" };
            const mockQuery = (supabase.from as any)();
            mockQuery.then.mockImplementation((onFulfilled: any) => {
                return Promise.resolve({ data: mockData, error: null }).then(onFulfilled);
            });

            const result = await studentsService.getEnrollment("student-1");

            expect(result).toEqual(mockData);
        });
    });

    describe("getGrades", () => {
        it("should return student grades", async () => {
            const mockData = [{ id: "grade-1", grade: 15 }];
            const mockQuery = (supabase.from as any)();
            mockQuery.then.mockImplementation((onFulfilled: any) => {
                return Promise.resolve({ data: mockData, error: null }).then(onFulfilled);
            });

            const result = await studentsService.getGrades("student-1");

            expect(result).toEqual(mockData);
        });
    });
});
