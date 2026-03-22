import { KPICard } from "@/components/dashboard/KPICard";
import { DollarSign, TrendingUp, AlertCircle, GraduationCap, Users, UserCheck, Clock } from "lucide-react";
import { FinancialKPIs, AcademicKPIs, OperationalKPIs } from "@/queries/dashboardKPIs";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { StatsSkeleton } from "@/components/ui/SkeletonLibrary";

interface SectionProps {
    period: string;
    currency: string;
    isLoading?: boolean;
}

export const FinancialExecutiveKPIs = ({
    data,
    period,
    currency,
    isLoading
}: {
    data: FinancialKPIs | undefined;
    period: string;
    currency: string;
    isLoading?: boolean;
}) => {
    if (isLoading) return <StatsSkeleton count={4} />;
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: currency || 'XAF',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
                title="Revenus totaux"
                value={formatCurrency(data?.totalRevenue || 0)}
                subtitle={`Période: ${period}`}
                icon={<DollarSign className="w-4 h-4" />}
                status="good"
            />
            <KPICard
                title="Taux de recouvrement"
                value={`${data?.collectionRate.toFixed(1) || 0}%`}
                target={90}
                trend={{
                    value: 5.2,
                    direction: "up",
                    label: "vs période précédente",
                }}
                icon={<TrendingUp className="w-4 h-4" />}
                status={
                    (data?.collectionRate || 0) >= 90 ? "good" :
                        (data?.collectionRate || 0) >= 80 ? "warning" :
                            "critical"
                }
            />
            <KPICard
                title="Revenus encaissés"
                value={formatCurrency(data?.paidRevenue || 0)}
                subtitle="Montant payé"
                icon={<DollarSign className="w-4 h-4" />}
                status="good"
            />
            <KPICard
                title="Impayés"
                value={formatCurrency(data?.pendingRevenue || 0)}
                subtitle="À recouvrer"
                icon={<AlertCircle className="w-4 h-4" />}
                status={(data?.pendingRevenue || 0) > 500000 ? "warning" : "good"}
            />
        </div>
    );
};

export const AcademicExecutiveKPIs = ({
    data,
    riskScores,
    isLoading
}: {
    data: AcademicKPIs | undefined;
    riskScores?: { total: number; critical: number; high: number; moderate: number; low: number };
    isLoading?: boolean;
}) => {
    const { studentLabel, studentsLabel, StudentLabel, StudentsLabel } = useStudentLabel();
    if (isLoading) return <StatsSkeleton count={4} />;
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
                title="Taux de réussite global"
                value={`${data?.overallSuccessRate.toFixed(1) || 0}%`}
                target={85}
                trend={{
                    value: 2.3,
                    direction: "up",
                    label: "vs année précédente",
                }}
                icon={<GraduationCap className="w-4 h-4" />}
                status={
                    (data?.overallSuccessRate || 0) >= 85 ? "good" :
                        (data?.overallSuccessRate || 0) >= 75 ? "warning" :
                            "critical"
                }
            />
            <KPICard
                title={`${StudentsLabel} admis`}
                value={data?.passingStudents || 0}
                subtitle={`Sur ${data?.totalStudents || 0} ${studentsLabel}`}
                icon={<Users className="w-4 h-4" />}
                status="good"
            />
            <KPICard
                title="Moyenne générale"
                value={`${data?.averageGrade.toFixed(2) || 0}/20`}
                subtitle="Toutes matières confondues"
                icon={<GraduationCap className="w-4 h-4" />}
                status={(data?.averageGrade || 0) >= 12 ? "good" : "warning"}
            />
            <KPICard
                title={`${StudentsLabel} en difficulté`}
                value={data?.failingStudents || 0}
                subtitle="Nécessitent un suivi"
                icon={<AlertCircle className="w-4 h-4" />}
                status={(data?.failingStudents || 0) > 50 ? "warning" : "good"}
            />
            <KPICard
                title={`${StudentsLabel} à risque`}
                value={riskScores?.critical || 0}
                subtitle={`${(riskScores?.high || 0)} élevé, ${(riskScores?.moderate || 0)} modéré`}
                icon={<AlertCircle className="w-4 h-4" />}
                status={
                    (riskScores?.critical || 0) > 5 ? "critical" :
                        (riskScores?.critical || 0) > 2 ? "warning" : "good"
                }
            />
        </div>
    );
};

export const OperationalExecutiveKPIs = ({
    data,
    isLoading
}: {
    data: OperationalKPIs | undefined;
    isLoading?: boolean;
}) => {
    const { studentsLabel } = useStudentLabel();
    if (isLoading) return <StatsSkeleton count={4} />;
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
                title={`Taux de présence ${studentsLabel}`}
                value={`${data?.studentAttendanceRate.toFixed(1) || 0}%`}
                target={95}
                icon={<UserCheck className="w-4 h-4" />}
                status={
                    (data?.studentAttendanceRate || 0) >= 95 ? "good" :
                        (data?.studentAttendanceRate || 0) >= 90 ? "warning" :
                            "critical"
                }
            />
            <KPICard
                title="Présence profs (Actifs)"
                value={`${data?.teacherAttendanceRate.toFixed(1) || 0}%`}
                target={95}
                icon={<UserCheck className="w-4 h-4" />}
                subtitle="Basé sur les heures saisies"
                status={
                    (data?.teacherAttendanceRate || 0) >= 90 ? "good" :
                        (data?.teacherAttendanceRate || 0) >= 70 ? "warning" :
                            "critical"
                }
            />
            <KPICard
                title="Charge de travail (Total)"
                value={`${data?.totalTeacherHours || 0}h`}
                subtitle="Heures totales déclarées"
                icon={<Clock className="w-4 h-4" />}
                status="good"
            />
            <KPICard
                title="Taux d'abandon"
                value={`${data?.dropoutRate.toFixed(1) || 0}%`}
                subtitle={`${data?.dropoutCount || 0} ${studentsLabel}`}
                icon={<AlertCircle className="w-4 h-4" />}
                status={
                    (data?.dropoutRate || 0) <= 2 ? "good" :
                        (data?.dropoutRate || 0) <= 5 ? "warning" :
                            "critical"
                }
            />
        </div>
    );
};
