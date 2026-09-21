import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
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
import { Semester } from "@/queries/semesters";

interface SemesterFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingSemester: Semester | null;
    academicYears: { id: string; name: string }[];
    onSubmit: (formData: any) => void;
    isPending: boolean;
}

export const SemesterFormDialog = ({
    open,
    onOpenChange,
    editingSemester,
    academicYears,
    onSubmit,
    isPending,
}: SemesterFormDialogProps) => {
    const [formData, setFormData] = useState({
        name: "",
        number: 1,
        start_date: "",
        end_date: "",
        is_active: false,
        academic_year_id: "",
        credits_required_to_advance: "",
    });

    useEffect(() => {
        if (editingSemester) {
            setFormData({
                name: editingSemester.name || "",
                number: editingSemester.number ?? 1,
                start_date: editingSemester.start_date || "",
                end_date: editingSemester.end_date || "",
                is_active: editingSemester.is_active || false,
                academic_year_id: editingSemester.academic_year_id || "",
                credits_required_to_advance:
                    editingSemester.credits_required_to_advance != null
                        ? String(editingSemester.credits_required_to_advance)
                        : "",
            });
        } else {
            setFormData({
                name: "",
                number: 1,
                start_date: "",
                end_date: "",
                is_active: false,
                // Pré-sélectionne l'année s'il n'y en a qu'une : `required` sur un
                // Select Radix n'est pas une validation native, un envoi sans
                // année partait avec academic_year_id="" et l'API répondait 422
                // (même limitation que TermFormDialog.tsx).
                academic_year_id: academicYears.length === 1 ? academicYears[0].id : "",
                credits_required_to_advance: "",
            });
        }
    }, [editingSemester, open, academicYears]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Garde-fou explicite : le Select Radix n'empêche pas la soumission.
        if (!formData.academic_year_id) return;
        onSubmit({
            ...formData,
            number: Number(formData.number),
            credits_required_to_advance:
                formData.credits_required_to_advance === ""
                    ? null
                    : Number(formData.credits_required_to_advance),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>{editingSemester ? "Modifier" : "Nouveau"} semestre</DialogTitle>
                    <DialogDescription>
                        Le seuil de crédits conditionne l'inscription des étudiants au semestre suivant.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Année universitaire</Label>
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
                            {academicYears.length === 0 && (
                                <p className="text-xs text-destructive">
                                    Créez d'abord une année universitaire.
                                </p>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nom</Label>
                                <Input
                                    placeholder="Semestre 1"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Numéro</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={formData.number}
                                    onChange={(e) => setFormData({ ...formData, number: parseInt(e.target.value) || 1 })}
                                    required
                                />
                            </div>
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
                        <div className="space-y-2">
                            <Label>Crédits ECTS requis pour passer au semestre suivant</Label>
                            <Input
                                type="number"
                                min={0}
                                step="0.5"
                                placeholder="Laisser vide = aucun seuil (progression libre)"
                                value={formData.credits_required_to_advance}
                                onChange={(e) => setFormData({ ...formData, credits_required_to_advance: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">
                                Si renseigné, un étudiant n'ayant pas acquis ce nombre de crédits sur CE semestre
                                sera bloqué (erreur 422) lors de l'inscription aux matières du semestre suivant.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={formData.is_active}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                            />
                            <Label>Semestre en cours</Label>
                        </div>
                        <Button
                            className="w-full"
                            type="submit"
                            disabled={isPending || !formData.academic_year_id}
                        >
                            {isPending && (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            )}
                            {editingSemester ? "Mettre à jour" : "Créer"}
                        </Button>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
