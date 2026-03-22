import { apiClient } from "@/api/client";
import type { StaffProfile, StaffFilters, StaffFormData } from "../types";

export const staffService = {
    /**
     * List staff members with pagination and filters
     */
    async listStaff(
        _tenantId: string,
        options?: StaffFilters & { page?: number; pageSize?: number }
    ): Promise<{ data: StaffProfile[]; totalCount: number }> {
        const params: any = {
            page: options?.page || 1,
            page_size: options?.pageSize || 50,
            search: options?.searchTerm,
            is_active: options?.isActive,
            role: options?.role
        };

        const { data } = await apiClient.get("/users/", { params });

        // Map results if needed. The backend returns avatar_url, frontend expects photo_url
        const staff = (data.items || []).map((u: any) => ({
            ...u,
            photo_url: u.avatar_url
        }));

        return {
            data: staff as StaffProfile[],
            totalCount: data.total || 0,
        };
    },

    /**
     * Add a staff member
     */
    async addStaff(_tenantId: string, data: StaffFormData): Promise<void> {
        // We use the POST /users endpoint which handles both creation and role assignment
        await apiClient.post("/users/", {
            email: data.email,
            first_name: data.first_name,
            last_name: data.last_name,
            roles: [data.role]
        });
    },

    /**
     * Remove a staff role
     */
    async removeStaffRole(_tenantId: string, userId: string, role: string): Promise<void> {
        // Fetch current roles
        const { data: user } = await apiClient.get(`/users/${userId}/`);
        const currentRoles: string[] = user.roles || [];
        
        // Filter out the role to remove
        const updatedRoles = currentRoles.filter(r => r !== role);
        
        // Update roles
        await apiClient.put(`/users/${userId}/roles/`, {
            roles: updatedRoles
        });
    },

    /**
     * Get teacher schedule (via teacher-specific dashboard or separate endpoint)
     */
    async getTeacherSchedule(_teacherId: string) {
        // Our backend has a specific dashboard for teachers that includes schedule
        const { data } = await apiClient.get("/teachers/dashboard/");
        return data.schedule;
    },

    /**
     * Get teacher assignments (class + subject pairs)
     */
    async getTeacherAssignments(_tenantId: string, _teacherId: string) {
        const { data } = await apiClient.get("/teachers/dashboard/");
        return data.assignments || [];
    }
};
