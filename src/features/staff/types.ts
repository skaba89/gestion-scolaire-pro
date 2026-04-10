export type StaffRole = 'TEACHER' | 'ADMIN' | 'SUPPORT' | 'SECRETARY' | 'PRINCIPAL' | 'ACCOUNTANT';

export interface StaffProfile {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    photo_url?: string | null;
    is_active: boolean;
    roles: StaffRole[];
    created_at: string;
    updated_at: string;
}

export interface StaffFilters {
    searchTerm?: string;
    role?: StaffRole;
    isActive?: boolean;
}

export interface StaffFormData {
    email: string;
    first_name: string;
    last_name: string;
    phone?: string;
    role: StaffRole;
}
