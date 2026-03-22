import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { InvoiceItemsEditor } from "@/components/finances/InvoiceItemsEditor";
import { Invoice, InvoiceItem } from "../types";
import { invoiceSchema, InvoiceFormValues, InvoiceItemValues } from "@/lib/validations/financeSchemas";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface InvoiceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: Invoice | null;
    students: { id: string; first_name: string; last_name: string; registration_number?: string }[];
    onSave: (id: string | undefined, data: InvoiceFormValues & { invoice_number: string; has_payment_plan: boolean; installments_count: number }, items: InvoiceItem[]) => Promise<void>;
    isSaving: boolean;
    nextInvoiceNumber: string;
    fees?: { id: string; name: string; amount: number }[];
}

export const InvoiceDialog = ({
    open,
    onOpenChange,
    invoice,
    students,
    onSave,
    isSaving,
    nextInvoiceNumber,
    fees = [],
}: InvoiceDialogProps) => {
    const { studentLabel, StudentLabel, isUniversity } = useStudentLabel();

    const form = useForm<InvoiceFormValues>({
        resolver: zodResolver(invoiceSchema),
        defaultValues: {
            student_id: "",
            due_date: "",
            status: "PENDING",
            notes: "",
            items: [],
            payment_plan_id: undefined
        }
    });

    const [hasPaymentPlan, setHasPaymentPlan] = useState(false);
    const [installmentsCount, setInstallmentsCount] = useState(1);
    const [invoiceNumber, setInvoiceNumber] = useState("");

    useEffect(() => {
        if (!open) return;

        if (invoice) {
            form.reset({
                student_id: invoice.student_id,
                due_date: invoice.due_date || "",
                status: (invoice.status as "PENDING" | "PAID" | "CANCELLED" | "PARTIAL") || "PENDING",
                notes: invoice.notes || "",
                items: invoice.items || [],
            });
            setInvoiceNumber(invoice.invoice_number);
            setHasPaymentPlan(invoice.has_payment_plan || false);
            setInstallmentsCount(invoice.installments_count || 2);
        } else {
            form.reset({
                student_id: "",
                due_date: "",
                status: "PENDING",
                notes: "",
                items: [],
            });
            setInvoiceNumber(nextInvoiceNumber);
            setHasPaymentPlan(false);
            setInstallmentsCount(1);
        }
    }, [invoice, nextInvoiceNumber, open, form]);

    const onSubmit = async (values: InvoiceFormValues) => {
        const submissionData = {
            ...values,
            invoice_number: invoiceNumber,
            has_payment_plan: hasPaymentPlan,
            installments_count: installmentsCount
        };
        await onSave(invoice?.id, submissionData, values.items as InvoiceItem[]);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {invoice ? "Modifier la facture" : "Nouvelle facture"}
                    </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="student_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{StudentLabel}</FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            value={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={`Sélectionner un ${studentLabel}`} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {students?.map((s) => (
                                                    <SelectItem key={s.id} value={s.id}>
                                                        {s.last_name} {s.first_name} ({s.registration_number})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="space-y-2">
                                <Label>Numéro de facture</Label>
                                <Input
                                    value={invoiceNumber}
                                    onChange={(e) => setInvoiceNumber(e.target.value)}
                                    required
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="due_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Date d'échéance</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-xl bg-muted/30">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Plan de paiement (Échéancier)</Label>
                                    <p className="text-xs text-muted-foreground">Diviser le total en plusieurs mensualités</p>
                                </div>
                                <Switch
                                    checked={hasPaymentPlan}
                                    onCheckedChange={setHasPaymentPlan}
                                />
                            </div>
                            {hasPaymentPlan && (
                                <div className="space-y-2">
                                    <Label>Nombre d'échéances</Label>
                                    <Input
                                        type="number"
                                        min={2}
                                        max={12}
                                        value={installmentsCount}
                                        onChange={(e) => setInstallmentsCount(parseInt(e.target.value))}
                                    />
                                </div>
                            )}
                        </div>

                        <FormField
                            control={form.control}
                            name="items"
                            render={({ field }) => (
                                <FormItem className="space-y-4">
                                    <FormLabel>Articles / Frais</FormLabel>
                                    <FormControl>
                                        <InvoiceItemsEditor
                                            items={field.value as InvoiceItemValues[]}
                                            fees={fees}
                                            onItemsChange={field.onChange}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Notes</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            {...field}
                                            placeholder="Notes internes ou pour le parent..."
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
