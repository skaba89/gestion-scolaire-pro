import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useStudents } from "@/hooks/queries/useStudents";
import type { Student } from "@/queries/students";
import { Search, X } from "lucide-react";
import type { IncidentFormData } from "./incidentTypes";

interface IncidentDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: IncidentFormData) => void;
    isPending: boolean;
    tenantId: string;
}

export function IncidentDialog({ isOpen, onOpenChange, onSubmit, isPending, tenantId }: IncidentDialogProps) {
    const [studentSearch, setStudentSearch] = useState("");
    const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
    const { students, isLoading } = useStudents(isOpen ? tenantId : "", false, {
        search: studentSearch,
        pageSize: 10,
    });
    const [formData, setFormData] = useState<IncidentFormData>({
        incident_type: "discipline",
        severity: "medium",
        title: "",
        description: "",
        location: "",
        occurred_at: "",
        student_ids: [] as string[],
    });

    const resetForm = () => {
        setFormData({
            incident_type: "discipline",
            severity: "medium",
            title: "",
            description: "",
            location: "",
            occurred_at: "",
            student_ids: [],
        });
        setStudentSearch("");
        setSelectedStudents([]);
    };

    const addStudent = (student: Student) => {
        if (formData.student_ids.includes(student.id)) return;
        setSelectedStudents((current) => [...current, student]);
        setFormData((current) => ({
            ...current,
            student_ids: [...current.student_ids, student.id],
        }));
        setStudentSearch("");
    };

    const removeStudent = (studentId: string) => {
        setSelectedStudents((current) => current.filter((student) => student.id !== studentId));
        setFormData((current) => ({
            ...current,
            student_ids: current.student_ids.filter((id) => id !== studentId),
        }));
    };

    const handleOpenChange = (open: boolean) => {
        onOpenChange(open);
        if (!open) resetForm();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Signaler un incident</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="incident-type">Type d'incident</Label>
                            <Select
                                value={formData.incident_type}
                                onValueChange={(value) => setFormData({ ...formData, incident_type: value })}
                            >
                                <SelectTrigger id="incident-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="discipline">Discipline</SelectItem>
                                    <SelectItem value="safety">Sécurité</SelectItem>
                                    <SelectItem value="health">Santé</SelectItem>
                                    <SelectItem value="property">Matériel</SelectItem>
                                    <SelectItem value="bullying">Harcèlement</SelectItem>
                                    <SelectItem value="other">Autre</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="incident-severity">Gravité</Label>
                            <Select
                                value={formData.severity}
                                onValueChange={(value) => setFormData({ ...formData, severity: value })}
                            >
                                <SelectTrigger id="incident-severity">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="minor">Mineur</SelectItem>
                                    <SelectItem value="medium">Moyen</SelectItem>
                                    <SelectItem value="major">Majeur</SelectItem>
                                    <SelectItem value="critical">Critique</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="incident-student-search">Élèves concernés</Label>
                        <div className="flex flex-wrap gap-2">
                            {selectedStudents.map((student) => (
                                <Badge key={student.id} variant="secondary" className="gap-1">
                                    {student.first_name} {student.last_name}
                                    <button
                                        type="button"
                                        aria-label={`Retirer ${student.first_name} ${student.last_name}`}
                                        onClick={() => removeStudent(student.id)}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="incident-student-search"
                                value={studentSearch}
                                onChange={(event) => setStudentSearch(event.target.value)}
                                placeholder="Rechercher par nom ou matricule"
                                className="pl-9"
                            />
                            {studentSearch.trim() && (
                                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                                    {isLoading && <p className="p-3 text-sm text-muted-foreground">Recherche…</p>}
                                    {!isLoading && students
                                        .filter((student) => !formData.student_ids.includes(student.id))
                                        .map((student) => (
                                            <button
                                                key={student.id}
                                                type="button"
                                                className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                                                onClick={() => addStudent(student)}
                                            >
                                                <span className="font-medium">{student.first_name} {student.last_name}</span>
                                                <span className="ml-2 text-muted-foreground">{student.registration_number}</span>
                                            </button>
                                        ))}
                                    {!isLoading && students.length === 0 && (
                                        <p className="p-3 text-sm text-muted-foreground">Aucun élève trouvé</p>
                                    )}
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Obligatoire pour un compte limité à un cycle ; facultatif pour un incident général.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="incident-title">Titre</Label>
                        <Input
                            id="incident-title"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Résumé de l'incident"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="incident-description">Description détaillée</Label>
                        <Textarea
                            id="incident-description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Décrivez ce qui s'est passé..."
                            rows={4}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="incident-location">Lieu</Label>
                            <Input
                                id="incident-location"
                                value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                placeholder="Cour, Salle 101..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="incident-occurred-at">Date et heure</Label>
                            <Input
                                id="incident-occurred-at"
                                type="datetime-local"
                                value={formData.occurred_at}
                                onChange={(e) => setFormData({ ...formData, occurred_at: e.target.value })}
                            />
                        </div>
                    </div>
                    <Button
                        onClick={() => onSubmit(formData)}
                        disabled={!formData.title || !formData.description || !formData.occurred_at || isPending}
                        className="w-full"
                        variant="destructive"
                    >
                        Signaler l'incident
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
