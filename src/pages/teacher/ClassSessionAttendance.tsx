import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CheckCircle,
  AlertCircle
} from "lucide-react";
import QRScanner from "@/components/badges/QRScanner";
import { useStudentLabel } from "@/hooks/useStudentLabel";

// Modular Components
import { SessionAttendanceHeader } from "@/components/teacher/SessionAttendanceHeader";
import { SessionAttendanceStats } from "@/components/teacher/SessionAttendanceStats";
import { SessionCourseSelection } from "@/components/teacher/SessionCourseSelection";

interface Session {
  id: string;
  class_id: string;
  subject_id: string;
  session_date: string;
  start_time: string;
  end_time: string | null;
  status: string;
  classrooms?: { name: string };
  subjects?: { name: string };
}

interface CheckIn {
  id: string;
  student_id: string;
  checked_at: string;
  students?: {
    id: string;
    first_name: string;
    last_name: string;
    registration_number: string | null;
  };
}

const POLL_INTERVAL = 10000; // 10 seconds

export default function ClassSessionAttendance() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { studentLabel, StudentLabel, studentsLabel } = useStudentLabel();

  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  // Get teacher assignments
  const { data: assignments } = useQuery({
    queryKey: ['teacher-assignments', user?.id, tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get("/school-life/check-ins/assignments/", {
        params: {
          teacher_id: user?.id,
          tenant_id: tenant?.id,
        },
      });
      return data || [];
    },
    enabled: !!user?.id && !!tenant?.id,
  });

  // Get unique classrooms and subjects
  const classrooms = [...new Map(
    assignments?.map(a => [a.class_id, a.classrooms]) || []
  ).entries()].map(([id, data]) => ({ id, ...(data as any) }));

  const subjects = [...new Map(
    assignments
      ?.filter(a => !selectedClassroom || a.class_id === selectedClassroom)
      .map(a => [a.subject_id, a.subjects]) || []
  ).entries()].map(([id, data]) => ({ id, ...(data as any) }));

  // Get active session
  const { data: existingSession } = useQuery({
    queryKey: ['active-session', selectedClassroom, selectedSubject, tenant?.id],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data } = await apiClient.get("/school-life/check-ins/sessions/", {
        params: {
          class_id: selectedClassroom,
          subject_id: selectedSubject,
          session_date: today,
          status: 'active',
        },
      });
      return (data && data.length > 0 ? data[0] : null) as Session | null;
    },
    enabled: !!selectedClassroom && !!selectedSubject && !!tenant?.id,
  });

  useEffect(() => {
    if (existingSession) {
      setActiveSession(existingSession);
    }
  }, [existingSession]);

  // Get students enrolled in classroom
  const { data: enrolledStudents } = useQuery({
    queryKey: ['enrolled-students', selectedClassroom, tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get("/students/", {
        params: {
          class_id: selectedClassroom,
          status: 'active',
        },
      });
      return data || [];
    },
    enabled: !!selectedClassroom && !!tenant?.id,
  });

  // Get session check-ins
  const { data: sessionCheckIns, refetch: refetchCheckIns } = useQuery({
    queryKey: ['session-check-ins', activeSession?.id],
    queryFn: async () => {
      const { data } = await apiClient.get("/school-life/check-ins/", {
        params: {
          session_id: activeSession?.id,
        },
      });
      return (data || []) as CheckIn[];
    },
    enabled: !!activeSession?.id,
    refetchInterval: activeSession ? POLL_INTERVAL : false,
  });

  // Mutations
  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const { data } = await apiClient.post("/school-life/check-ins/sessions/start/", {
        class_id: selectedClassroom,
        subject_id: selectedSubject,
        teacher_id: user?.id,
        session_date: format(now, 'yyyy-MM-dd'),
        start_time: format(now, 'HH:mm:ss'),
        status: 'active',
      });
      return data;
    },
    onSuccess: (data) => {
      setActiveSession(data as Session);
      toast.success("Session démarrée");
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: async () => {
      await apiClient.patch(`/school-life/check-ins/sessions/${activeSession?.id}/end/`, {
        end_time: format(new Date(), 'HH:mm:ss'),
        status: 'completed',
      });
    },
    onSuccess: () => {
      setActiveSession(null);
      queryClient.invalidateQueries({ queryKey: ['active-session'] });
      toast.success("Session terminée");
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (studentId: string) => {
      try {
        await apiClient.post("/school-life/check-ins/", {
          session_id: activeSession?.id,
          student_id: studentId,
          check_method: 'qr_scan',
        });
      } catch (error: any) {
        if (error.response?.status === 409 || error.response?.data?.detail?.includes('duplicate')) {
          throw new Error(`${StudentLabel} déjà enregistré`);
        }
        throw error;
      }
    },
    onSuccess: () => {
      refetchCheckIns();
      toast.success(`${StudentLabel} enregistré`);
    },
  });

  const handleQRScan = async (qrData: string) => {
    setShowScanner(false);
    try {
      const { data: badge } = await apiClient.get("/school-life/check-ins/badges/", {
        params: {
          qr_code_data: qrData,
        },
      });

      if (!badge) return toast.error("Badge non reconnu");
      if (!enrolledStudents?.some(e => e.student_id === badge.student_id)) {
        return toast.error(`Cet ${studentLabel} n'est pas dans cette classe`);
      }
      if (sessionCheckIns?.some(c => c.student_id === badge.student_id)) {
        return toast.info(`${StudentLabel} déjà enregistré`);
      }

      await checkInMutation.mutateAsync(badge.student_id);
    } catch (e) {
      toast.error("Erreur lors du scan");
    }
  };

  const totalStudents = enrolledStudents?.length || 0;
  const presentStudents = sessionCheckIns?.length || 0;
  const absentStudents = totalStudents - presentStudents;
  const attendanceRate = totalStudents > 0 ? Math.round((presentStudents / totalStudents) * 100) : 0;

  return (
    <div className="space-y-6">
      <SessionAttendanceHeader />

      <SessionCourseSelection
        classrooms={classrooms}
        subjects={subjects}
        selectedClassroom={selectedClassroom}
        selectedSubject={selectedSubject}
        onClassroomChange={(v) => { setSelectedClassroom(v); setSelectedSubject(""); setActiveSession(null); }}
        onSubjectChange={setSelectedSubject}
        activeSession={activeSession}
        onStartSession={() => startSessionMutation.mutate()}
        onEndSession={() => endSessionMutation.mutate()}
        onShowScanner={() => setShowScanner(true)}
        isPending={startSessionMutation.isPending || endSessionMutation.isPending}
      />

      {activeSession && (
        <>
          <SessionAttendanceStats
            totalStudents={totalStudents}
            presentStudents={presentStudents}
            absentStudents={absentStudents}
            attendanceRate={attendanceRate}
            studentsLabel={studentsLabel}
          />

          <Card>
            <CardHeader>
              <CardTitle>Liste des {studentsLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {enrolledStudents?.map((enrollment) => {
                  const student = enrollment.students as any;
                  const isPresent = sessionCheckIns?.some(c => c.student_id === student.id);

                  return (
                    <div
                      key={student.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${isPresent
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                        }`}
                    >
                      <div>
                        <p className="font-medium text-sm">{student.first_name} {student.last_name}</p>
                        <p className="text-xs text-muted-foreground">{student.registration_number || '—'}</p>
                      </div>
                      {isPresent ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={showScanner} onOpenChange={setShowScanner}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scanner le badge QR</DialogTitle>
          </DialogHeader>
          <QRScanner onScan={handleQRScan} onClose={() => setShowScanner(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
