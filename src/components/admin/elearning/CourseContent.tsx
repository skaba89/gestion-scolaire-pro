import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Edit, Trash2, GripVertical, PlayCircle, FileText, CheckCircle2, Sparkles, BrainCircuit, Wand2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { apiClient } from "@/api/client";
import { adminQueries } from "@/queries/admin";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface CourseContentProps {
    courseId: string;
    modules: any[];
    onAddModule: () => void;
    onEditModule: (module: any) => void;
    onDeleteModule: (id: string) => void;
    onAddLesson: (moduleId: string) => void;
    onEditLesson: (lesson: any) => void;
    onDeleteLesson: (id: string) => void;
    onAIUpdate?: () => void;
}

export function CourseContent({
    modules,
    onAddModule,
    onEditModule,
    onDeleteModule,
    onAddLesson,
    onEditLesson,
    onDeleteLesson,
    onAIUpdate
}: CourseContentProps) {
    const { tenant } = useTenant();
    const queryClient = useQueryClient();
    const [isGenerating, setIsGenerating] = useState<string | null>(null);

    const generateMutation = useMutation({
        mutationFn: async ({ lessonId, type }: { lessonId: string; type: 'SUMMARY' | 'QUIZ' }) => {
            const result = await adminQueries.generateAIContent(lessonId, type);

            if (type === 'SUMMARY') {
                await apiClient.patch(`/course-lessons/${lessonId}/`, { content: result.summary });
            } else {
                await adminQueries.saveAIQuiz(tenant?.id || "", lessonId, result);
            }
            return result;
        },
        onSuccess: (_, variables) => {
            toast.success(variables.type === 'SUMMARY' ? "Résumé généré et enregistré" : "QCM généré avec succès");
            queryClient.invalidateQueries({ queryKey: ["admin-course-modules"] });
            if (onAIUpdate) onAIUpdate();
            setIsGenerating(null);
        },
        onError: (error) => {
            toast.error("Échec de la génération IA: " + error.message);
            setIsGenerating(null);
        }
    });

    const onGenerateSummary = (lesson: any) => {
        if (!lesson.content && lesson.content_type !== 'text') {
            toast.error("La leçon doit avoir du contenu texte pour générer un résumé.");
            return;
        }
        setIsGenerating(lesson.id);
        generateMutation.mutate({ lessonId: lesson.id, type: 'SUMMARY' });
    };

    const onGenerateQuiz = (lesson: any) => {
        setIsGenerating(lesson.id);
        generateMutation.mutate({ lessonId: lesson.id, type: 'QUIZ' });
    };

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
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onEditModule(module); }}>
                                    <Edit className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); onDeleteModule(module.id); }}>
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
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary">
                                                        <Sparkles className="h-3.5 w-3.5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56">
                                                    <DropdownMenuLabel className="flex items-center gap-2">
                                                        <BrainCircuit className="h-4 w-4" />
                                                        Assistant IA
                                                    </DropdownMenuLabel>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => onGenerateSummary(lesson)}
                                                        className="cursor-pointer"
                                                        disabled={isGenerating === lesson.id}
                                                    >
                                                        <FileText className="h-4 w-4 mr-2" />
                                                        Générer un résumé
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => onGenerateQuiz(lesson)}
                                                        className="cursor-pointer"
                                                        disabled={isGenerating === lesson.id}
                                                    >
                                                        <Wand2 className="h-4 w-4 mr-2" />
                                                        Générer un QCM
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditLesson(lesson)}>
                                                <Edit className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDeleteLesson(lesson.id)}>
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
