import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const schema = z.object({
    name: z.string().min(1, "Le nom est requis").max(200),
    class_id: z.string().min(1, "La classe est requise"),
    subject_id: z.string().min(1, "La matière est requise"),
    term_id: z.string().min(1, "Le trimestre est requis"),
    type: z.enum(["exam", "quiz", "homework", "project"]).default("exam"),
    max_score: z.number({ invalid_type_error: "Nombre requis" }).min(1).max(200),
    weight: z.number({ invalid_type_error: "Nombre requis" }).min(0.5).max(10),
});

type FormValues = z.infer<typeof schema>;

interface Classroom { id: string; name: string; }
interface Subject { id: string; name: string; }
interface Term { id: string; name: string; }

interface GradeFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: FormValues & { date: string }) => void;
    isPending: boolean;
    classrooms: Classroom[];
    subjects: Subject[];
    terms: Term[];
}

export const GradeFormDialog = ({
    open,
    onOpenChange,
    onSubmit,
    isPending,
    classrooms,
    subjects,
    terms,
}: GradeFormDialogProps) => {
    const {
        register,
        handleSubmit,
        control,
        reset,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: "", class_id: "", subject_id: "", term_id: "", type: "exam", max_score: 20, weight: 1 },
    });

    useEffect(() => {
        if (!open) reset({ name: "", class_id: "", subject_id: "", term_id: "", type: "exam", max_score: 20, weight: 1 });
    }, [open, reset]);

    const handleFormSubmit = (values: FormValues) => {
        onSubmit({ ...values, date: new Date().toISOString().split("T")[0] });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Créer une Évaluation</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label>Nom de l'évaluation *</Label>
                        <Input placeholder="Ex: Devoir de Mathématiques" {...register("name")} />
                        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Classe *</Label>
                            <Controller
                                control={control}
                                name="class_id"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                                        <SelectContent>
                                            {classrooms.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.class_id && <p className="text-sm text-destructive">{errors.class_id.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Matière *</Label>
                            <Controller
                                control={control}
                                name="subject_id"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                                        <SelectContent>
                                            {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.subject_id && <p className="text-sm text-destructive">{errors.subject_id.message}</p>}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Trimestre / Période *</Label>
                        <Controller
                            control={control}
                            name="term_id"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                                    <SelectContent>
                                        {terms.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                        {errors.term_id && <p className="text-sm text-destructive">{errors.term_id.message}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Note Max</Label>
                            <Input type="number" {...register("max_score", { valueAsNumber: true })} />
                            {errors.max_score && <p className="text-sm text-destructive">{errors.max_score.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Coefficient</Label>
                            <Input type="number" step="0.5" {...register("weight", { valueAsNumber: true })} />
                            {errors.weight && <p className="text-sm text-destructive">{errors.weight.message}</p>}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Annuler
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Créer
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
