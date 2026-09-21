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
import { Faculty } from "@/queries/faculties";

interface FacultyFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingFaculty: Faculty | null;
    onSubmit: (formData: any) => void;
    isPending: boolean;
}

export const FacultyFormDialog = ({
    open,
    onOpenChange,
    editingFaculty,
    onSubmit,
    isPending,
}: FacultyFormDialogProps) => {
    const [formData, setFormData] = useState({
        name: "",
        code: "",
        description: "",
    });

    useEffect(() => {
        if (editingFaculty) {
            setFormData({
                name: editingFaculty.name || "",
                code: editingFaculty.code || "",
                description: editingFaculty.description || "",
            });
        } else {
            setFormData({
                name: "",
                code: "",
                description: "",
            });
        }
    }, [editingFaculty, open]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>
                        {editingFaculty ? "Modifier la faculté" : "Nouvelle faculté"}
                    </DialogTitle>
                    <DialogDescription>
                        Une faculté regroupe plusieurs départements dans une structure universitaire (LMD).
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="code">Code (Abréviation)</Label>
                            <Input
                                id="code"
                                placeholder="Ex: FS, FLSH, FSJP"
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                maxLength={10}
                                className="uppercase font-mono"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="name">Nom de la faculté *</Label>
                            <Input
                                id="name"
                                placeholder="Ex: Faculté des Sciences"
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
                                {isPending ? (editingFaculty ? "Modification..." : "Création...") : (editingFaculty ? "Modifier" : "Créer")}
                            </Button>
                        </DialogFooter>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
