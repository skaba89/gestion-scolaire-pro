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
import { useCurrency } from "@/hooks/useCurrency";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import { Invoice } from "../types";
import { paymentSchema, PaymentFormValues } from "@/lib/validations/financeSchemas";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface PaymentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: Invoice | null;
    onSave: (params: {
        invoiceId: string;
        amount: number;
        method: string;
        reference?: string;
        notes?: string;
        payment_date: string;
    }) => Promise<void>;
    isSaving: boolean;
    nextReference: string;
}

export const PaymentDialog = ({
    open,
    onOpenChange,
    invoice,
    onSave,
    isSaving,
    nextReference,
}: PaymentDialogProps) => {
    const { formatCurrency } = useCurrency();
    const { StudentLabel } = useStudentLabel();

    const form = useForm<PaymentFormValues>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            invoice_id: "",
            amount: 0,
            payment_method: "cash",
            payment_date: new Date().toISOString().split('T')[0],
            reference: "",
            notes: ""
        }
    });

    useEffect(() => {
        if (invoice && open) {
            const remaining = Number(invoice.total_amount) - Number(invoice.paid_amount || 0);
            form.reset({
                invoice_id: invoice.id,
                amount: remaining,
                payment_method: "cash",
                payment_date: new Date().toISOString().split('T')[0],
                reference: nextReference,
                notes: ""
            });
        }
    }, [invoice, open, nextReference, form]);
    const onSubmit = async (values: PaymentFormValues) => {
        if (!invoice) return;

        if (values.payment_method === "mobile_money") {
            try {
                const response = await apiClient.post('/payments/intent', null, {
                    params: {
                        amount: values.amount,
                        method: "MOBILE_MONEY",
                        invoice_id: invoice.id
                    }
                });

                toast.success(response.data.message || "Redirection vers la passerelle de paiement...");
                setTimeout(() => {
                    window.open(response.data.payment_url, '_blank');
                }, 1500);

                // Simulate backend webhook closing the payment
                await onSave({
                    invoiceId: invoice.id,
                    amount: values.amount,
                    method: values.payment_method,
                    reference: response.data.transaction_reference,
                    notes: "Via Mobile Money / Wave / Orange",
                    payment_date: values.payment_date
                });
                return;
            } catch (error: any) {
                toast.error("Erreur de la passerelle: " + error.message);
                return;
            }
        }

        await onSave({
            invoiceId: invoice.id,
            amount: values.amount,
            method: values.payment_method,
            reference: values.reference,
            notes: values.notes,
            payment_date: values.payment_date
        });
    };

    if (!invoice) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Enregistrer un paiement</DialogTitle>
                </DialogHeader>
                <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                    <div className="flex justify-between">
                        <span>Facture:</span>
                        <span className="font-medium">{invoice.invoice_number}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>{StudentLabel}:</span>
                        <span className="font-medium">
                            {invoice.students?.first_name} {invoice.students?.last_name}
                        </span>
                    </div>
                    <div className="flex justify-between text-primary font-bold pt-1 border-t">
                        <span>Reste à payer:</span>
                        <span>{formatCurrency(Number(invoice.total_amount) - Number(invoice.paid_amount || 0))}</span>
                    </div>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="amount"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Montant du paiement</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            {...field}
                                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="payment_date"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Date de paiement</FormLabel>
                                    <FormControl>
                                        <Input type="date" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="payment_method"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Méthode de paiement</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="cash">Espèces</SelectItem>
                                            <SelectItem value="bank_transfer">Virement</SelectItem>
                                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                                            <SelectItem value="check">Chèque</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="reference"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Référence (N° reçu / transaction)</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
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
                                            placeholder="Informations complémentaires..."
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
                                {isSaving ? "Enregistrement..." : "Enregistrer le paiement"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};
