import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { Subject } from "@/queries/subjects";

interface SubjectFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingSubject: Subject | null;
    departments: any[];
    tenantId: string;
    initialDeptIds?: string[];
    onSubmit: (formData: any, deptIds: string[]) => Promise<void>;
    isPending: boolean;
}

export const SubjectFormDialog = ({
    open,
    onOpenChange,
    editingSubject,
    departments,
    tenantId,
    initialDeptIds = [],
    onSubmit,
    isPending
}: SubjectFormDialogProps) => {
    const [formData, setFormData] = useState({
        name: "",
        code: "",
        coefficient: "1",
        ects: "0",
        cm_hours: "0",
        td_hours: "0",
        tp_hours: "0",
        description: "",
    });
    const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);

    useEffect(() => {
        if (editingSubject) {
            setFormData({
                name: editingSubject.name,
                code: editingSubject.code || "",
                coefficient: editingSubject.coefficient?.toString() || "1",
                ects: editingSubject.ects?.toString() || "0",
                cm_hours: editingSubject.cm_hours?.toString() || "0",
                td_hours: editingSubject.td_hours?.toString() || "0",
                tp_hours: editingSubject.tp_hours?.toString() || "0",
                description: editingSubject.description || "",
            });
            setSelectedDeptIds(initialDeptIds);
        } else {
            setFormData({
                name: "",
                code: "",
                coefficient: "1",
                ects: "0",
                cm_hours: "0",
                td_hours: "0",
                tp_hours: "0",
                description: "",
            });
            setSelectedDeptIds([]);
        }
    }, [editingSubject, initialDeptIds, open]);

    const handleSubmit = async () => {
        await onSubmit(formData, selectedDeptIds);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>{editingSubject ? "Modifier" : "Nouvelle"} matière</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nom de la matière</Label>
                            <Input
                                placeholder="Mathématiques, Français..."
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Code (optionnel)</Label>
                            <Input
                                placeholder="MATH, FR..."
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Départements</Label>
                            <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                                {departments.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Aucun département disponible</p>
                                ) : (
                                    departments.map((dept) => (
                                        <div key={dept.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`dept-${dept.id}`}
                                                checked={selectedDeptIds.includes(dept.id)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        setSelectedDeptIds([...selectedDeptIds, dept.id]);
                                                    } else {
                                                        setSelectedDeptIds(selectedDeptIds.filter(id => id !== dept.id));
                                                    }
                                                }}
                                            />
                                            <label htmlFor={`dept-${dept.id}`} className="text-sm cursor-pointer">
                                                {dept.code ? `[${dept.code}] ` : ""}{dept.name}
                                            </label>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>ECTS</Label>
                                <Input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    value={formData.ects}
                                    onChange={(e) => setFormData({ ...formData, ects: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Coefficient (Poids)</Label>
                                <Input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    value={formData.coefficient}
                                    onChange={(e) => setFormData({ ...formData, coefficient: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Heures CM</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={formData.cm_hours}
                                    onChange={(e) => setFormData({ ...formData, cm_hours: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Heures TD</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={formData.td_hours}
                                    onChange={(e) => setFormData({ ...formData, td_hours: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Heures TP</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={formData.tp_hours}
                                    onChange={(e) => setFormData({ ...formData, tp_hours: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Input
                                placeholder="Objectifs, prérequis..."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                        <Button
                            className="w-full"
                            onClick={handleSubmit}
                            disabled={isPending}
                        >
                            {isPending && (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            )}
                            {editingSubject ? "Mettre à jour" : "Créer"}
                        </Button>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
