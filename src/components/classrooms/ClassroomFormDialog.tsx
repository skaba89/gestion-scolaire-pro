import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Classroom } from "@/queries/classrooms";

interface ClassroomFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingClassroom: Classroom | null;
    levels: { id: string; name: string }[];
    campuses: { id: string; name: string }[];
    departments: { id: string; name: string }[];
    academicYears: { id: string; name: string }[];
    allRooms: { id: string; name: string; capacity: number | null }[];
    initialDeptIds: string[];
    onSubmit: (formData: any, deptIds: string[], autoImport: boolean) => void;
    isPending: boolean;
}

export const ClassroomFormDialog = ({
    open,
    onOpenChange,
    editingClassroom,
    levels,
    campuses,
    departments,
    academicYears,
    allRooms,
    initialDeptIds,
    onSubmit,
    isPending,
}: ClassroomFormDialogProps) => {
    const [formData, setFormData] = useState({
        name: "",
        capacity: "",
        level_id: "",
        campus_id: "",
        main_room_id: "",
        academic_year_id: "",
        auto_import_subjects: true,
    });
    const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);

    useEffect(() => {
        if (editingClassroom) {
            setFormData({
                name: editingClassroom.name || "",
                capacity: editingClassroom.capacity?.toString() || "",
                level_id: editingClassroom.level_id || "",
                campus_id: editingClassroom.campus_id || "",
                main_room_id: editingClassroom.main_room_id || "",
                academic_year_id: editingClassroom.academic_year_id || "",
                auto_import_subjects: false,
            });
            setSelectedDepartments(initialDeptIds);
        } else {
            const currentYear = academicYears.find(y => (y as any).is_current);
            setFormData({
                name: "",
                capacity: "",
                level_id: "",
                campus_id: "",
                main_room_id: "",
                academic_year_id: currentYear?.id || "",
                auto_import_subjects: true,
            });
            setSelectedDepartments([]);
        }
    }, [editingClassroom, open, academicYears, initialDeptIds]);

    const handleSubmit = () => {
        onSubmit(formData, selectedDepartments, formData.auto_import_subjects);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md border-none shadow-2xl rounded-2xl max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-display font-bold">
                        {editingClassroom ? "Modifier" : "Nouvelle"} classe
                    </DialogTitle>
                    <DialogDescription>
                        Configurez les détails essentiels de la classe.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <div className="space-y-5 py-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nom de la classe</Label>
                            <Input
                                className="rounded-xl h-11 border-muted-foreground/20 focus:border-primary"
                                placeholder="6ème A, Terminale S1..."
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Capacité</Label>
                                <Input
                                    className="rounded-xl h-11 border-muted-foreground/20 focus:border-primary"
                                    type="number"
                                    placeholder="30"
                                    value={formData.capacity}
                                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Niveau</Label>
                                <Select
                                    value={formData.level_id}
                                    onValueChange={(v) => setFormData({ ...formData, level_id: v })}
                                >
                                    <SelectTrigger className="rounded-xl h-11 border-muted-foreground/20">
                                        <SelectValue placeholder="Choisir" />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-none shadow-xl">
                                        {levels.map((level) => (
                                            <SelectItem key={level.id} value={level.id} className="rounded-lg">
                                                {level.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {!editingClassroom && formData.level_id && (
                            <div className="flex items-center space-x-2 bg-muted/30 p-3 rounded-xl border border-muted/50">
                                <Checkbox
                                    id="auto-import"
                                    checked={formData.auto_import_subjects}
                                    onCheckedChange={(checked) => setFormData({ ...formData, auto_import_subjects: checked as boolean })}
                                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <label
                                    htmlFor="auto-import"
                                    className="text-sm font-medium leading-none cursor-pointer"
                                >
                                    Importer automatiquement les matières de ce niveau
                                </label>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Campus (Optionnel)</Label>
                            <Select
                                value={formData.campus_id}
                                onValueChange={(v) => setFormData({ ...formData, campus_id: v })}
                            >
                                <SelectTrigger className="rounded-xl h-11 border-muted-foreground/20">
                                    <SelectValue placeholder="Tous les sites" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-none shadow-xl">
                                    {campuses.map((campus) => (
                                        <SelectItem key={campus.id} value={campus.id} className="rounded-lg">
                                            {campus.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Départements (Optionnel)</Label>
                            <div className="grid grid-cols-2 gap-3 p-4 bg-muted/30 rounded-2xl border border-muted/50 max-h-[160px] overflow-y-auto">
                                {departments.map((dept) => (
                                    <div key={dept.id} className="flex items-center space-x-2 group">
                                        <Checkbox
                                            id={`dept-${dept.id}`}
                                            checked={selectedDepartments.includes(dept.id)}
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    setSelectedDepartments(prev => [...prev, dept.id]);
                                                } else {
                                                    setSelectedDepartments(prev => prev.filter(id => id !== dept.id));
                                                }
                                            }}
                                            className="rounded-lg border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                        />
                                        <Label
                                            htmlFor={`dept-${dept.id}`}
                                            className="text-sm font-medium leading-none cursor-pointer group-hover:text-primary transition-colors truncate"
                                            title={dept.name}
                                        >
                                            {dept.name}
                                        </Label>
                                    </div>
                                ))}
                                {departments.length === 0 && (
                                    <p className="text-xs text-muted-foreground col-span-2 text-center py-2 italic font-medium">
                                        Aucun département configuré
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Salle principale (Optionnel)</Label>
                            <Select
                                value={formData.main_room_id}
                                onValueChange={(v) => setFormData({ ...formData, main_room_id: v })}
                            >
                                <SelectTrigger className="rounded-xl h-11 border-muted-foreground/20">
                                    <SelectValue placeholder="Choisir une salle" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-none shadow-xl">
                                    <SelectItem value="none">Aucune salle définie</SelectItem>
                                    {allRooms.map((room) => (
                                        <SelectItem key={room.id} value={room.id} className="rounded-lg">
                                            {room.name} {room.capacity && `(${room.capacity} places)`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Année scolaire</Label>
                            <Select
                                value={formData.academic_year_id}
                                onValueChange={(v) => setFormData({ ...formData, academic_year_id: v })}
                            >
                                <SelectTrigger className="rounded-xl h-11 border-muted-foreground/20">
                                    <SelectValue placeholder="Choisir l'année scolaire" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-none shadow-xl">
                                    {academicYears.map((year) => (
                                        <SelectItem key={year.id} value={year.id} className="rounded-lg">
                                            {year.name} {(year as any).is_current && "(En cours)"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            className="w-full h-12 rounded-xl text-md font-bold shadow-colored"
                            onClick={handleSubmit}
                            disabled={isPending}
                        >
                            {isPending ? "Progression..." : (editingClassroom ? "Enregistrer les modifications" : "Créer la classe")}
                        </Button>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
