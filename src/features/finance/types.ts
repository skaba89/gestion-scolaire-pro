export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";

export interface InvoiceItem {
    id: string;
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
}

export interface Invoice {
    id: string;
    tenant_id: string;
    student_id: string;
    invoice_number: string;
    total_amount: number;
    paid_amount: number;
    status: PaymentStatus;
    due_date?: string;
    notes?: string;
    items: InvoiceItem[];
    has_payment_plan?: boolean;
    installments_count?: number;
    created_at: string;
    updated_at: string;
    students?: {
        first_name: string;
        last_name: string;
        registration_number: string;
        phone?: string;
    };
}

export interface Payment {
    id: string;
    tenant_id: string;
    invoice_id: string;
    amount: number;
    payment_date: string;
    payment_method: string;
    reference?: string;
    notes?: string;
    received_by?: string;
    status: "VALID" | "REVERSED";
    type: "CREDIT" | "DEBIT";
    invoices?: {
        invoice_number: string;
        students?: {
            first_name: string;
            last_name: string;
        };
    };
}


export interface Fee {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    amount: number;
    created_at: string;
}

export interface PaymentSchedule {
    id: string;
    tenant_id: string;
    invoice_id: string;
    payment_id?: string;
    installment_number: number;
    amount: number;
    due_date: string;
    paid_date?: string;
    status: "PENDING" | "PAID" | "OVERDUE";
    notes?: string;
    created_at: string;
    updated_at: string;
}
