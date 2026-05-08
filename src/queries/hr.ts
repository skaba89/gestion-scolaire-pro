import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import { Employee, Contract, LeaveRequest, Payslip } from "@/types/humanResources";

export const hrQueries = {
    employees: (tenantId: string, options?: { page?: number; pageSize?: number }) => ({
        queryKey: ["employees", tenantId, options?.page, options?.pageSize] as const,
        queryFn: async () => {
            const response = await apiClient.get<Employee[]>("/hr/employees/");
            // Pagination is not yet implemented on backend, but we return expected structure
            return {
                employees: response.data,
                totalCount: response.data.length
            };
        },
        enabled: !!tenantId,
    }),
    contracts: (tenantId: string, options?: { page?: number; pageSize?: number }) => ({
        queryKey: ["employment_contracts", tenantId, options?.page, options?.pageSize] as const,
        queryFn: async () => {
            const response = await apiClient.get<Contract[]>("/hr/contracts/");
            return {
                contracts: response.data,
                totalCount: response.data.length
            };
        },
        enabled: !!tenantId,
    }),
    leaveRequests: (tenantId: string, options?: { page?: number; pageSize?: number }) => ({
        queryKey: ["leave_requests", tenantId, options?.page, options?.pageSize] as const,
        queryFn: async () => {
            const response = await apiClient.get<LeaveRequest[]>("/hr/leave-requests/");
            return {
                leaveRequests: response.data,
                totalCount: response.data.length
            };
        },
        enabled: !!tenantId,
    }),
    payslips: (tenantId: string, options?: { page?: number; pageSize?: number }) => ({
        queryKey: ["payslips", tenantId, options?.page, options?.pageSize] as const,
        queryFn: async () => {
            const response = await apiClient.get<Payslip[]>("/hr/payslips/");
            return {
                payslips: response.data,
                totalCount: response.data.length
            };
        },
        enabled: !!tenantId,
    }),
    /**
     * Returns the last contract_number string (e.g. "CTR-2026-0003") so that
     * ContractDialog can auto-increment the next sequence number.
     * Derives from existing contracts — no dedicated backend endpoint needed.
     */
    lastContractNumber: (tenantId: string) => ({
        queryKey: ["lastContractNumber", tenantId] as const,
        queryFn: async (): Promise<string | null> => {
            const response = await apiClient.get<Contract[]>("/hr/contracts/");
            const contracts = response.data;
            if (!contracts || contracts.length === 0) return null;
            // Sort descending by contract_number (CTR-YEAR-SEQ format sorts lexicographically)
            const sorted = [...contracts]
                .map(c => c.contract_number)
                .filter(Boolean)
                .sort((a, b) => b.localeCompare(a));
            return sorted[0] ?? null;
        },
        enabled: !!tenantId,
    }),
};
// --- Employee Mutations ---

export const useCreateEmployee = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (employeeData: Partial<Employee>) => {
            const response = await apiClient.post<Employee>("/hr/employees/", employeeData);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["employees", tenantId] });
            toast.success("Employé ajouté avec succès");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        }
    });
};

export const useUpdateEmployee = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...employeeData }: Partial<Employee> & { id: string }) => {
            const response = await apiClient.put<Employee>(`/hr/employees/${id}/`, employeeData);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["employees", tenantId] });
            toast.success("Employé mis à jour");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        }
    });
};

export const useDeleteEmployee = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/hr/employees/${id}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["employees", tenantId] });
            toast.success("Employé supprimé");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        }
    });
};

// --- Contract Mutations ---

export const useCreateContract = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (contractData: any) => {
            const response = await apiClient.post<Contract>("/hr/contracts/", contractData);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["employment_contracts", tenantId] });
            toast.success("Contrat créé avec succès");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la création du contrat: " + (error.response?.data?.detail || error.message));
        }
    });
};

export const useUpdateContract = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...contractData }: any) => {
            const response = await apiClient.put<Contract>(`/hr/contracts/${id}/`, contractData);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["employment_contracts", tenantId] });
            toast.success("Contrat mis à jour");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        }
    });
};

export const useDeleteContract = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/hr/contracts/${id}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["employment_contracts", tenantId] });
            toast.success("Contrat supprimé");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        }
    });
};

// --- Leave Mutations ---

export const useCreateLeaveRequest = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (leaveData: any) => {
            const response = await apiClient.post<LeaveRequest>("/hr/leave-requests/", leaveData);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["leave_requests", tenantId] });
            toast.success("Demande de congé créée");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        }
    });
};

export const useUpdateLeaveStatus = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }) => {
            const response = await apiClient.put<LeaveRequest>(`/hr/leave-requests/${id}/`, { status });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["leave_requests", tenantId] });
            toast.success("Statut mis à jour");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        }
    });
};

export const useDeleteLeaveRequest = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/hr/leave-requests/${id}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["leave_requests", tenantId] });
            toast.success("Demande de congé supprimée");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        }
    });
};

// --- Payslip Mutations ---

export const useCreatePayslip = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payslipData: any) => {
            const response = await apiClient.post<Payslip>("/hr/payslips/", payslipData);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["payslips", tenantId] });
            toast.success("Fiche de paie créée");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        }
    });
};

export const useDeletePayslip = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/hr/payslips/${id}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["payslips", tenantId] });
            toast.success("Fiche de paie supprimée");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        }
    });
};

export const useUpdatePayslip = (tenantId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...payslipData }: any) => {
            const response = await apiClient.put<Payslip>(`/hr/payslips/${id}/`, payslipData);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["payslips", tenantId] });
            toast.success("Fiche de paie mise à jour");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        }
    });
};
