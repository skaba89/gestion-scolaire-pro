import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useTeacherData } from "@/features/staff/hooks/useStaff";
import { useAttendance } from "@/features/attendance/hooks/useAttendance";
import { useAbsenceNotifications } from "@/hooks/useAbsenceNotifications";
import { useParentAlerts } from "@/hooks/useParentAlerts";
import { useAuditLog } from "@/hooks/useAuditLog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { TableSkeleton } from "@/components/ui/TableSkeleton";

// Modular Components
import { TeacherAttendanceHeader } from "@/components/teacher/TeacherAttendanceHeader";
import { TeacherAttendanceStats } from "@/components/teacher/TeacherAttendanceStats";
import { TeacherAttendanceTable } from "@/components/teacher/TeacherAttendanceTable";

const TeacherAttendance = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const { sendAbsenceNotification } = useAbsenceNotifications();
  const { sendAbsenceAlert } = useParentAlerts();
  const { logCreate, logUpdate } = useAuditLog();
  const { assignedClassrooms, hasAssignments, isLoading: dataLoading } = useTeacherData();
  const { studentLabel, StudentLabel, studentsLabel } = useStudentLabel();
  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const {
    students,
    attendance,
    isLoading: attendanceLoading,
    upsert: upsertAttendance,
    isUpserting,
  } = useAttendance({ classId: selectedClassroom, date: selectedDate });

  const handleSaveAttendance = async (studentId: string, status: any, studentName: string) => {
    const existingRecord = attendance?.find(a => a.student_id === studentId);
    const wasAbsentBefore = existingRecord?.status === "ABSENT";

    try {
      await upsertAttendance({
        student_id: studentId,
        class_id: selectedClassroom,
        date: selectedDate,
        status,
        recorded_by: user?.id,
      } as any);

      if (status === "ABSENT" && !wasAbsentBefore) {
        await sendAbsenceNotification.mutateAsync({
          studentId,
          studentName,
          date: selectedDate,
        });

        sendAbsenceAlert.mutate({
          studentId,
          studentName,
          date: selectedDate,
        });
        toast.success("Absence enregistrée, parents notifiés");
      } else {
        toast.success("Présence enregistrée");
      }
    } catch (error: any) {
      toast.error("Erreur: " + error.message);
    }
  };

  const markAllPresent = async () => {
    if (!students) return;

    const promises = students.map(async (enrollment) => {
      const student = enrollment.students as any;
      if (!student?.id) return;
      const existingRecord = attendance?.find(a => a.student_id === student.id);
      if (!existingRecord) {
        await handleSaveAttendance(
          student.id,
          "PRESENT",
          `${student?.first_name || ''} ${student?.last_name || ''}`
        );
      }
    });

    const results = await Promise.allSettled(promises);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      toast.warning(`${failed} erreur(s) sur ${students.length} enregistrements`);
    }
    toast.success(`Tous les ${studentsLabel} marqués présents`);
  };

  const attendanceStats = {
    present: attendance?.filter(a => a.status === "PRESENT").length || 0,
    absent: attendance?.filter(a => a.status === "ABSENT").length || 0,
    late: attendance?.filter(a => a.status === "LATE").length || 0,
    excused: attendance?.filter(a => a.status === "EXCUSED").length || 0,
  };

  const isLoading = dataLoading || (selectedClassroom && attendanceLoading);

  return (
    <div className="space-y-6">
      <TeacherAttendanceHeader
        studentsLabel={studentsLabel}
        showMarkAll={!!(selectedClassroom && students && students.length > 0)}
        onMarkAllPresent={markAllPresent}
      />

      {!dataLoading && !hasAssignments && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <p className="text-amber-800 font-medium">
              Information : Vous n'avez pas encore d'assignations de classes. Contactez l'administration pour configurer votre emploi du temps.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/10 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Classe</Label>
              <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                <SelectTrigger className="bg-background/50 hover:bg-background transition-colors">
                  <SelectValue placeholder="Sélectionner une classe" />
                </SelectTrigger>
                <SelectContent>
                  {assignedClassrooms?.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="pl-10 bg-background/50 hover:bg-background transition-colors"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="animate-pulse bg-muted h-24" />
            ))}
          </div>
          <TableSkeleton columns={3} rows={8} />
        </div>
      ) : (
        <>
          {selectedClassroom && students && students.length > 0 && (
            <TeacherAttendanceStats stats={attendanceStats} />
          )}

          {selectedClassroom && students && students.length > 0 ? (
            <TeacherAttendanceTable
              students={students}
              attendance={attendance || []}
              onSaveAttendance={handleSaveAttendance}
              isPending={isUpserting}
              selectedDate={selectedDate}
              studentLabel={StudentLabel}
            />
          ) : selectedClassroom ? (
            <Card className="border-dashed border-2 py-12">
              <CardContent className="text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-medium text-foreground">Aucun {studentLabel} trouvé</h3>
                <p className="text-muted-foreground mt-1">Aucun {studentLabel} n'est actuellement inscrit dans cette classe.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed border-2 py-12">
              <CardContent className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-primary/30" />
                </div>
                <h3 className="text-lg font-medium text-foreground">Sélectionnez une classe</h3>
                <p className="text-muted-foreground mt-1">Choisissez une classe dans la liste ci-dessus pour commencer à gérer les présences.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default TeacherAttendance;
