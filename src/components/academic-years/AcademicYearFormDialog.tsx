import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { AcademicYear } from "@/queries/academic-years";

interface AcademicYearFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingYear: AcademicYear | null;
    onSubmit: (formData: any) => void;
    isPending: boolean;
}

export const AcademicYearFormDialog = ({
    open,
    onOpenChange,
    editingYear,
    onSubmit,
    isPending,
}: AcademicYearFormDialogProps) => {
    const [formData, setFormData] = useState({
        name: "",
        start_date: "",
        end_date: "",
        is_current: false,
        code: "",
    });

    useEffect(() => {
        if (editingYear) {
            setFormData({
                name: editingYear.name || "",
                start_date: editingYear.start_date || "",
                end_date: editingYear.end_date || "",
                is_current: editingYear.is_current || false,
                code: editingYear.code || "",
            });
        } else {
            setFormData({
                name: "",
                start_date: "",
                end_date: "",
                is_current: false,
                code: "",
            });
        }
    }, [editingYear, open]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>{editingYear ? "Modifier" : "Nouvelle"} année scolaire</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nom</Label>
                            <Input
                                placeholder="2024-2025"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Code</Label>
                            <Input
                                placeholder="2024-2025"
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Date de début</Label>
                                <Input
                                    type="date"
                                    value={formData.start_date}
                                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Date de fin</Label>
                                <Input
                                    type="date"
                                    value={formData.end_date}
                                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={formData.is_current}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_current: checked })}
                            />
                            <Label>Année en cours</Label>
                        </div>
                        <Button className="w-full" type="submit" disabled={isPending}>
                            {isPending ? "Traitement..." : (editingYear ? "Mettre à jour" : "Créer")}
                        </Button>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
