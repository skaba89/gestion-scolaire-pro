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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { apiErrorDetail } from "@/lib/api-error";
import {
  createLesson,
  createModule,
  deleteLesson,
  deleteModule,
  elearningKeys,
  fetchCourseContent,
  updateLesson,
  updateModule,
  type ElearningLesson,
  type ElearningModule,
  type LessonInput,
  type LessonType,
} from "@/lib/elearning";

// 2026-11-12 : modules et leçons sont enregistrés en base (avant : état local
// du navigateur, perdu au rechargement et jamais vu des élèves).
const EMPTY_LESSON: LessonInput = {
  title: "", content: "", resource_url: "", lesson_type: "text", duration_minutes: null, is_published: false,
};

export default function Elearning() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [isCourseDialogOpen, setIsCourseDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);

  // Module dialog state
  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<ElearningModule | null>(null);
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");

  // Lesson dialog state
  const [isLessonDialogOpen, setIsLessonDialogOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<ElearningLesson | null>(null);
  const [targetModuleId, setTargetModuleId] = useState<string>("");
  const [lessonForm, setLessonForm] = useState<LessonInput>(EMPTY_LESSON);

  // Queries
  const { data: courses = [], isLoading: isLoadingCourses } = useQuery(adminQueries.adminCourses(tenant?.id || ""));
  const { data: enrollments = [] } = useQuery(adminQueries.adminCourseEnrollments(tenant?.id || ""));
  const { data: modules = [], isError: contentError } = useQuery({
    queryKey: elearningKeys.content(selectedCourseId || ""),
    queryFn: () => fetchCourseContent(selectedCourseId as string),
    enabled: !!selectedCourseId,
  });
  const refreshContent = () =>
    queryClient.invalidateQueries({ queryKey: elearningKeys.content(selectedCourseId || "") });
  const onSaveError = (error: unknown) => toast.error(apiErrorDetail(error) || t("elearning.saveError"));

  // Mutations
  const courseMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        duration_hours: data.duration_hours === "" || data.duration_hours == null
          ? null
          : Number(data.duration_hours),
      };
      if (editingCourse) {
        await apiClient.put(`/analytics/elearning/courses/${editingCourse.id}/`, payload);
      } else {
        await apiClient.post("/analytics/elearning/courses/", { ...payload, tenant_id: tenant?.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      setIsCourseDialogOpen(false);
      setEditingCourse(null);
      toast.success(editingCourse ? t("elearning.courseUpdated") : t("elearning.courseCreated"));
    },
    onError: onSaveError,
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/analytics/elearning/courses/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      toast.success(t("elearning.courseDeleted"));
    },
    onError: onSaveError,
  });

  const moduleMutation = useMutation({
    mutationFn: async () => {
      const body = { title: moduleTitle.trim(), description: moduleDescription.trim() || null };
      if (editingModule) await updateModule(editingModule.id, body);
      else await createModule(selectedCourseId as string, body);
    },
    onSuccess: () => {
      toast.success(editingModule ? t("elearning.moduleUpdated") : t("elearning.moduleAdded"));
      setIsModuleDialogOpen(false);
      setEditingModule(null);
      refreshContent();
    },
    onError: onSaveError,
  });

  const deleteModuleMutation = useMutation({
    mutationFn: (moduleId: string) => deleteModule(moduleId),
    onSuccess: () => {
      toast.success(t("elearning.moduleDeleted"));
      refreshContent();
    },
    onError: onSaveError,
  });

  const lessonMutation = useMutation({
    mutationFn: async () => {
      const body: LessonInput = {
        ...lessonForm,
        title: lessonForm.title.trim(),
        content: lessonForm.content?.trim() || null,
        resource_url: lessonForm.resource_url?.trim() || null,
        duration_minutes: lessonForm.duration_minutes || null,
      };
      if (editingLesson) await updateLesson(editingLesson.id, body);
      else await createLesson(targetModuleId, body);
    },
    onSuccess: () => {
      toast.success(editingLesson ? t("elearning.lessonUpdated") : t("elearning.lessonAdded"));
      setIsLessonDialogOpen(false);
      setEditingLesson(null);
      refreshContent();
    },
    onError: onSaveError,
  });

  const deleteLessonMutation = useMutation({
    mutationFn: (lessonId: string) => deleteLesson(lessonId),
    onSuccess: () => {
      toast.success(t("elearning.lessonDeleted"));
      refreshContent();
    },
    onError: onSaveError,
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

  const handleEditModule = (module: ElearningModule) => {
    setEditingModule(module);
    setModuleTitle(module.title);
    setModuleDescription(module.description || "");
    setIsModuleDialogOpen(true);
  };

  const handleDeleteModule = (module: ElearningModule) => {
    if (confirm(t("elearning.confirmDeleteModule", { title: module.title }))) {
      deleteModuleMutation.mutate(module.id);
    }
  };

  // --- Lesson handlers ---
  const handleAddLesson = (moduleId: string) => {
    setTargetModuleId(moduleId);
    setEditingLesson(null);
    setLessonForm(EMPTY_LESSON);
    setIsLessonDialogOpen(true);
  };

  const handleEditLesson = (lesson: ElearningLesson, moduleId: string) => {
    setTargetModuleId(moduleId);
    setEditingLesson(lesson);
    setLessonForm({
      title: lesson.title,
      content: lesson.content || "",
      resource_url: lesson.resource_url || "",
      lesson_type: lesson.lesson_type,
      duration_minutes: lesson.duration_minutes,
      is_published: lesson.is_published,
    });
    setIsLessonDialogOpen(true);
  };

  const handleDeleteLesson = (lesson: ElearningLesson) => {
    if (confirm(t("elearning.confirmDeleteLesson", { title: lesson.title }))) {
      deleteLessonMutation.mutate(lesson.id);
    }
  };

  const urlInvalid = !!lessonForm.resource_url?.trim() && !/^https:\/\//i.test(lessonForm.resource_url.trim());

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  const completionRate = courses.length > 0
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
            onView={(id) => setSelectedCourseId(id)}
          />
        </>
      ) : (
        <div className="space-y-6">
          <Button variant="ghost" onClick={() => setSelectedCourseId(null)} className="pl-0">
            <ChevronLeft className="h-4 w-4 mr-2" />
            {t("elearning.backToCatalog")}
          </Button>

          {contentError && (
            <p role="alert" className="text-sm text-destructive">{t("elearning.loadError")}</p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <CourseContent
                courseId={selectedCourseId}
                modules={modules}
                onAddModule={handleAddModule}
                onEditModule={handleEditModule}
                onDeleteModule={handleDeleteModule}
                onAddLesson={handleAddLesson}
                onEditLesson={handleEditLesson}
                onDeleteLesson={handleDeleteLesson}
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
            <Button onClick={() => moduleMutation.mutate()} disabled={!moduleTitle.trim() || moduleMutation.isPending}>
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
              <Label htmlFor="lesson-title">{t("elearning.lessonTitle")}</Label>
              <Input
                id="lesson-title"
                value={lessonForm.title}
                maxLength={200}
                onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                placeholder={t("elearning.lessonTitlePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lesson-content">{t("elearning.lessonContent")}</Label>
              <Textarea
                id="lesson-content"
                rows={6}
                value={lessonForm.content || ""}
                onChange={(e) => setLessonForm({ ...lessonForm, content: e.target.value })}
                placeholder={t("elearning.lessonContentPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lesson-url">{t("elearning.resourceUrl")}</Label>
              <Input
                id="lesson-url"
                type="url"
                inputMode="url"
                value={lessonForm.resource_url || ""}
                onChange={(e) => setLessonForm({ ...lessonForm, resource_url: e.target.value })}
                placeholder="https://"
                aria-invalid={urlInvalid}
              />
              {urlInvalid && <p className="text-xs text-destructive">{t("elearning.resourceUrlHttps")}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lesson-type">{t("elearning.type")}</Label>
                <select
                  id="lesson-type"
                  value={lessonForm.lesson_type}
                  onChange={(e) => setLessonForm({ ...lessonForm, lesson_type: e.target.value as LessonType })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="text">{t("elearning.typeText")}</option>
                  <option value="video">{t("elearning.typeVideo")}</option>
                  <option value="document">{t("elearning.typeDocument")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lesson-duration">{t("elearning.durationMinutes")}</Label>
                <Input
                  id="lesson-duration"
                  type="number"
                  min={1}
                  max={1440}
                  value={lessonForm.duration_minutes ?? ""}
                  onChange={(e) => setLessonForm({
                    ...lessonForm,
                    duration_minutes: e.target.value === "" ? null : parseInt(e.target.value) || null,
                  })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="lesson-published">{t("elearning.published")}</Label>
                <p className="text-xs text-muted-foreground">{t("elearning.publishedHelp")}</p>
              </div>
              <Switch
                id="lesson-published"
                checked={lessonForm.is_published}
                onCheckedChange={(checked) => setLessonForm({ ...lessonForm, is_published: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLessonDialogOpen(false)}>
              {t("elearning.cancel")}
            </Button>
            <Button
              onClick={() => lessonMutation.mutate()}
              disabled={!lessonForm.title.trim() || urlInvalid || lessonMutation.isPending}
            >
              {editingLesson ? t("elearning.update") : t("elearning.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
