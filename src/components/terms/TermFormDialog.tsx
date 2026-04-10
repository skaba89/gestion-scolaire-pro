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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { Term } from "@/queries/terms";

interface TermFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingTerm: Term | null;
    academicYears: { id: string; name: string }[];
    onSubmit: (formData: any) => void;
    isPending: boolean;
}

export const TermFormDialog = ({
    open,
    onOpenChange,
    editingTerm,
    academicYears,
    onSubmit,
    isPending,
}: TermFormDialogProps) => {
    const [formData, setFormData] = useState({
        name: "",
        start_date: "",
        end_date: "",
        is_active: false,
        academic_year_id: "",
    });

    useEffect(() => {
        if (editingTerm) {
            setFormData({
                name: editingTerm.name || "",
                start_date: editingTerm.start_date || "",
                end_date: editingTerm.end_date || "",
                is_active: editingTerm.is_active || false,
                academic_year_id: editingTerm.academic_year_id || "",
            });
        } else {
            setFormData({
                name: "",
                start_date: "",
                end_date: "",
                is_active: false,
                academic_year_id: "",
            });
        }
    }, [editingTerm, open]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>{editingTerm ? "Modifier" : "Nouveau"} trimestre</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Année scolaire</Label>
                            <Select
                                value={formData.academic_year_id}
                                onValueChange={(v) => setFormData({ ...formData, academic_year_id: v })}
                                required
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Sélectionner une année" />
                                </SelectTrigger>
                                <SelectContent>
                                    {academicYears.map((year) => (
                                        <SelectItem key={year.id} value={year.id}>
                                            {year.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Nom</Label>
                            <Input
                                placeholder="Trimestre 1"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                                checked={formData.is_active}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                            />
                            <Label>Trimestre en cours</Label>
                        </div>
                        <Button className="w-full" type="submit" disabled={isPending}>
                            {isPending && (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            )}
                            {editingTerm ? "Mettre à jour" : "Créer"}
                        </Button>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
