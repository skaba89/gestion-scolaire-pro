import React, { useState, useEffect } from "react";
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

interface Classroom {
    id: string;
    name: string;
}

interface Subject {
    id: string;
    name: string;
}

interface Term {
    id: string;
    name: string;
}

interface GradeFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    isPending: boolean;
    classrooms: Classroom[];
    subjects: Subject[];
    terms: Term[];
}

export const GradeFormDialog = ({
    open,
    onOpenChange,
    onSubmit,
    isPending,
    classrooms,
    subjects,
    terms,
}: GradeFormDialogProps) => {
    const [formData, setFormData] = useState({
        name: "",
        class_id: "",
        subject_id: "",
        term_id: "",
        type: "exam",
        max_score: "20",
        weight: "1",
    });

    useEffect(() => {
        if (!open) {
            setFormData({
                name: "",
                class_id: "",
                subject_id: "",
                term_id: "",
                type: "exam",
                max_score: "20",
                weight: "1",
            });
        }
    }, [open]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            ...formData,
            max_score: parseFloat(formData.max_score),
            weight: parseFloat(formData.weight),
            date: new Date().toISOString().split('T')[0],
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Créer une Évaluation</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label>Nom de l'évaluation *</Label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Ex: Devoir de Mathématiques"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Classe *</Label>
                            <Select
                                value={formData.class_id}
                                onValueChange={(v) => setFormData(prev => ({ ...prev, class_id: v }))}
                                required
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Sélectionner" />
                                </SelectTrigger>
                                <SelectContent>
                                    {classrooms.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Matière *</Label>
                            <Select
                                value={formData.subject_id}
                                onValueChange={(v) => setFormData(prev => ({ ...prev, subject_id: v }))}
                                required
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Sélectionner" />
                                </SelectTrigger>
                                <SelectContent>
                                    {subjects.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Trimestre / Période *</Label>
                        <Select
                            value={formData.term_id}
                            onValueChange={(v) => setFormData(prev => ({ ...prev, term_id: v }))}
                            required
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionner" />
                            </SelectTrigger>
                            <SelectContent>
                                {terms.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Note Max</Label>
                            <Input
                                type="number"
                                value={formData.max_score}
                                onChange={(e) => setFormData(prev => ({ ...prev, max_score: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Coefficient</Label>
                            <Input
                                type="number"
                                step="0.5"
                                value={formData.weight}
                                onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                                required
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Annuler
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Créer
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
