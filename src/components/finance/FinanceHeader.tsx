import { InvoiceReminders } from "@/components/invoices/InvoiceReminders";

export const FinanceHeader = () => {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Finances</h1>
                <p className="text-muted-foreground">Gérez les frais, factures et paiements</p>
            </div>
            <div className="flex gap-2">
                <InvoiceReminders />
            </div>
        </div>
    );
};
