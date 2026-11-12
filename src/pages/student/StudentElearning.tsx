import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, ChevronLeft, ExternalLink, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorDetail } from "@/lib/api-error";
import {
  completeLesson,
  elearningKeys,
  fetchMyCourse,
  fetchMyCourses,
  safeHttpsUrl,
  type ElearningLesson,
} from "@/lib/elearning";

/** Espace élève « Mes cours » (2026-11-12) : cours publiés de son niveau,
 *  leçons publiées en texte brut, lien externe https, progression. */
export default function StudentElearning() {
  const { t } = useTranslation();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);

  const courses = useQuery({ queryKey: elearningKeys.myCourses, queryFn: fetchMyCourses });

  if (courseId) {
    return (
      <CourseView
        courseId={courseId}
        lessonId={lessonId}
        onSelectLesson={setLessonId}
        onBack={() => { setCourseId(null); setLessonId(null); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GraduationCap className="h-7 w-7 text-primary" aria-hidden="true" />
          {t("studentElearning.title")}
        </h1>
        <p className="text-muted-foreground">{t("studentElearning.subtitle")}</p>
      </div>

      {courses.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      )}
      {courses.isError && (
        <p role="alert" className="text-destructive">{t("studentElearning.loadError")}</p>
      )}
      {courses.data && courses.data.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("studentElearning.empty")}
          </CardContent>
        </Card>
      )}
      {courses.data && courses.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.data.map((course) => {
            const pct = course.lesson_count > 0
              ? Math.round((course.completed_count / course.lesson_count) * 100) : 0;
            return (
              <Card key={course.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">{course.title}</CardTitle>
                  {course.subject_name && <CardDescription>{course.subject_name}</CardDescription>}
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  {course.description && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{course.description}</p>
                  )}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t("studentElearning.lessonsDone", { done: course.completed_count, total: course.lesson_count })}</span>
                      <span>{pct}%</span>
                    </div>
                    <Progress value={pct} aria-label={t("studentElearning.progress")} />
                  </div>
                  <Button className="w-full" onClick={() => setCourseId(course.id)} disabled={course.lesson_count === 0}>
                    <BookOpen className="h-4 w-4 me-2" aria-hidden="true" />
                    {course.completed_count > 0 ? t("studentElearning.continue") : t("studentElearning.open")}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CourseView({
  courseId, lessonId, onSelectLesson, onBack,
}: {
  courseId: string;
  lessonId: string | null;
  onSelectLesson: (id: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: elearningKeys.myCourse(courseId), queryFn: () => fetchMyCourse(courseId) });

  const complete = useMutation({
    mutationFn: (id: string) => completeLesson(id),
    onSuccess: () => {
      toast.success(t("studentElearning.lessonCompleted"));
      queryClient.invalidateQueries({ queryKey: elearningKeys.myCourse(courseId) });
      queryClient.invalidateQueries({ queryKey: elearningKeys.myCourses });
    },
    onError: (error) => toast.error(apiErrorDetail(error) || t("studentElearning.saveError")),
  });

  const lessons: ElearningLesson[] = detail.data?.modules.flatMap((m) => m.lessons) ?? [];
  const current = lessons.find((l) => l.id === lessonId) ?? lessons[0];
  const done = lessons.filter((l) => l.completed).length;
  const link = safeHttpsUrl(current?.resource_url);

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="ps-0">
        <ChevronLeft className="h-4 w-4 me-2 rtl:rotate-180" aria-hidden="true" />
        {t("studentElearning.back")}
      </Button>

      {detail.isLoading && <Skeleton className="h-64" aria-busy="true" />}
      {detail.isError && <p role="alert" className="text-destructive">{t("studentElearning.loadError")}</p>}

      {detail.data && (
        <>
          <div>
            <h1 className="text-2xl font-bold">{detail.data.course.title}</h1>
            <p className="text-sm text-muted-foreground">
              {t("studentElearning.lessonsDone", { done, total: lessons.length })}
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <nav aria-label={t("studentElearning.programme")} className="space-y-4 lg:col-span-1">
              {detail.data.modules.map((module) => (
                <div key={module.id}>
                  <h2 className="mb-1 text-sm font-semibold">{module.title}</h2>
                  <ul className="space-y-1">
                    {module.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          onClick={() => onSelectLesson(lesson.id)}
                          aria-current={current?.id === lesson.id ? "true" : undefined}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-muted ${
                            current?.id === lesson.id ? "bg-muted font-medium" : ""}`}
                        >
                          <CheckCircle2
                            className={`h-4 w-4 shrink-0 ${lesson.completed ? "text-green-600" : "text-muted-foreground/40"}`}
                            aria-label={lesson.completed ? t("studentElearning.completed") : undefined}
                          />
                          <span className="truncate">{lesson.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>

            {current && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>{current.title}</CardTitle>
                  {current.duration_minutes && (
                    <CardDescription>{t("studentElearning.duration", { minutes: current.duration_minutes })}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {current.content && (
                    // Texte brut : jamais interprété comme HTML.
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{current.content}</p>
                  )}
                  {link && (
                    <Button asChild variant="outline">
                      <a href={link} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 me-2" aria-hidden="true" />
                        {t("studentElearning.openResource")}
                      </a>
                    </Button>
                  )}
                  <div>
                    {current.completed ? (
                      <p className="flex items-center gap-2 text-sm text-green-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {t("studentElearning.completed")}
                      </p>
                    ) : (
                      <Button onClick={() => complete.mutate(current.id)} disabled={complete.isPending}>
                        {t("studentElearning.markDone")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
