import {
    RevenueTrendChart,
    OutstandingByClassChart,
    SuccessRateByClassChart,
    SuccessRateBySubjectChart,
    GradeEvolutionChart,
    EnrollmentByClassChart,
    AttendanceTrendChart,
    TeacherWorkloadChart,
} from "@/components/dashboard/Charts";

interface FinancialChartsProps {
    revenueTrend: any;
    outstandingByClass: any;
}

export const FinancialExecutiveCharts = ({ revenueTrend, outstandingByClass }: FinancialChartsProps) => (
    <div className="grid gap-6 md:grid-cols-2">
        {revenueTrend && <RevenueTrendChart data={revenueTrend} />}
        {outstandingByClass && <OutstandingByClassChart data={outstandingByClass} />}
    </div>
);

interface AcademicChartsProps {
    successByClass: any;
    successBySubject: any;
    gradeEvolution: any;
}

export const AcademicExecutiveCharts = ({ successByClass, successBySubject, gradeEvolution }: AcademicChartsProps) => (
    <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
            {successByClass && <SuccessRateByClassChart data={successByClass} />}
            {successBySubject && <SuccessRateBySubjectChart data={successBySubject} />}
        </div>
        {gradeEvolution && <GradeEvolutionChart data={gradeEvolution} />}
    </div>
);

interface OperationalChartsProps {
    enrollmentByClass: any;
    attendanceTrend: any;
    teacherWorkload?: any;
}

export const OperationalExecutiveCharts = ({ enrollmentByClass, attendanceTrend, teacherWorkload }: OperationalChartsProps) => (
    <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
            {enrollmentByClass && <EnrollmentByClassChart data={enrollmentByClass} />}
            {attendanceTrend && <AttendanceTrendChart data={attendanceTrend} />}
        </div>
        {teacherWorkload && <TeacherWorkloadChart data={teacherWorkload} />}
    </div>
);
