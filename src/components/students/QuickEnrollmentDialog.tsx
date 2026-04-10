import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStudentLabel } from "@/hooks/useStudentLabel";

interface QuickEnrollmentDialogProps {
    studentId: string;
    studentName: string;
    tenantId: string;
    onSuccess?: () => void;
    trigger?: React.ReactNode;
}

export function QuickEnrollmentDialog({
    studentId,
    studentName,
    tenantId,
    onSuccess,
    trigger,
}: QuickEnrollmentDialogProps) {
    const { studentLabel } = useStudentLabel();
    const [open, setOpen] = useState(false);
    const [academicYearId, setAcademicYearId] = useState<string>("");
    const [classroomId, setClassroomId] = useState<string>("");
    const [levelId, setLevelId] = useState<string>("");
    const queryClient = useQueryClient();

    // Fetch academic years
    const { data: academicYears } = useQuery({
        queryKey: ["academic-years", tenantId],
        queryFn: async () => {
            const { data } = await apiClient.get('/academic-years/', {
                params: { tenant_id: tenantId },
            });
            return data.data || data || [];
        },
        enabled: !!tenantId && open,
    });

    // Set default academic year
    useState(() => {
        if (academicYears) {
            const current = academicYears.find(y => y.is_current);
            if (current) setAcademicYearId(current.id);
        }
    });

    // Fetch levels
    const { data: levels } = useQuery({
        queryKey: ["levels", tenantId],
        queryFn: async () => {
            const { data } = await apiClient.get('/levels/', {
                params: { tenant_id: tenantId },
            });
            return data.data || data || [];
        },
        enabled: !!tenantId && open,
    });

    // Fetch classrooms based on level
    const { data: classrooms } = useQuery({
        queryKey: ["classrooms", tenantId, levelId],
        queryFn: async () => {
            const params: Record<string, string> = { tenant_id: tenantId };
            if (levelId) params.level_id = levelId;
            const { data } = await apiClient.get('/classrooms/', { params });
            return data.data || data || [];
        },
        enabled: !!tenantId && open,
    });

    const enrollMutation = useMutation({
        mutationFn: async () => {
            if (!academicYearId || !classroomId) {
                throw new Error("Veuillez sélectionner une année et une classe");
            }

            // Check if student is already enrolled in this class for this year
            const { data: existingEnrollment } = await apiClient.get('/enrollments/', {
                params: { student_id: studentId, academic_year_id: academicYearId, class_id: classroomId },
            });

            if ((existingEnrollment.data || existingEnrollment)?.length > 0) {
                return; // Already enrolled
            }

            await apiClient.post('/enrollments/', {
                student_id: studentId,
                academic_year_id: academicYearId,
                class_id: classroomId,
                level_id: (levelId && levelId !== "none") ? levelId : null,
                tenant_id: tenantId,
                status: "ACTIVE",
            });
        },
        onSuccess: () => {
            toast.success(`${studentName} a été inscrit avec succès`);
            queryClient.invalidateQueries({ queryKey: ["students"] });
            queryClient.invalidateQueries({ queryKey: ["enrollments"] });
            queryClient.invalidateQueries({ queryKey: ["classrooms"] });
            setOpen(false);
            if (onSuccess) onSuccess();
        },
        onError: (error: any) => {
            toast.error(error.message || "Erreur lors de l'inscription");
        },
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm">
                        <UserPlus className="w-4 h-4 mr-2" />
                        Inscrire
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Inscrire {studentLabel}</DialogTitle>
                    <DialogDescription>
                        Choisissez une classe pour inscrire {studentName}.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="year">Année Académique</Label>
                        <Select value={academicYearId} onValueChange={setAcademicYearId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionner l'année" />
                            </SelectTrigger>
                            <SelectContent>
                                {academicYears?.map((year) => (
                                    <SelectItem key={year.id} value={year.id}>
                                        {year.name} {year.is_current ? "(Actuelle)" : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="level">Niveau (Optionnel)</Label>
                        <Select value={levelId} onValueChange={setLevelId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Tous les niveaux" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Tous les niveaux</SelectItem>
                                {levels?.map((level) => (
                                    <SelectItem key={level.id} value={level.id}>
                                        {level.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="classroom">Classe</Label>
                        <Select value={classroomId} onValueChange={setClassroomId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionner la classe" />
                            </SelectTrigger>
                            <SelectContent>
                                {classrooms?.map((room) => (
                                    <SelectItem key={room.id} value={room.id}>
                                        {room.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Annuler
                    </Button>
                    <Button
                        onClick={() => enrollMutation.mutate()}
                        disabled={enrollMutation.isPending || !academicYearId || !classroomId}
                    >
                        {enrollMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Confirmer l'inscription
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
