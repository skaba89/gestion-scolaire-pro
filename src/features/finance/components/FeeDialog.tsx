import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Fee } from "../types";
import { feeSchema, FeeFormValues } from "@/lib/validations/financeSchemas";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface FeeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fee: Fee | null;
    onSave: (data: FeeFormValues & { id?: string }) => Promise<void>;
    isSaving: boolean;
}

export const FeeDialog = ({
    open,
    onOpenChange,
    fee,
    onSave,
    isSaving,
}: FeeDialogProps) => {
    const form = useForm<FeeFormValues>({
        resolver: zodResolver(feeSchema),
        defaultValues: {
            name: "",
            description: "",
            amount: 0,
        },
    });

    useEffect(() => {
        if (open) {
            if (fee) {
                form.reset({
                    name: fee.name,
                    description: fee.description || "",
                    amount: Number(fee.amount),
                });
            } else {
                form.reset({
                    name: "",
                    description: "",
                    amount: 0,
                });
            }
        }
    }, [fee, open, form]);

    const handleSubmit = async (values: FeeFormValues) => {
        await onSave({ ...values, id: fee?.id });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {fee ? "Modifier le type de frais" : "Nouveau type de frais"}
                    </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nom du frais</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Scolarité, Transport..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Détails du frais..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="amount"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Montant par défaut</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            {...field}
                                            onChange={(e) => field.onChange(Number(e.target.value))}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Annuler
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? "Enregistrement..." : "Enregistrer"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};
