import { Card, CardContent } from "@/components/ui/card";
import { Users, FileText, Calendar, CreditCard } from "lucide-react";
import { useHumanResources } from "@/hooks/useHumanResources";

export function HRStats() {
    const { useEmployees, useContracts, useLeaveRequests, usePayslips } = useHumanResources();
    const { data: employeesData } = useEmployees();
    const { data: contractsData } = useContracts();
    const { data: leaveRequestsData, isLoading: isLeaveRequestsLoading } = useLeaveRequests();
    const { data: payslipsData } = usePayslips();

    const employees = employeesData?.employees || [];
    const contracts = contractsData?.contracts || [];
    const leaveRequests = leaveRequestsData?.leaveRequests || [];
    const payslips = payslipsData?.payslips || [];

    const stats = {
        totalEmployees: employees.filter(e => e?.is_active).length,
        activeContracts: contracts.filter(c => c?.is_current).length,
        pendingLeaves: leaveRequests.filter(l => l?.status === "PENDING").length,
        payslipsThisMonth: payslips.filter(p =>
            p?.period_month === new Date().getMonth() + 1 &&
            p?.period_year === new Date().getFullYear()
        ).length
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-100 rounded-lg">
                            <Users className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.totalEmployees}</p>
                            <p className="text-sm text-muted-foreground">Employés actifs</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-100 rounded-lg">
                            <FileText className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.activeContracts}</p>
                            <p className="text-sm text-muted-foreground">Contrats en cours</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-yellow-100 rounded-lg">
                            <Calendar className="h-6 w-6 text-yellow-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.pendingLeaves}</p>
                            <p className="text-sm text-muted-foreground">Congés en attente</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-100 rounded-lg">
                            <CreditCard className="h-6 w-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.payslipsThisMonth}</p>
                            <p className="text-sm text-muted-foreground">Bulletins ce mois</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
