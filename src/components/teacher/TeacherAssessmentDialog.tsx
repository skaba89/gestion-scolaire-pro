import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface TeacherAssessmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    isPending: boolean;
    assignedClassrooms: { id: string; name: string }[] | undefined;
    getSubjectsForClassroom: (classroomId: string) => { id: string; name: string }[];
    terms: any[] | undefined;
}

export const TeacherAssessmentDialog = ({
    open,
    onOpenChange,
    onSubmit,
    isPending,
    assignedClassrooms,
    getSubjectsForClassroom,
    terms,
}: TeacherAssessmentDialogProps) => {
    const [formData, setFormData] = useState({
        name: "",
        subject_id: "",
        class_id: "",
        term_id: "",
        type: "exam",
        max_score: "20",
        weight: "1",
    });

    useEffect(() => {
        if (!open) {
            setFormData({
                name: "",
                subject_id: "",
                class_id: "",
                term_id: "",
                type: "exam",
                max_score: "20",
                weight: "1",
            });
        }
    }, [open]);

    const dialogSubjects = formData.class_id ? getSubjectsForClassroom(formData.class_id) : [];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold">Créer une Évaluation</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Nom de l'évaluation *</Label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Ex: Devoir de Mathématiques Trimestre 1"
                            required
                            className="bg-muted/30 focus-visible:ring-primary/30"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Classe *</Label>
                            <Select
                                value={formData.class_id}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, class_id: value, subject_id: "" }))}
                                required
                            >
                                <SelectTrigger className="bg-muted/30 border-muted-foreground/20">
                                    <SelectValue placeholder="Sélectionner" />
                                </SelectTrigger>
                                <SelectContent>
                                    {assignedClassrooms?.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Matière *</Label>
                            <Select
                                value={formData.subject_id}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, subject_id: value }))}
                                disabled={!formData.class_id}
                                required
                            >
                                <SelectTrigger className="bg-muted/30 border-muted-foreground/20">
                                    <SelectValue placeholder={formData.class_id ? "Sélectionner" : "Choisir une classe"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {dialogSubjects?.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Période (Trimestre/Semestre) *</Label>
                        <Select
                            value={formData.term_id}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, term_id: value }))}
                            required
                        >
                            <SelectTrigger className="bg-muted/30 border-muted-foreground/20">
                                <SelectValue placeholder="Sélectionner une période" />
                            </SelectTrigger>
                            <SelectContent>
                                {terms?.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Note maximale</Label>
                            <Input
                                type="number"
                                value={formData.max_score}
                                onChange={(e) => setFormData(prev => ({ ...prev, max_score: e.target.value }))}
                                className="bg-muted/30 focus-visible:ring-primary/30"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Coefficient</Label>
                            <Input
                                type="number"
                                step="0.5"
                                value={formData.weight}
                                onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                                className="bg-muted/30 focus-visible:ring-primary/30"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-6 border-t">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            Annuler
                        </Button>
                        <Button type="submit" disabled={isPending} className="px-8">
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Créer l'évaluation
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
