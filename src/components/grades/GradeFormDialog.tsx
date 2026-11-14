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
import { useTranslation } from "react-i18next";

const schema = z.object({
    name: z.string().min(1, "teachingAdmin.form.nameRequired").max(200),
    class_id: z.string().min(1, "teachingAdmin.form.classRequired"),
    subject_id: z.string().min(1, "teachingAdmin.form.subjectRequired"),
    term_id: z.string().min(1, "teachingAdmin.form.termRequired"),
    type: z.enum(["exam", "quiz", "homework", "project"]).default("exam"),
    max_score: z.number({ error: (iss) => (iss.code === "invalid_type" ? "teachingAdmin.form.numberRequired" : undefined) }).min(1).max(200),
    weight: z.number({ error: (iss) => (iss.code === "invalid_type" ? "teachingAdmin.form.numberRequired" : undefined) }).min(0.5).max(10),
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
    const { t } = useTranslation();
    const {
        register,
        handleSubmit,
        control,
        reset,
        formState: { errors },
    } = useForm<z.input<typeof schema>, unknown, FormValues>({
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
                    <DialogTitle>{t("teachingAdmin.creerUneEvaluation")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label>{t("teachingAdmin.nomDeLEvaluation")}</Label>
                        <Input placeholder={t("teachingAdmin.exDevoirDeMathematiques")} {...register("name")} />
                        {errors.name && <p className="text-sm text-destructive">{errors.name.message ? t(errors.name.message) : null}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>{t("teachingAdmin.classe2")}</Label>
                            <Controller
                                control={control}
                                name="class_id"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger><SelectValue placeholder={t("teachingAdmin.selectionner")} /></SelectTrigger>
                                        <SelectContent>
                                            {classrooms.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.class_id && <p className="text-sm text-destructive">{errors.class_id.message ? t(errors.class_id.message) : null}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>{t("teachingAdmin.matiere2")}</Label>
                            <Controller
                                control={control}
                                name="subject_id"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger><SelectValue placeholder={t("teachingAdmin.selectionner")} /></SelectTrigger>
                                        <SelectContent>
                                            {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.subject_id && <p className="text-sm text-destructive">{errors.subject_id.message ? t(errors.subject_id.message) : null}</p>}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>{t("teachingAdmin.trimestrePeriode2")}</Label>
                        <Controller
                            control={control}
                            name="term_id"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger><SelectValue placeholder={t("teachingAdmin.selectionner")} /></SelectTrigger>
                                    <SelectContent>
                                        {terms.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                        {errors.term_id && <p className="text-sm text-destructive">{errors.term_id.message ? t(errors.term_id.message) : null}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>{t("teachingAdmin.noteMax")}</Label>
                            <Input type="number" {...register("max_score", { valueAsNumber: true })} />
                            {errors.max_score && <p className="text-sm text-destructive">{errors.max_score.message ? t(errors.max_score.message) : null}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>{t("teachingAdmin.coefficient")}</Label>
                            <Input type="number" step="0.5" {...register("weight", { valueAsNumber: true })} />
                            {errors.weight && <p className="text-sm text-destructive">{errors.weight.message ? t(errors.weight.message) : null}</p>}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t("teachingAdmin.annuler")}
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {t("teachingAdmin.creer")}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
