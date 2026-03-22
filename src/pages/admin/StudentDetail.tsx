import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useAuditLog } from "@/hooks/useAuditLog";
import { adminQueries } from "@/queries/admin";

// Modular components
import { StudentDetailHeader } from "@/components/admin/students/detail/StudentDetailHeader";
import { StudentDetailInfo } from "@/components/admin/students/detail/StudentDetailInfo";
import { StudentDetailStats } from "@/components/admin/students/detail/StudentDetailStats";
import { StudentGradesTab } from "@/components/admin/students/detail/tabs/StudentGradesTab";
import { StudentAttendanceTab } from "@/components/admin/students/detail/tabs/StudentAttendanceTab";
import { StudentEnrollmentsTab } from "@/components/admin/students/detail/tabs/StudentEnrollmentsTab";
import { StudentInvoicesTab } from "@/components/admin/students/detail/tabs/StudentInvoicesTab";
import { StudentReportsTab } from "@/components/admin/students/detail/tabs/StudentReportsTab";
import { StudentFormDialog } from "@/components/students/StudentFormDialog";

export default function StudentDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const { studentLabel, StudentLabel, getLabel } = useStudentLabel();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { logView } = useAuditLog();

  // Queries
  const { data: student, isLoading: isStudentLoading } = useQuery({
    ...adminQueries.studentFullDetail(tenant?.id || "", studentId || ""),
    enabled: !!tenant?.id && !!studentId,
  });

  // Log access when student data is loaded
  useEffect(() => {
    if (student && student.id) {
      logView('students', student.id, 'CONFIDENTIAL');
    }
  }, [student?.id, logView]);

  const { data: enrollments = [], isLoading: isEnrollmentsLoading } = useQuery({
    ...adminQueries.studentEnrollments(tenant?.id || "", studentId || ""),
    enabled: !!tenant?.id && !!studentId,
  });

  const { data: gradesData = [], isLoading: isGradesLoading } = useQuery({
    ...adminQueries.studentGradesDetailed(tenant?.id || "", studentId || ""),
    enabled: !!tenant?.id && !!studentId,
  });

  const { data: attendanceData = [], isLoading: isAttendanceLoading } = useQuery({
    ...adminQueries.studentAttendanceDetailed(tenant?.id || "", studentId || ""),
    enabled: !!tenant?.id && !!studentId,
  });

  const { data: invoices = [], isLoading: isInvoicesLoading } = useQuery({
    ...adminQueries.studentInvoices(tenant?.id || "", studentId || ""),
    enabled: !!tenant?.id && !!studentId,
  });

  const { data: linkedParents = [], isLoading: isParentsLoading, refetch: refetchParents } = useQuery({
    ...adminQueries.studentParentsCombined(studentId || ""),
    enabled: !!studentId,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-student-detail", tenant?.id, studentId] });
    queryClient.invalidateQueries({ queryKey: ["admin-student-enrollments", tenant?.id, studentId] });
    refetchParents();
  };

  const handleRemoveParent = async (linkId: string, type: string) => {
    try {
      const table = type === 'user' ? "parent_students" : "student_parents";
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", linkId);

      if (error) throw error;
      toast.success("Liaison supprimée");
      refetchParents();
    } catch (error) {
      console.error("Error removing parent:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const isLoading = isStudentLoading || isEnrollmentsLoading || isGradesLoading || isAttendanceLoading || isInvoicesLoading || isParentsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{StudentLabel} non trouvé</p>
      </div>
    );
  }

  // Format data for components
  const formattedGrades = gradesData.map((g: any) => ({
    ...g,
    assessment: {
      name: g.assessment?.name || '',
      max_score: g.assessment?.max_score || 20,
      subject: g.assessment?.subject || { name: '' },
      term: g.assessment?.term || { name: '' }
    }
  }));

  const formattedAttendance = attendanceData.map((a: any) => ({
    ...a,
    classroom: a.classroom as { name: string } | null
  }));

  const attendanceStats = (() => {
    const total = attendanceData.length;
    if (total === 0) return { present: 0, absent: 0, rate: 0, total: 0 };
    const present = attendanceData.filter((a: any) => a.status === "PRESENT").length;
    const absent = attendanceData.filter((a: any) => a.status === "ABSENT").length;
    return { present, absent, rate: Math.round((present / total) * 100), total };
  })();

  const gradeAverage = (() => {
    if (formattedGrades.length === 0) return 0;
    const total = formattedGrades.reduce((sum: number, g: any) => {
      if (g.score !== null && g.assessment.max_score > 0) {
        return sum + (g.score / g.assessment.max_score) * 20;
      }
      return sum;
    }, 0);
    return (total / formattedGrades.length).toFixed(1);
  })();

  return (
    <div className="space-y-6">
      <StudentDetailHeader
        title={`Fiche ${StudentLabel} `}
        subtitle="Historique complet et informations détaillées"
        onEditClick={() => setIsEditDialogOpen(true)}
      />

      <StudentDetailInfo
        student={student}
        linkedParents={linkedParents}
        tenantId={tenant?.id || ""}
        studentLabel={StudentLabel}
        onRefresh={handleRefresh}
        onRemoveParent={handleRemoveParent}
      />

      <StudentDetailStats
        gradeAverage={gradeAverage}
        attendanceRate={attendanceStats.rate}
        evaluationCount={formattedGrades.length}
        paidInvoicesCount={invoices.filter((i: any) => i.status === "PAID").length}
        totalInvoicesCount={invoices.length}
      />

      <Tabs defaultValue="grades" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="grades">Notes</TabsTrigger>
          <TabsTrigger value="attendance">Présences</TabsTrigger>
          <TabsTrigger value="enrollments">Inscriptions</TabsTrigger>
          <TabsTrigger value="invoices">Finances</TabsTrigger>
          <TabsTrigger value="reports">Bulletins</TabsTrigger>
        </TabsList>

        <TabsContent value="grades">
          <StudentGradesTab grades={formattedGrades} studentLabel={StudentLabel} />
        </TabsContent>

        <TabsContent value="attendance">
          <StudentAttendanceTab attendance={formattedAttendance} stats={attendanceStats} />
        </TabsContent>

        <TabsContent value="enrollments">
          <StudentEnrollmentsTab
            enrollments={enrollments}
            studentId={studentId || ""}
            studentName={`${student.first_name} ${student.last_name} `}
            tenantId={tenant?.id || ""}
            studentLabel={StudentLabel}
            onRefresh={handleRefresh}
          />
        </TabsContent>

        <TabsContent value="invoices">
          <StudentInvoicesTab invoices={invoices} />
        </TabsContent>

        <TabsContent value="reports">
          <StudentReportsTab ofStudentLabel={getLabel("of_student")} />
        </TabsContent>
      </Tabs>

      <StudentFormDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={handleRefresh}
        editStudent={student as any}
      />
    </div>
  );
}
