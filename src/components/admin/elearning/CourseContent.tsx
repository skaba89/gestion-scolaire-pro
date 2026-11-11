import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Edit, Trash2, GripVertical, PlayCircle, FileText, CheckCircle2 } from "lucide-react";

interface CourseContentProps {
    courseId: string;
    modules: any[];
    onAddModule: () => void;
    onEditModule: (module: any) => void;
    // The page needs the objects (title for the confirmation) and the
    // lesson's module: passing ids only made every delete a no-op and lost
    // the module when editing a lesson.
    onDeleteModule: (module: any) => void;
    onAddLesson: (moduleId: string) => void;
    onEditLesson: (lesson: any, moduleId: string) => void;
    onDeleteLesson: (lesson: any, moduleId: string) => void;
}

export function CourseContent({
    modules,
    onAddModule,
    onEditModule,
    onDeleteModule,
    onAddLesson,
    onEditLesson,
    onDeleteLesson,
}: CourseContentProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Programme du cours</h2>
                <Button size="sm" onClick={onAddModule}>
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter un module
                </Button>
            </div>

            <Accordion type="multiple" className="w-full space-y-2">
                {modules.map((module) => (
                    <AccordionItem key={module.id} value={module.id} className="border rounded-lg px-4 bg-card">
                        <div className="flex items-center gap-2 group">
                            <GripVertical className="h-4 w-4 text-muted-foreground/30" />
                            <AccordionTrigger className="hover:no-underline flex-1 py-4">
                                <span className="text-left font-medium">{module.title}</span>
                            </AccordionTrigger>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Modifier le module" onClick={(e) => { e.stopPropagation(); onEditModule(module); }}>
                                    <Edit className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Supprimer le module" onClick={(e) => { e.stopPropagation(); onDeleteModule(module); }}>
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                        <AccordionContent className="pt-2 pb-4 space-y-2 border-t mt-2">
                            <div className="space-y-1">
                                {module.lessons?.map((lesson: any) => (
                                    <div key={lesson.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group/lesson">
                                        <div className="flex items-center gap-3">
                                            {lesson.content_type === "video" ? (
                                                <PlayCircle className="h-4 w-4 text-blue-500" />
                                            ) : (
                                                <FileText className="h-4 w-4 text-orange-500" />
                                            )}
                                            <span className="text-sm">{lesson.title}</span>
                                            {lesson.is_preview && (
                                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover/lesson:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Modifier la leçon" onClick={() => onEditLesson(lesson, module.id)}>
                                                <Edit className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Supprimer la leçon" onClick={() => onDeleteLesson(lesson, module.id)}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button variant="ghost" size="sm" className="w-full mt-2 text-muted-foreground" onClick={() => onAddLesson(module.id)}>
                                <Plus className="h-3 w-3 mr-2" />
                                Ajouter une leçon
                            </Button>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>

            {modules.length === 0 && (
                <Card className="border-dashed">
                    <CardContent className="py-8 text-center text-muted-foreground">
                        Aucun module créé pour ce cours
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
