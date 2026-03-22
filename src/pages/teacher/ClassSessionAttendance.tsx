import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      const { data } = await supabase
        .from('teacher_assignments')
        .select(`
          class_id,
          subject_id,
          classrooms(id, name),
          subjects(id, name)
        `)
        .eq('teacher_id', user?.id || '')
        .eq('tenant_id', tenant?.id || '');
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
      const { data } = await supabase
        .from('class_sessions')
        .select('*, courses(name), classrooms(name)')
        .eq('tenant_id', tenant?.id || '')
        .eq('class_id', selectedClassroom)
        .eq('subject_id', selectedSubject)
        .eq('session_date', today)
        .eq('status', 'active')
        .maybeSingle();
      return data as Session | null;
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
      const { data } = await supabase
        .from('enrollments')
        .select('student_id, students(*)')
        .eq('tenant_id', tenant?.id || '')
        .eq('class_id', selectedClassroom)
        .eq('status', 'active');
      return data || [];
    },
    enabled: !!selectedClassroom && !!tenant?.id,
  });

  // Get session check-ins
  const { data: sessionCheckIns, refetch: refetchCheckIns } = useQuery({
    queryKey: ['session-check-ins', activeSession?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('session_check_ins')
        .select('*, students(id, first_name, last_name, registration_number)')
        .eq('session_id', activeSession?.id || '')
        .order('checked_at', { ascending: false });
      return (data || []) as CheckIn[];
    },
    enabled: !!activeSession?.id,
  });

  // Real-time subscription for session check-ins
  useEffect(() => {
    if (!activeSession?.id) return;

    const channel = supabase
      .channel(`session-check-ins-${activeSession.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_check_ins',
          filter: `session_id=eq.${activeSession.id}`,
        },
        () => {
          refetchCheckIns();
          toast.success("Nouveau pointage enregistré");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSession?.id, refetchCheckIns]);

  // Mutations
  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const { data, error } = await supabase
        .from('class_session_attendance')
        .insert({
          tenant_id: tenant?.id,
          class_id: selectedClassroom,
          subject_id: selectedSubject,
          teacher_id: user?.id,
          session_date: format(now, 'yyyy-MM-dd'),
          start_time: format(now, 'HH:mm:ss'),
          status: 'active',
        })
        .select('*, classrooms(name), subjects(name)')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setActiveSession(data as Session);
      toast.success("Session démarrée");
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('class_session_attendance')
        .update({
          end_time: format(new Date(), 'HH:mm:ss'),
          status: 'completed',
        })
        .eq('id', activeSession?.id || '');

      if (error) throw error;
    },
    onSuccess: () => {
      setActiveSession(null);
      queryClient.invalidateQueries({ queryKey: ['active-session'] });
      toast.success("Session terminée");
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const { data: badge } = await supabase
        .from('student_badges')
        .select('id')
        .eq('student_id', studentId)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      const { error } = await supabase
        .from('session_check_ins')
        .insert({
          tenant_id: tenant?.id,
          session_id: activeSession?.id,
          student_id: studentId,
          badge_id: badge?.id || null,
          check_method: 'qr_scan',
        });

      if (error) {
        if (error.code === '23505') throw new Error(`${StudentLabel} déjà enregistré`);
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
      const { data: badge } = await supabase
        .from('student_badges')
        .select('student_id')
        .eq('qr_code_data', qrData)
        .eq('tenant_id', tenant?.id || '')
        .eq('status', 'ACTIVE')
        .maybeSingle();

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
