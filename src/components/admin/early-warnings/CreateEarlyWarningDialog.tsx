import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    createEarlyWarning, searchEarlyWarningStudents,
    type EarlyWarningCreatePayload,
} from "@/utils/earlyWarningsApi";

const alertTypes: Array<{ value: EarlyWarningCreatePayload["alert_type"]; label: string }> = [
    { value: "academic", label: "Résultats scolaires" },
    { value: "attendance", label: "Assiduité" },
    { value: "behavior", label: "Comportement" },
    { value: "engagement", label: "Engagement" },
    { value: "wellbeing", label: "Bien-être" },
];
const severities: Array<{ value: EarlyWarningCreatePayload["severity"]; label: string }> = [
    { value: "low", label: "Faible" },
    { value: "medium", label: "Modérée" },
    { value: "high", label: "Élevée" },
    { value: "critical", label: "Critique" },
];

export function CreateEarlyWarningDialog({
    open, onOpenChange, tenantId, onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tenantId: string;
    onCreated: () => void;
}) {
    const [search, setSearch] = useState("");
    const [studentId, setStudentId] = useState("");
    const [studentLabel, setStudentLabel] = useState("");
    const [alertType, setAlertType] = useState<EarlyWarningCreatePayload["alert_type"]>("academic");
    const [severity, setSeverity] = useState<EarlyWarningCreatePayload["severity"]>("medium");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [actions, setActions] = useState("");

    const students = useQuery({
        queryKey: ["early-warning-student-search", tenantId, search.trim()],
        queryFn: () => searchEarlyWarningStudents(search),
        enabled: open && !!tenantId && search.trim().length >= 2 && !studentId,
        retry: false,
    });

    const create = useMutation({
        mutationFn: createEarlyWarning,
        onSuccess: () => {
            toast.success("Alerte créée et enregistrée");
            onOpenChange(false);
            onCreated();
            reset();
        },
        onError: () => toast.error("Impossible de créer l'alerte. Aucune création confirmée."),
    });

    function reset() {
        setSearch("");
        setStudentId("");
        setStudentLabel("");
        setAlertType("academic");
        setSeverity("medium");
        setTitle("");
        setDescription("");
        setActions("");
    }

    function handleOpenChange(value: boolean) {
        if (create.isPending) return;
        onOpenChange(value);
        if (!value) reset();
    }

    function submit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!studentId || !title.trim() || !description.trim()) {
            toast.error("Sélectionnez un élève, un titre et une description.");
            return;
        }
        const recommended_actions = actions.split("\n").map(s => s.trim()).filter(Boolean);
        if (recommended_actions.length > 10) {
            toast.error("Maximum dix actions recommandées");
            return;
        }
        create.mutate({
            student_id: studentId,
            alert_type: alertType,
            severity,
            title: title.trim(),
            description: description.trim(),
            recommended_actions,
        });
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Créer une alerte scolaire</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="early-warning-search">Élève concerné</Label>
                        {studentId ? (
                            <div className="flex items-center justify-between rounded border p-2">
                                <span>{studentLabel}</span>
                                <Button type="button" variant="outline" size="sm"
                                    onClick={() => { setStudentId(""); setStudentLabel(""); }}>
                                    Changer
                                </Button>
                            </div>
                        ) : (
                            <>
                                <Input id="early-warning-search" value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Nom ou matricule (2 caractères minimum)" />
                                {students.isLoading && <p className="text-sm">Recherche en cours…</p>}
                                {students.isError && (
                                    <p role="alert" className="text-sm text-destructive">
                                        Recherche indisponible. Veuillez réessayer.
                                    </p>
                                )}
                                {students.isSuccess && students.data.length === 0 && (
                                    <p className="text-sm text-muted-foreground">Aucun élève correspondant.</p>
                                )}
                                {students.isSuccess && students.data.length > 0 && (
                                    <div className="max-h-36 overflow-y-auto rounded border" aria-label="Résultats élèves">
                                        {students.data.map(student => (
                                            <button type="button" key={student.id}
                                                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted"
                                                onClick={() => {
                                                    setStudentId(student.id);
                                                    setStudentLabel(`${student.first_name} ${student.last_name} (${student.registration_number || student.id})`);
                                                }}>
                                                {student.first_name} {student.last_name} — {student.registration_number || student.id}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="early-warning-type">Catégorie</Label>
                        <select id="early-warning-type" value={alertType}
                            onChange={e => setAlertType(e.target.value as EarlyWarningCreatePayload["alert_type"])}
                            className="h-10 w-full rounded border bg-background px-3">
                            {alertTypes.map(type => <option value={type.value} key={type.value}>{type.label}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="early-warning-severity">Gravité</Label>
                        <select id="early-warning-severity" value={severity}
                            onChange={e => setSeverity(e.target.value as EarlyWarningCreatePayload["severity"])}
                            className="h-10 w-full rounded border bg-background px-3">
                            {severities.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="early-warning-title">Titre</Label>
                        <Input id="early-warning-title" required maxLength={200} value={title}
                            onChange={e => setTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="early-warning-description">Description</Label>
                        <Textarea id="early-warning-description" required maxLength={4000}
                            value={description} onChange={e => setDescription(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="early-warning-actions">Actions recommandées (une par ligne)</Label>
                        <Textarea id="early-warning-actions" value={actions}
                            onChange={e => setActions(e.target.value)}
                            placeholder="Contacter la famille\nProposer un entretien" />
                    </div>
                    <Button type="submit" className="w-full"
                        disabled={create.isPending || !studentId || !title.trim() || !description.trim()}>
                        {create.isPending ? "Enregistrement…" : "Créer l'alerte"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
