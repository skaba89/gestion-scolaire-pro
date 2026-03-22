import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Department } from "@/queries/departments";

interface DepartmentFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingDepartment: Department | null;
    onSubmit: (formData: any) => void;
    isPending: boolean;
}

export const DepartmentFormDialog = ({
    open,
    onOpenChange,
    editingDepartment,
    onSubmit,
    isPending,
}: DepartmentFormDialogProps) => {
    const [formData, setFormData] = useState({
        name: "",
        code: "",
        description: "",
    });

    useEffect(() => {
        if (editingDepartment) {
            setFormData({
                name: editingDepartment.name || "",
                code: editingDepartment.code || "",
                description: editingDepartment.description || "",
            });
        } else {
            setFormData({
                name: "",
                code: "",
                description: "",
            });
        }
    }, [editingDepartment, open]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>
                        {editingDepartment ? "Modifier le département" : "Nouveau département"}
                    </DialogTitle>
                    <DialogDescription>
                        Le code du département sera utilisé pour générer les numéros d'étudiants (ex: INFO-2024-001).
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="code">Code (Abréviation) *</Label>
                            <Input
                                id="code"
                                placeholder="Ex: INFO, DROIT, ECO"
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                required
                                maxLength={10}
                                className="uppercase font-mono"
                            />
                            <p className="text-xs text-muted-foreground">
                                Ce code apparaître dans le numéro d'étudiant des étudiants (ex: <strong>{formData.code || "CODE"}-2024-001</strong>).
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="name">Nom du département *</Label>
                            <Input
                                id="name"
                                placeholder="Ex: Informatique et Sciences Numériques"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="Description optionnelle..."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Annuler
                            </Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? (editingDepartment ? "Modification..." : "Création...") : (editingDepartment ? "Modifier" : "Créer")}
                            </Button>
                        </DialogFooter>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
