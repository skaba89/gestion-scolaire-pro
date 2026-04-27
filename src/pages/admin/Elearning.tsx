import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      toast.success(editingCourse ? t("elearning.courseUpdated") : t("elearning.courseCreated"));
    },
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/analytics/elearning/courses/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      toast.success(t("elearning.courseDeleted"));
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
      toast.success(t("elearning.moduleUpdated"));
    } else {
      const newModule: LocalModule = {
        id: generateId(),
        title: moduleTitle.trim(),
        description: moduleDescription.trim(),
        order: localModules.length + 1,
        lessons: [],
      };
      setLocalModules((prev) => [...prev, newModule]);
      toast.success(t("elearning.moduleAdded"));
    }
    setIsModuleDialogOpen(false);
    setModuleTitle("");
    setModuleDescription("");
    setEditingModule(null);
  };

  const handleDeleteModule = (module: any) => {
    if (confirm(t("elearning.confirmDeleteModule", { title: module.title }))) {
      setLocalModules((prev) => prev.filter((m) => m.id !== module.id));
      toast.success(t("elearning.moduleDeleted"));
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
    if (confirm(t("elearning.confirmDeleteLesson", { title: lesson.title }))) {
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
      toast.success(t("elearning.lessonUpdated"));
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
      toast.success(t("elearning.lessonAdded"));
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
            {t("elearning.pageTitle")}
          </h1>
          <p className="text-muted-foreground">
            {t("elearning.pageSubtitle")}
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
            {t("elearning.createCourse")}
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
              if (confirm(t("elearning.confirmDeleteCourse"))) deleteCourseMutation.mutate(id);
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
            {t("elearning.backToCatalog")}
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
                <h3 className="font-semibold mb-4">{t("elearning.courseDetails")}</h3>
                <img
                  src={selectedCourse?.thumbnail_url || ""}
                  className="w-full aspect-video object-cover rounded mb-4"
                />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("elearning.status")}</span>
                    <span className="font-medium capitalize">{selectedCourse?.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("elearning.category")}</span>
                    <span className="font-medium">{selectedCourse?.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("elearning.level")}</span>
                    <span className="font-medium capitalize">{selectedCourse?.level}</span>
                  </div>
                </div>
                <Button className="w-full mt-6" onClick={() => handleEditCourse(selectedCourse)}>
                  {t("elearning.editCourse")}
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
            <DialogTitle>{editingModule ? t("elearning.editModule") : t("elearning.addModule")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("elearning.moduleTitle")}</Label>
              <Input
                value={moduleTitle}
                onChange={(e) => setModuleTitle(e.target.value)}
                placeholder={t("elearning.moduleTitlePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("elearning.description")}</Label>
              <Input
                value={moduleDescription}
                onChange={(e) => setModuleDescription(e.target.value)}
                placeholder={t("elearning.moduleDescPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModuleDialogOpen(false)}>
              {t("elearning.cancel")}
            </Button>
            <Button onClick={handleSaveModule} disabled={!moduleTitle.trim()}>
              {editingModule ? t("elearning.update") : t("elearning.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lesson Dialog */}
      <Dialog open={isLessonDialogOpen} onOpenChange={setIsLessonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLesson ? t("elearning.editLesson") : t("elearning.addLesson")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("elearning.lessonTitle")}</Label>
              <Input
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder={t("elearning.lessonTitlePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("elearning.description")}</Label>
              <Input
                value={lessonDescription}
                onChange={(e) => setLessonDescription(e.target.value)}
                placeholder={t("elearning.lessonDescPlaceholder")}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("elearning.type")}</Label>
                <select
                  value={lessonType}
                  onChange={(e) => setLessonType(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="video">{t("elearning.typeVideo")}</option>
                  <option value="text">{t("elearning.typeText")}</option>
                  <option value="quiz">{t("elearning.typeQuiz")}</option>
                  <option value="document">{t("elearning.typeDocument")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("elearning.durationMinutes")}</Label>
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
              {t("elearning.cancel")}
            </Button>
            <Button onClick={handleSaveLesson} disabled={!lessonTitle.trim()}>
              {editingLesson ? t("elearning.update") : t("elearning.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
