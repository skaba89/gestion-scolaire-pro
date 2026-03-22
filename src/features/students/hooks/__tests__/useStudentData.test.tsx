import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStudentData } from "../useStudentData";
import { studentsService } from "@/features/students/services/studentsService";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import React from "react";

// Mock dependencies
vi.mock("@/features/students/services/studentsService");
vi.mock("@/contexts/AuthContext");
vi.mock("@/contexts/TenantContext");

describe("useStudentData Hook", () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        vi.clearAllMocks();
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });

        // Default mocks
        (useAuth as any).mockReturnValue({ user: { id: "user-1" } });
        (useTenant as any).mockReturnValue({ tenant: { id: "tenant-1" } });

        (studentsService.getProfile as any).mockResolvedValue({ id: "student-1" });
        (studentsService.getEnrollment as any).mockResolvedValue({ class_id: "class-1" });
        (studentsService.getGrades as any).mockResolvedValue([]);
        (studentsService.getHomework as any).mockResolvedValue([]);
        (studentsService.getSchedule as any).mockResolvedValue([]);
        (studentsService.getCheckInHistory as any).mockResolvedValue([]);
        (studentsService.getSubmissions as any).mockResolvedValue([]);
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client= { queryClient } > { children } </QueryClientProvider>
  );

it("should fetch all student data when user and tenant are present", async () => {
    const { result } = renderHook(() => useStudentData(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(studentsService.getProfile).toHaveBeenCalledWith("user-1", "tenant-1");
    expect(result.current.studentId).toBe("student-1");
    expect(result.current.classId).toBe("class-1");
    expect(result.current.student).toEqual({ id: "student-1" });
});

it("should not fetch data if user or tenant is missing", async () => {
    (useAuth as any).mockReturnValue({ user: null });

    const { result } = renderHook(() => useStudentData(), { wrapper });

    expect(studentsService.getProfile).not.toHaveBeenCalled();
    expect(result.current.studentId).toBeUndefined();
});

it("should expose loading state correctly", async () => {
    // delay mock to test loading state
    (studentsService.getProfile as any).mockReturnValue(new Promise(resolve => setTimeout(() => resolve({ id: "student-1" }), 100)));

    const { result } = renderHook(() => useStudentData(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 1000 });
});
});
