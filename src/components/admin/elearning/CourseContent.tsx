import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Edit, Trash2, PlayCircle, FileText, File } from "lucide-react";
import type { ElearningLesson, ElearningModule } from "@/lib/elearning";

interface CourseContentProps {
    courseId: string;
    modules: ElearningModule[];
    onAddModule: () => void;
    onEditModule: (module: ElearningModule) => void;
    onDeleteModule: (module: ElearningModule) => void;
    onAddLesson: (moduleId: string) => void;
    onEditLesson: (lesson: ElearningLesson, moduleId: string) => void;
    onDeleteLesson: (lesson: ElearningLesson, moduleId: string) => void;
}

const LESSON_ICON = { video: PlayCircle, document: File, text: FileText } as const;

export function CourseContent({
    modules,
    onAddModule,
    onEditModule,
    onDeleteModule,
    onAddLesson,
    onEditLesson,
    onDeleteLesson,
}: CourseContentProps) {
    const { t } = useTranslation();
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold">{t("elearning.programTitle")}</h2>
                <Button size="sm" onClick={onAddModule}>
                    <Plus className="h-4 w-4 me-2" />
                    {t("elearning.addModule")}
                </Button>
            </div>

            <Accordion type="multiple" className="w-full space-y-2">
                {modules.map((module) => (
                    <AccordionItem key={module.id} value={module.id} className="border rounded-lg px-4 bg-card">
                        <div className="flex items-center gap-2">
                            <AccordionTrigger className="hover:no-underline flex-1 py-4">
                                <span className="text-start font-medium">{module.title}</span>
                            </AccordionTrigger>
                            <div className="flex items-center gap-1 pe-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8"
                                    aria-label={t("elearning.editModule")}
                                    onClick={(e) => { e.stopPropagation(); onEditModule(module); }}>
                                    <Edit className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                                    aria-label={t("elearning.deleteModule")}
                                    onClick={(e) => { e.stopPropagation(); onDeleteModule(module); }}>
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                        <AccordionContent className="pt-2 pb-4 space-y-2 border-t mt-2">
                            <div className="space-y-1">
                                {module.lessons.map((lesson) => {
                                    const Icon = LESSON_ICON[lesson.lesson_type] ?? FileText;
                                    return (
                                        <div key={lesson.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                                                <span className="text-sm truncate">{lesson.title}</span>
                                                {!lesson.is_published && (
                                                    <Badge variant="outline" className="shrink-0">{t("elearning.draft")}</Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                                    aria-label={t("elearning.editLesson")}
                                                    onClick={() => onEditLesson(lesson, module.id)}>
                                                    <Edit className="h-3 w-3" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                                    aria-label={t("elearning.deleteLesson")}
                                                    onClick={() => onDeleteLesson(lesson, module.id)}>
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <Button variant="ghost" size="sm" className="w-full mt-2 text-muted-foreground" onClick={() => onAddLesson(module.id)}>
                                <Plus className="h-3 w-3 me-2" />
                                {t("elearning.addLesson")}
                            </Button>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>

            {modules.length === 0 && (
                <Card className="border-dashed">
                    <CardContent className="py-8 text-center text-muted-foreground">
                        {t("elearning.noModules")}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
