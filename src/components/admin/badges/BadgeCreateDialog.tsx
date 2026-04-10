import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Student {
    id: string;
    first_name: string;
    last_name: string;
    registration_number?: string | null;
}

interface BadgeCreateDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    studentsWithoutBadge: Student[];
    studentLabel: string;
    studentsLabel: string;
    StudentLabel: string;
    onCreate: (studentId: string) => void;
}

export function BadgeCreateDialog({
    isOpen,
    onOpenChange,
    studentsWithoutBadge,
    studentLabel,
    studentsLabel,
    StudentLabel,
    onCreate,
}: BadgeCreateDialogProps) {
    const [selectedStudent, setSelectedStudent] = useState<string>("");

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Créer un nouveau badge</DialogTitle>
                    <DialogDescription>
                        Sélectionnez un {studentLabel} pour lui générer un nouveau badge d'accès.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>{StudentLabel}</Label>
                        <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                            <SelectTrigger>
                                <SelectValue placeholder={`Sélectionner un ${studentLabel}`} />
                            </SelectTrigger>
                            <SelectContent>
                                {studentsWithoutBadge.map((student) => (
                                    <SelectItem key={student.id} value={student.id}>
                                        {student.first_name} {student.last_name}
                                        {student.registration_number && ` (${student.registration_number})`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {studentsWithoutBadge.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                Tous les {studentsLabel} ont déjà un badge actif
                            </p>
                        )}
                    </div>
                    <Button
                        onClick={() => {
                            onCreate(selectedStudent);
                            setSelectedStudent("");
                        }}
                        disabled={!selectedStudent}
                        className="w-full"
                    >
                        Créer le badge
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
