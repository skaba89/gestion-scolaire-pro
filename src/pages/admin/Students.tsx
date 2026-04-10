import { useState, useMemo, useCallback, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, BarChart3 } from "lucide-react";
import { ClassAttendanceStats } from "@/components/attendance/ClassAttendanceStats";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useStudents } from "@/features/students/hooks/useStudents";
import type { Student } from "@/features/students/types/students";
import { StudentStats } from "@/components/admin/students/StudentStats";
import { StudentFilters } from "@/components/admin/students/StudentFilters";
import { StudentTable } from "@/components/admin/students/StudentTable";
import { StudentRiskBanner } from "@/components/admin/students/StudentRiskBanner";
import { useTenantNavigate } from "@/hooks/useTenantNavigate";
import { useStudentAI } from "@/hooks/useStudentAI";
import { StudentHeader } from "@/components/admin/students/StudentHeader";
import { StudentDialogManager } from "@/components/admin/students/StudentDialogManager";

const Students = () => {
  const { tenant } = useTenant();
  const { studentsLabel, StudentsLabel, studentLabel, getLabel } = useStudentLabel();
  const [searchTerm, setSearchTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [enrollStudent, setEnrollStudent] = useState<Student | null>(null);
  const [creatingAccountFor, setCreatingAccountFor] = useState<string | null>(null);

  const {
    students,
    totalCount,
    isLoading,
    archive: archiveStudent,
    delete: deleteStudent,
    createAccount
  } = useStudents({
    page: currentPage,
    pageSize,
    search: searchTerm,
    isArchived: showArchived
  });

  // Use simple type casting here if needed until useStudentAI is updated to use new types
  const { isAnalyzing, aiAnalysisResults, handleAIAnalysis, clearResults } = useStudentAI({
    tenantId: tenant?.id,
    students: students as any,
    studentsLabel,
    studentLabel
  });

  // Reset to page 1 when search or archived status changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, showArchived]);

  const finalStudents = useMemo(() => {
    if (searchTerm === "risk:high") {
      return (students || []).filter(student => aiAnalysisResults.includes(student.id));
    }
    return students;
  }, [students, searchTerm, aiAnalysisResults]);

  const stats = useMemo(() => ({
    total: totalCount || 0,
    active: showArchived ? 0 : (totalCount || 0),
  }), [totalCount, showArchived]);

  const navigate = useTenantNavigate();

  const handleEditStudent = useCallback((student: Student) => {
    setEditingStudent(student);
    setIsFormDialogOpen(true);
  }, []);

  const handleViewStudent = useCallback((student: Student) => {
    navigate(`/admin/students/${student.id}`);
  }, [navigate]);

  const handleArchiveStudent = useCallback((id: string, archived: boolean, name: string) => {
    archiveStudent({ id, archived, studentName: name });
  }, [archiveStudent]);

  const handleDeleteStudent = useCallback(async (id: string, data: any) => {
    // Wait for promise to handle UI state properly if needed
    await deleteStudent({ id, studentData: data });
  }, [deleteStudent]);

  const handleCreateAccount = useCallback((student: Student) => {
    setCreatingAccountFor(student.id);
    createAccount(student, {
      onSettled: () => setCreatingAccountFor(null)
    });
  }, [createAccount, tenant]);

  return (
    <div className="space-y-6">
      <StudentRiskBanner
        count={aiAnalysisResults.length}
        studentsLabel={studentsLabel}
        StudentsLabel={StudentsLabel}
        onFilterRisk={() => setSearchTerm("risk:high")}
        onClose={clearResults}
      />

      <StudentHeader
        studentsLabel={studentsLabel}
        StudentsLabel={StudentsLabel}
        studentLabel={studentLabel}
        getLabel={getLabel}
        isAnalyzing={isAnalyzing}
        onAIAnalysis={handleAIAnalysis}
        onAddClick={() => { setEditingStudent(null); setIsFormDialogOpen(true); }}
      />

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">
            <Users className="h-4 w-4 mr-2" />
            Liste des {studentsLabel}
          </TabsTrigger>
          <TabsTrigger value="stats">
            <BarChart3 className="h-4 w-4 mr-2" />
            Statistiques de pointage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <StudentStats stats={stats} isLoading={isLoading} studentsLabel={StudentsLabel} />
          <StudentFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
          />
          <StudentTable
            students={finalStudents as any} // Cast if legacy components expect slightly different types, but usually compatible
            isLoading={isLoading}
            totalCount={totalCount}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            studentsLabel={StudentsLabel}
            studentLabel={studentLabel}
            showArchived={showArchived}
            creatingAccountFor={creatingAccountFor}
            onEdit={handleEditStudent as any}
            onView={handleViewStudent as any}
            onArchive={handleArchiveStudent}
            onDelete={(id) => handleDeleteStudent(id, students?.find(s => s.id === id) || {})}
            onCreateAccount={handleCreateAccount as any}
            onEnrollClick={setEnrollStudent as any}
            tenantId={tenant?.id}
          />
        </TabsContent>
        <TabsContent value="stats">
          <ClassAttendanceStats />
        </TabsContent>
      </Tabs>

      <StudentDialogManager
        isFormDialogOpen={isFormDialogOpen}
        setIsFormDialogOpen={setIsFormDialogOpen}
        editingStudent={editingStudent as any}
        setEditingStudent={setEditingStudent as any}
        enrollStudent={enrollStudent as any}
        setEnrollStudent={setEnrollStudent as any}
        tenantId={tenant?.id}
      />
    </div>
  );
};

export default Students;
