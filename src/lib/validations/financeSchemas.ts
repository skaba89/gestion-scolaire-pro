import { z } from "zod";

export const invoiceItemSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Le nom est requis"),
    quantity: z.number().min(1, "La quantité doit être au moins 1"),
    unit_price: z.number().min(0, "Le prix unitaire doit être positif"),
    total: z.number().min(0),
});

export const invoiceSchema = z.object({
    student_id: z.string().uuid("L'étudiant est requis"),
    invoice_number: z.string().min(1, "Le numéro de facture est requis"),
    due_date: z.string().min(1, "La date d'échéance est requise"),
    status: z.enum(["PENDING", "PAID", "CANCELLED", "PARTIAL"]).default("PENDING"),
    items: z.array(invoiceItemSchema).min(1, "Au moins un article est requis"),
    notes: z.string().optional(),
    has_payment_plan: z.boolean().default(false),
    installments_count: z.number().min(1).default(1),
    payment_plan_id: z.string().uuid().optional().nullable(),
});

export const paymentSchema = z.object({
    invoice_id: z.string().uuid("La facture est requise"),
    amount: z.number().positive("Le montant doit être supérieur à 0"),
    payment_date: z.string().min(1, "La date de paiement est requise"),
    payment_method: z.string().min(1, "Le mode de paiement est requis"),
    reference: z.string().optional(),
    notes: z.string().optional(),
});

export const feeSchema = z.object({
    name: z.string().min(1, "Le nom est requis"),
    description: z.string().optional(),
    amount: z.number().min(0, "Le montant doit être positif"),
});

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;
export type PaymentFormValues = z.infer<typeof paymentSchema>;
export type InvoiceItemValues = z.infer<typeof invoiceItemSchema>;
export type FeeFormValues = z.infer<typeof feeSchema>;
