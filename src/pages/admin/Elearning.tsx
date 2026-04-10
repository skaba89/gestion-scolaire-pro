import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Plus, ChevronLeft, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { adminQueries } from "@/queries/admin";
import { CourseGrid } from "@/components/admin/elearning/CourseGrid";
import { CourseContent } from "@/components/admin/elearning/CourseContent";
import { CourseStats } from "@/components/admin/elearning/CourseStats";
import { CourseDialog } from "@/components/admin/elearning/CourseDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LocalModule {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: LocalLesson[];
}

interface LocalLesson {
  id: string;
  title: string;
  description: string;
  type: string;
  duration: number;
  order: number;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export default function Elearning() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [isCourseDialogOpen, setIsCourseDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);

  // Local state for modules/lessons (no backend available)
  const [localModules, setLocalModules] = useState<LocalModule[]>([]);

  // Module dialog state
  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<LocalModule | null>(null);
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");

  // Lesson dialog state
  const [isLessonDialogOpen, setIsLessonDialogOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LocalLesson | null>(null);
  const [targetModuleId, setTargetModuleId] = useState<string>("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonDescription, setLessonDescription] = useState("");
  const [lessonType, setLessonType] = useState("video");
  const [lessonDuration, setLessonDuration] = useState(30);

  // Queries
  const { data: courses = [], isLoading: isLoadingCourses } = useQuery(adminQueries.adminCourses(tenant?.id || ""));
  const { data: enrollments = [] } = useQuery(adminQueries.adminCourseEnrollments(tenant?.id || ""));
  const { data: selectedCourseModules = [] } = useQuery({
    ...adminQueries.adminCourseModules(selectedCourseId || ""),
    enabled: !!selectedCourseId,
  });

  // Use local modules if we have them for the selected course, otherwise use fetched data
  const displayModules = localModules.length > 0 ? localModules : (selectedCourseModules as any[]);

  // Mutations
  const courseMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingCourse) {
        await apiClient.put(`/analytics/elearning/courses/${editingCourse.id}/`, data);
      } else {
        await apiClient.post("/analytics/elearning/courses/", { ...data, tenant_id: tenant?.id });
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
      await apiClient.delete(`/analytics/elearning/courses/${id}/`);
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

  // --- Module handlers ---
  const handleAddModule = () => {
    setEditingModule(null);
    setModuleTitle("");
    setModuleDescription("");
    setIsModuleDialogOpen(true);
  };

  const handleEditModule = (module: any) => {
    setEditingModule(module);
    setModuleTitle(module.title);
    setModuleDescription(module.description || "");
    setIsModuleDialogOpen(true);
  };

  const handleSaveModule = () => {
    if (!moduleTitle.trim()) return;

    if (editingModule) {
      setLocalModules((prev) =>
        prev.map((m) =>
          m.id === editingModule.id
            ? { ...m, title: moduleTitle.trim(), description: moduleDescription.trim() }
            : m
        )
      );
      toast.success("Module mis à jour");
    } else {
      const newModule: LocalModule = {
        id: generateId(),
        title: moduleTitle.trim(),
        description: moduleDescription.trim(),
        order: localModules.length + 1,
        lessons: [],
      };
      setLocalModules((prev) => [...prev, newModule]);
      toast.success("Module ajouté");
    }
    setIsModuleDialogOpen(false);
    setModuleTitle("");
    setModuleDescription("");
    setEditingModule(null);
  };

  const handleDeleteModule = (module: any) => {
    if (confirm(`Supprimer le module "${module.title}" ?`)) {
      setLocalModules((prev) => prev.filter((m) => m.id !== module.id));
      toast.success("Module supprimé");
    }
  };

  // --- Lesson handlers ---
  const handleAddLesson = (moduleId: string) => {
    setTargetModuleId(moduleId);
    setEditingLesson(null);
    setLessonTitle("");
    setLessonDescription("");
    setLessonType("video");
    setLessonDuration(30);
    setIsLessonDialogOpen(true);
  };

  const handleEditLesson = (lesson: any, moduleId: string) => {
    setTargetModuleId(moduleId);
    setEditingLesson(lesson);
    setLessonTitle(lesson.title);
    setLessonDescription(lesson.description || "");
    setLessonType(lesson.type || "video");
    setLessonDuration(lesson.duration || 30);
    setIsLessonDialogOpen(true);
  };

  const handleDeleteLesson = (lesson: any, moduleId: string) => {
    if (confirm(`Supprimer la leçon "${lesson.title}" ?`)) {
      setLocalModules((prev) =>
        prev.map((m) =>
          m.id === moduleId
            ? { ...m, lessons: m.lessons.filter((l) => l.id !== lesson.id) }
            : m
        )
      );
      toast.success("Leçon supprimée");
    }
  };

  const handleSaveLesson = () => {
    if (!lessonTitle.trim()) return;

    if (editingLesson) {
      setLocalModules((prev) =>
        prev.map((m) =>
          m.id === targetModuleId
            ? {
                ...m,
                lessons: m.lessons.map((l) =>
                  l.id === editingLesson.id
                    ? {
                        ...l,
                        title: lessonTitle.trim(),
                        description: lessonDescription.trim(),
                        type: lessonType,
                        duration: lessonDuration,
                      }
                    : l
                ),
              }
            : m
        )
      );
      toast.success("Leçon mise à jour");
    } else {
      const newLesson: LocalLesson = {
        id: generateId(),
        title: lessonTitle.trim(),
        description: lessonDescription.trim(),
        type: lessonType,
        duration: lessonDuration,
        order: (localModules.find((m) => m.id === targetModuleId)?.lessons.length || 0) + 1,
      };
      setLocalModules((prev) =>
        prev.map((m) =>
          m.id === targetModuleId
            ? { ...m, lessons: [...m.lessons, newLesson] }
            : m
        )
      );
      toast.success("Leçon ajoutée");
    }
    setIsLessonDialogOpen(false);
    setLessonTitle("");
    setLessonDescription("");
    setEditingLesson(null);
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  // Calculate completion rate from actual data
  const totalLessons = localModules.reduce((sum, m) => sum + m.lessons.length, 0);
  const completionRate = totalLessons > 0
    ? Math.round((localModules.filter((m) => m.lessons.length > 0).length / localModules.length) * 100)
    : courses.length > 0
      ? Math.round((courses.filter((c) => c.status === "published").length / courses.length) * 100)
      : 0;

  const stats = {
    totalCourses: courses.length,
    totalEnrollments: enrollments.length,
    activeStudents: new Set(enrollments.map((e) => e.student_id)).size,
    completionRate,
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
          <Button
            onClick={() => {
              setEditingCourse(null);
              setIsCourseDialogOpen(true);
            }}
          >
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
            onView={(id) => {
              setSelectedCourseId(id);
              setLocalModules([]); // Reset local modules when switching courses
            }}
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
                modules={displayModules}
                onAddModule={handleAddModule}
                onEditModule={(module: any) => handleEditModule(module)}
                onDeleteModule={(module: any) => handleDeleteModule(module)}
                onAddLesson={(moduleId: string) => handleAddLesson(moduleId)}
                onEditLesson={(lesson: any, moduleId: string) => handleEditLesson(lesson, moduleId)}
                onDeleteLesson={(lesson: any, moduleId: string) => handleDeleteLesson(lesson, moduleId)}
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

      {/* Module Dialog */}
      <Dialog open={isModuleDialogOpen} onOpenChange={setIsModuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingModule ? "Modifier le module" : "Ajouter un module"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Titre du module</Label>
              <Input
                value={moduleTitle}
                onChange={(e) => setModuleTitle(e.target.value)}
                placeholder="Ex: Introduction"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={moduleDescription}
                onChange={(e) => setModuleDescription(e.target.value)}
                placeholder="Description du module"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModuleDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveModule} disabled={!moduleTitle.trim()}>
              {editingModule ? "Mettre à jour" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lesson Dialog */}
      <Dialog open={isLessonDialogOpen} onOpenChange={setIsLessonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLesson ? "Modifier la leçon" : "Ajouter une leçon"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Titre de la leçon</Label>
              <Input
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder="Ex: Les bases de la programmation"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={lessonDescription}
                onChange={(e) => setLessonDescription(e.target.value)}
                placeholder="Description de la leçon"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  value={lessonType}
                  onChange={(e) => setLessonType(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="video">Vidéo</option>
                  <option value="text">Texte</option>
                  <option value="quiz">Quiz</option>
                  <option value="document">Document</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Durée (minutes)</Label>
                <Input
                  type="number"
                  value={lessonDuration}
                  onChange={(e) => setLessonDuration(parseInt(e.target.value) || 0)}
                  min={1}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLessonDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveLesson} disabled={!lessonTitle.trim()}>
              {editingLesson ? "Mettre à jour" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
