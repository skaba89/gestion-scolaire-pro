import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, Clock } from "lucide-react";

interface SessionAttendanceStatsProps {
    totalStudents: number;
    presentStudents: number;
    absentStudents: number;
    attendanceRate: number;
    studentsLabel: string;
}

export const SessionAttendanceStats = ({
    totalStudents,
    presentStudents,
    absentStudents,
    attendanceRate,
    studentsLabel,
}: SessionAttendanceStatsProps) => {
    return (
        <div className="grid gap-4 md:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total {studentsLabel}</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalStudents}</div>
                </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-green-800">Présents</CardTitle>
                    <UserCheck className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{presentStudents}</div>
                </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-red-800">Absents</CardTitle>
                    <UserX className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-red-600">{absentStudents}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Taux</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{attendanceRate}%</div>
                </CardContent>
            </Card>
        </div>
    );
};
