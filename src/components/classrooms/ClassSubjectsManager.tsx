import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BookOpen, Loader2, Search, FilterX } from "lucide-react";
import { useState, useMemo } from "react";
import { classroomQueries, useAssignSubjectToClass } from "@/queries/classrooms";
import { useSubjects, useSubjectsByLevel } from "@/queries/subjects";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface ClassSubjectsManagerProps {
    classId: string;
    tenantId: string;
    academicYearId?: string;
    levelId?: string;
}

export const ClassSubjectsManager = ({ classId, tenantId, academicYearId, levelId }: ClassSubjectsManagerProps) => {
    const [searchTerm, setSearchTerm] = useState("");
    const { toast } = useToast(); // Needs import
    const { data: subjects = [], isLoading: subjectsLoading } = useSubjects(tenantId);
    const { data: assignedSubjects = [], isLoading: assignmentsLoading } = useQuery(classroomQueries.subjects(classId));
    const { data: levelSubjectIds = [] } = useSubjectsByLevel(levelId);
    const assignMutation = useAssignSubjectToClass();
    const [importing, setImporting] = useState(false);

    const filteredSubjects = useMemo(() => {
        return subjects.filter(s =>
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.code?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
        );
    }, [subjects, searchTerm]);

    const handleToggle = async (subjectId: string, currentAssigned: boolean, currentOptional: boolean = false, coefficient?: number) => {
        await assignMutation.mutateAsync({
            classId,
            subjectId,
            assign: !currentAssigned,
            tenantId,
            academicYearId,
            isOptional: currentOptional,
            coefficient
        });
    };

    const handleOptionalToggle = async (subjectId: string, isOptional: boolean, coefficient?: number) => {
        await assignMutation.mutateAsync({
            classId,
            subjectId,
            assign: true,
            tenantId,
            academicYearId,
            isOptional: isOptional,
            coefficient
        });
    }

    const handleCoefficientChange = async (subjectId: string, isOptional: boolean, coeff: number) => {
        await assignMutation.mutateAsync({
            classId,
            subjectId,
            assign: true,
            tenantId,
            academicYearId,
            isOptional: isOptional,
            coefficient: coeff
        });
    };

    const handleImportFromLevel = async () => {
        if (!levelSubjectIds.length) {
            toast({ title: "Info", description: "Aucune matière associée à ce niveau" });
            return;
        }

        setImporting(true);
        try {
            const assignedIds = assignedSubjects.map(s => s.subject_id);
            const toImport = levelSubjectIds.filter(id => !assignedIds.includes(id));

            if (toImport.length === 0) {
                toast({ title: "Info", description: "Toutes les matières du niveau sont déjà ajoutées" });
                setImporting(false);
                return;
            }

            // Parallel execution might be too much for backend if many, but fine for now
            await Promise.all(toImport.map(subjectId =>
                assignMutation.mutateAsync({
                    classId,
                    subjectId,
                    assign: true,
                    tenantId,
                    academicYearId
                })
            ));

            toast({ title: "Succès", description: `${toImport.length} matières importées depuis le niveau` });
        } catch (e) {
            console.error(e);
            toast({ title: "Erreur", description: "Erreur lors de l'import", variant: "destructive" });
        } finally {
            setImporting(false);
        }
    };

    if (subjectsLoading || assignmentsLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Rechercher une matière..."
                    className="pl-9 h-9 border-muted-foreground/20 focus:border-primary"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                    <button
                        onClick={() => setSearchTerm("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <FilterX className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            <div className="flex justify-between items-center px-1">
                <p className="text-sm text-muted-foreground">Matières disponibles</p>
                {levelId && (
                    <button
                        onClick={handleImportFromLevel}
                        disabled={importing || subjectsLoading}
                        className="text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-colors flex items-center gap-1"
                    >
                        {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookOpen className="w-3 h-3" />}
                        Importer du niveau
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-2 p-1 max-h-[400px] overflow-y-auto pr-2">
                {filteredSubjects.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground col-span-2">
                        Aucune matière trouvée
                    </p>
                ) : (
                    filteredSubjects.map((subject) => {
                        const assignedData = assignedSubjects.find(s => s.subject_id === subject.id);
                        const isAssigned = !!assignedData;

                        return (
                            <div
                                key={subject.id}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isAssigned
                                    ? "bg-primary/5 border-primary/30 shadow-sm"
                                    : "bg-background border-muted/50 hover:bg-muted/30"
                                    }`}
                            >
                                <div className="flex items-center space-x-3 flex-1 cursor-pointer" onClick={() => handleToggle(subject.id, isAssigned)}>
                                    <Checkbox
                                        checked={isAssigned}
                                        onCheckedChange={() => handleToggle(subject.id, isAssigned)}
                                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <Label className="text-sm font-bold leading-none cursor-pointer block truncate">
                                            {subject.name}
                                        </Label>
                                        {subject.code && (
                                            <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                                {subject.code}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {isAssigned && (
                                    <div className="flex items-center gap-4 border-l pl-3 ml-2">
                                        <div className="flex items-center gap-1.5 min-w-[80px]">
                                            <Label className="text-[10px] text-muted-foreground">Coeff.</Label>
                                            <Input
                                                type="number"
                                                step="0.5"
                                                className="h-7 w-12 text-xs px-1"
                                                value={assignedData.coefficient ?? subject.coefficient ?? 1}
                                                onChange={(e) => handleCoefficientChange(subject.id, assignedData.is_optional, parseFloat(e.target.value) || 1)}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id={`opt-${subject.id}`}
                                                checked={assignedData.is_optional}
                                                onCheckedChange={(checked) => handleOptionalToggle(subject.id, checked as boolean, assignedData.coefficient)}
                                            />
                                            <Label htmlFor={`opt-${subject.id}`} className="text-xs text-muted-foreground cursor-pointer">
                                                Optionnel
                                            </Label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <div className="pt-4 border-t flex justify-between items-center text-xs text-muted-foreground font-medium">
                <div className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>{(assignedSubjects || []).length} matière(s) inscrite(s)</span>
                </div>
                {assignMutation.isPending && (
                    <span className="flex items-center gap-1.5 text-primary">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Mise à jour...
                    </span>
                )}
            </div>
        </div>
    );
};
