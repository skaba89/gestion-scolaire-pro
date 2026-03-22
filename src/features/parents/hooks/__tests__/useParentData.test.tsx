import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useParentData } from "../useParentData";
import { parentsService } from "@/features/parents/services/parentsService";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import React from "react";

// Mock dependencies
vi.mock("@/features/parents/services/parentsService");
vi.mock("@/contexts/AuthContext");
vi.mock("@/contexts/TenantContext");

describe("useParentData Hook", () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        vi.clearAllMocks();
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });

        // Default mocks
        (useAuth as any).mockReturnValue({ user: { id: "parent-1" } });
        (useTenant as any).mockReturnValue({ tenant: { id: "tenant-1" } });

        (parentsService.getChildren as any).mockResolvedValue([
            { id: "1", student_id: "s1", student: { id: "s1", first_name: "John" } }
        ]);
        (parentsService.getInvoices as any).mockResolvedValue([]);
        (parentsService.getUnpaidInvoices as any).mockResolvedValue([]);
        (parentsService.getRecentGrades as any).mockResolvedValue([]);
        (parentsService.getAttendanceAlerts as any).mockResolvedValue([]);
        (parentsService.getChildCheckInHistory as any).mockResolvedValue([]);
        (parentsService.getUpcomingEvents as any).mockResolvedValue([]);
        (parentsService.getNotifications as any).mockResolvedValue([]);
        (parentsService.getUnreadMessagesCount as any).mockResolvedValue(0);
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    it("should fetch children and initial data", async () => {
        const { result } = renderHook(() => useParentData(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(parentsService.getChildren).toHaveBeenCalledWith("parent-1");
        expect(result.current.children).toHaveLength(1);
        expect(result.current.studentIds).toEqual(["s1"]);
    });
});
