import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import * as hrQueriesExport from "@/queries/hr";

export const useHumanResources = () => {
    const { tenant } = useTenant();
    const tenantId = tenant?.id || "";

    const useEmployees = (options?: { page?: number; pageSize?: number }) =>
        useQuery(hrQueriesExport.hrQueries.employees(tenantId, options));
    
    const useCreateEmployee = () => hrQueriesExport.useCreateEmployee(tenantId);
    const useUpdateEmployee = () => hrQueriesExport.useUpdateEmployee(tenantId);
    const useDeleteEmployee = () => hrQueriesExport.useDeleteEmployee(tenantId);

    const useContracts = (options?: { page?: number; pageSize?: number }) =>
        useQuery(hrQueriesExport.hrQueries.contracts(tenantId, options));
    
    const useCreateContract = () => hrQueriesExport.useCreateContract(tenantId);
    const useUpdateContract = () => hrQueriesExport.useUpdateContract(tenantId);
    const useDeleteContract = () => hrQueriesExport.useDeleteContract(tenantId);

    const useLeaveRequests = (options?: { page?: number; pageSize?: number }) =>
        useQuery(hrQueriesExport.hrQueries.leaveRequests(tenantId, options));
    
    const useCreateLeaveRequest = () => hrQueriesExport.useCreateLeaveRequest(tenantId);
    const useUpdateLeaveStatus = () => hrQueriesExport.useUpdateLeaveStatus(tenantId);
    const useDeleteLeaveRequest = () => hrQueriesExport.useDeleteLeaveRequest(tenantId);

    const usePayslips = (options?: { page?: number; pageSize?: number }) =>
        useQuery(hrQueriesExport.hrQueries.payslips(tenantId, options));
    
    const useCreatePayslip = () => hrQueriesExport.useCreatePayslip(tenantId);
    const useUpdatePayslip = () => hrQueriesExport.useUpdatePayslip(tenantId);
    const useDeletePayslip = () => hrQueriesExport.useDeletePayslip(tenantId);

    const useLastEmployeeNumber = () => useQuery({
        queryKey: ["last-employee-number", tenantId],
        queryFn: async () => {
            const response = await apiClient.get<string | null>("/hr/last-employee-number/");
            return response.data;
        },
        enabled: !!tenantId,
    });

    return {
        useEmployees,
        useCreateEmployee,
        useUpdateEmployee,
        useDeleteEmployee,
        useLastEmployeeNumber,
        useContracts,
        useCreateContract,
        useUpdateContract,
        useDeleteContract,
        useLeaveRequests,
        useCreateLeaveRequest,
        useUpdateLeaveStatus,
        useDeleteLeaveRequest,
        usePayslips,
        useCreatePayslip,
        useUpdatePayslip,
        useDeletePayslip
    };
};
