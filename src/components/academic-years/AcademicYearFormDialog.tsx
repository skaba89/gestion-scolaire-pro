import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

const schema = z
  .object({
    name: z.string().min(1, "Le nom est requis").max(100),
    code: z.string().min(1, "Le code est requis").max(20),
    start_date: z.string().min(1, "La date de début est requise"),
    end_date: z.string().min(1, "La date de fin est requise"),
    is_current: z.boolean(),
  })
  .refine((d) => !d.start_date || !d.end_date || d.end_date >= d.start_date, {
    message: "La date de fin doit être après la date de début",
    path: ["end_date"],
  });

type FormValues = z.infer<typeof schema>;

interface AcademicYearFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingYear: AcademicYear | null;
    onSubmit: (formData: FormValues) => void;
    isPending: boolean;
}

export const AcademicYearFormDialog = ({
    open,
    onOpenChange,
    editingYear,
    onSubmit,
    isPending,
}: AcademicYearFormDialogProps) => {
    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: "", code: "", start_date: "", end_date: "", is_current: false },
    });

    useEffect(() => {
        if (editingYear) {
            reset({
                name: editingYear.name || "",
                start_date: editingYear.start_date || "",
                end_date: editingYear.end_date || "",
                is_current: editingYear.is_current || false,
                code: editingYear.code || "",
            });
        } else {
            reset({ name: "", code: "", start_date: "", end_date: "", is_current: false });
        }
    }, [editingYear, open, reset]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>{editingYear ? "Modifier" : "Nouvelle"} année scolaire</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nom</Label>
                            <Input placeholder="2024-2025" {...register("name")} />
                            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Code</Label>
                            <Input placeholder="2024-2025" {...register("code")} />
                            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Date de début</Label>
                                <Input type="date" {...register("start_date")} />
                                {errors.start_date && <p className="text-sm text-destructive">{errors.start_date.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Date de fin</Label>
                                <Input type="date" {...register("end_date")} />
                                {errors.end_date && <p className="text-sm text-destructive">{errors.end_date.message}</p>}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={watch("is_current")}
                                onCheckedChange={(checked) => setValue("is_current", checked)}
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
