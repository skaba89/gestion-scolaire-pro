export type Employee = {
    id: string;
    employee_number: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    job_title: string | null;
    department: string | null;
    hire_date: string;
    is_active: boolean;
    date_of_birth: string | null;
    place_of_birth: string | null;
    nationality: string | null;
    social_security_number: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
    bank_name: string | null;
    bank_iban: string | null;
    bank_bic: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
};

export type Contract = {
    id: string;
    contract_number: string;
    contract_type: string;
    start_date: string;
    end_date: string | null;
    trial_period_end?: string | null;
    job_title: string;
    gross_monthly_salary: number;
    weekly_hours?: number;
    notes?: string | null;
    is_current: boolean;
    employee_id: string;
    employee: {
        first_name: string;
        last_name: string;
        employee_number?: string;
        address?: string;
    } | null;
};

export type LeaveRequest = {
    id: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    total_days: number;
    status: string;
    reason: string | null;
    employee_id: string;
    employee: { first_name: string; last_name: string } | null;
};

export type Payslip = {
    id: string;
    period_month: number;
    period_year: number;
    gross_salary: number;
    net_salary: number;
    pay_date: string;
    is_final: boolean;
    pdf_url: string | null;
    employee_id: string;
    employee: {
        first_name: string;
        last_name: string;
        employee_number?: string;
        job_title?: string;
        social_security_number?: string;
    } | null;
};

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
    CDI: "CDI",
    CDD: "CDD",
    INTERIM: "Intérim",
    STAGE: "Stage",
    APPRENTISSAGE: "Apprentissage",
    VACATION: "Vacation"
};

export const LEAVE_TYPE_LABELS: Record<string, string> = {
    CONGE_PAYE: "Congé payé",
    RTT: "RTT",
    MALADIE: "Maladie",
    MATERNITE: "Maternité",
    PATERNITE: "Paternité",
    SANS_SOLDE: "Sans solde",
    EXCEPTIONNEL: "Exceptionnel",
    FORMATION: "Formation"
};

export const LEAVE_STATUS_COLORS: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    CANCELLED: "bg-gray-100 text-gray-800"
};
