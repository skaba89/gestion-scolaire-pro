import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Plus, ChevronLeft, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { adminQueries } from "@/queries/admin";
import { CourseGrid } from "@/components/admin/elearning/CourseGrid";
import { CourseContent } from "@/components/admin/elearning/CourseContent";
import { CourseStats } from "@/components/admin/elearning/CourseStats";
import { CourseDialog } from "@/components/admin/elearning/CourseDialog";

export default function Elearning() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [isCourseDialogOpen, setIsCourseDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);

  // Queries
  const { data: courses = [], isLoading: isLoadingCourses } = useQuery(adminQueries.adminCourses(tenant?.id || ""));
  const { data: enrollments = [] } = useQuery(adminQueries.adminCourseEnrollments(tenant?.id || ""));
  const { data: selectedCourseModules = [] } = useQuery({
    ...adminQueries.adminCourseModules(selectedCourseId || ""),
    enabled: !!selectedCourseId,
  });

  // Mutations
  const courseMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingCourse) {
        const { error } = await supabase
          .from("elearning_courses")
          .update(data)
          .eq("id", editingCourse.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("elearning_courses")
          .insert({ ...data, tenant_id: tenant?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      setIsCourseDialogOpen(false);
      setEditingCourse(null);
      toast.success(editingCourse ? "Cours mis à jour" : "Cours créé");
    },
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("elearning_courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      toast.success("Cours supprimé");
    },
  });

  const handleEditCourse = (course: any) => {
    setEditingCourse(course);
    setIsCourseDialogOpen(true);
  };

  const selectedCourse = courses.find(c => c.id === selectedCourseId);

  const stats = {
    totalCourses: courses.length,
    totalEnrollments: enrollments.length,
    activeStudents: new Set(enrollments.map(e => e.student_id)).size,
    completionRate: 75, // Placeholder
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <GraduationCap className="h-8 w-8 text-primary" />
            Plateforme E-learning
          </h1>
          <p className="text-muted-foreground">
            Gérez votre catalogue de cours et suivez les progrès des étudiants
          </p>
        </div>
        {!selectedCourseId && (
          <Button onClick={() => { setEditingCourse(null); setIsCourseDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Créer un cours
          </Button>
        )}
      </div>

      {!selectedCourseId ? (
        <>
          <CourseStats {...stats} />
          <CourseGrid
            courses={courses}
            onEdit={handleEditCourse}
            onDelete={(id) => {
              if (confirm("Supprimer ce cours ?")) deleteCourseMutation.mutate(id);
            }}
            onView={(id) => setSelectedCourseId(id)}
          />
        </>
      ) : (
        <div className="space-y-6">
          <Button variant="ghost" onClick={() => setSelectedCourseId(null)} className="pl-0">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Retour au catalogue
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <CourseContent
                courseId={selectedCourseId}
                modules={selectedCourseModules}
                onAddModule={() => toast.info("Fonctionnalité ajout module")}
                onEditModule={() => toast.info("Fonctionnalité edit module")}
                onDeleteModule={() => toast.info("Fonctionnalité delete module")}
                onAddLesson={() => toast.info("Fonctionnalité ajout leçon")}
                onEditLesson={() => toast.info("Fonctionnalité edit leçon")}
                onDeleteLesson={() => toast.info("Fonctionnalité delete leçon")}
              />
            </div>

            <div className="space-y-6">
              <div className="bg-card border rounded-lg p-6 sticky top-24">
                <h3 className="font-semibold mb-4">Détails du cours</h3>
                <img
                  src={selectedCourse?.thumbnail_url || ""}
                  className="w-full aspect-video object-cover rounded mb-4"
                />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Statut</span>
                    <span className="font-medium capitalize">{selectedCourse?.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Catégorie</span>
                    <span className="font-medium">{selectedCourse?.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Niveau</span>
                    <span className="font-medium capitalize">{selectedCourse?.level}</span>
                  </div>
                </div>
                <Button className="w-full mt-6" onClick={() => handleEditCourse(selectedCourse)}>
                  Modifier le cours
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CourseDialog
        isOpen={isCourseDialogOpen}
        onOpenChange={setIsCourseDialogOpen}
        course={editingCourse}
        onSubmit={(data) => courseMutation.mutate(data)}
        isPending={courseMutation.isPending}
      />
    </div>
  );
}
