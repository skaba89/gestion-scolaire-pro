import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  CalendarDays, 
  Check, 
  X, 
  Clock, 
  AlertCircle,
  TrendingUp
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { fr } from "date-fns/locale";

interface AttendanceHistoryProps {
  studentId: string;
  studentName?: string;
}

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

const statusConfig: Record<AttendanceStatus, { label: string; icon: typeof Check; color: string }> = {
  PRESENT: { label: "Présent", icon: Check, color: "text-green-600 bg-green-100" },
  ABSENT: { label: "Absent", icon: X, color: "text-red-600 bg-red-100" },
  LATE: { label: "Retard", icon: Clock, color: "text-orange-600 bg-orange-100" },
  EXCUSED: { label: "Excusé", icon: AlertCircle, color: "text-blue-600 bg-blue-100" },
};

export const AttendanceHistory = ({ studentId, studentName }: AttendanceHistoryProps) => {
  const { tenant } = useTenant();

  const { data: attendanceRecords, isLoading } = useQuery({
    queryKey: ["student-attendance-history", studentId, tenant?.id],
    queryFn: async () => {
      if (!studentId || !tenant?.id) return [];
      
      // Get attendance for last 3 months
      const threeMonthsAgo = subMonths(new Date(), 3);
      
      const { data } = await apiClient.get<any[]>("/attendance/", {
        params: {
          student_id: studentId,
          tenant_id: tenant.id,
          date_gte: format(threeMonthsAgo, "yyyy-MM-dd"),
          ordering: "-date",
        },
      });
      return data;
    },
    enabled: !!studentId && !!tenant?.id,
  });

  // Calculate statistics
  const calculateStats = (records: typeof attendanceRecords, startDate: Date, endDate: Date) => {
    if (!records) return { present: 0, absent: 0, late: 0, excused: 0, total: 0, rate: 0 };
    
    const filtered = records.filter(r => {
      const date = new Date(r.date);
      return date >= startDate && date <= endDate;
    });

    const stats = {
      present: filtered.filter(r => r.status === "PRESENT").length,
      absent: filtered.filter(r => r.status === "ABSENT").length,
      late: filtered.filter(r => r.status === "LATE").length,
      excused: filtered.filter(r => r.status === "EXCUSED").length,
      total: filtered.length,
      rate: 0,
    };

    stats.rate = stats.total > 0 
      ? Math.round((stats.present / stats.total) * 100) 
      : 100;

    return stats;
  };

  const now = new Date();
  const currentMonthStats = calculateStats(
    attendanceRecords,
    startOfMonth(now),
    endOfMonth(now)
  );
  
  const lastMonthStats = calculateStats(
    attendanceRecords,
    startOfMonth(subMonths(now, 1)),
    endOfMonth(subMonths(now, 1))
  );

  const quarterStats = calculateStats(
    attendanceRecords,
    subMonths(now, 3),
    now
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Chargement de l'historique...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {studentName && (
        <div>
          <h2 className="text-xl font-semibold">{studentName}</h2>
          <p className="text-muted-foreground">Historique des présences</p>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ce mois ({format(now, "MMMM", { locale: fr })})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-bold">{currentMonthStats.rate}%</span>
              <TrendingUp className={`w-5 h-5 ${currentMonthStats.rate >= 90 ? 'text-green-600' : currentMonthStats.rate >= 75 ? 'text-orange-600' : 'text-red-600'}`} />
            </div>
            <Progress value={currentMonthStats.rate} className="h-2" />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>{currentMonthStats.present} présences</span>
              <span>{currentMonthStats.absent} absences</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Mois précédent ({format(subMonths(now, 1), "MMMM", { locale: fr })})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-bold">{lastMonthStats.rate}%</span>
              <TrendingUp className={`w-5 h-5 ${lastMonthStats.rate >= 90 ? 'text-green-600' : lastMonthStats.rate >= 75 ? 'text-orange-600' : 'text-red-600'}`} />
            </div>
            <Progress value={lastMonthStats.rate} className="h-2" />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>{lastMonthStats.present} présences</span>
              <span>{lastMonthStats.absent} absences</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Trimestre (3 derniers mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-bold">{quarterStats.rate}%</span>
              <TrendingUp className={`w-5 h-5 ${quarterStats.rate >= 90 ? 'text-green-600' : quarterStats.rate >= 75 ? 'text-orange-600' : 'text-red-600'}`} />
            </div>
            <Progress value={quarterStats.rate} className="h-2" />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>{quarterStats.present} présences</span>
              <span>{quarterStats.absent + quarterStats.late} absences/retards</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            Détail trimestriel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <Check className="w-6 h-6 text-green-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-green-600">{quarterStats.present}</p>
              <p className="text-xs text-muted-foreground">Présences</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <X className="w-6 h-6 text-red-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-red-600">{quarterStats.absent}</p>
              <p className="text-xs text-muted-foreground">Absences</p>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <Clock className="w-6 h-6 text-orange-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-orange-600">{quarterStats.late}</p>
              <p className="text-xs text-muted-foreground">Retards</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <AlertCircle className="w-6 h-6 text-blue-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-blue-600">{quarterStats.excused}</p>
              <p className="text-xs text-muted-foreground">Excusés</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Records */}
      <Card>
        <CardHeader>
          <CardTitle>Historique récent</CardTitle>
        </CardHeader>
        <CardContent>
          {attendanceRecords && attendanceRecords.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceRecords.slice(0, 20).map((record) => {
                  const status = record.status as AttendanceStatus;
                  const config = statusConfig[status] || statusConfig.PRESENT;
                  const Icon = config.icon;
                  
                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        {format(new Date(record.date), "EEEE d MMMM yyyy", { locale: fr })}
                      </TableCell>
                      <TableCell>
                        <Badge className={config.color}>
                          <Icon className="w-3 h-3 mr-1" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {record.notes || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-8 text-muted-foreground">
              Aucun enregistrement de présence
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
