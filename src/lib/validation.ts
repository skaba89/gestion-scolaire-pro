import { z } from 'zod';

/**
 * Validation Schemas for SchoolFlow Pro
 * 
 * These schemas ensure data integrity and provide clear error messages
 * for both backend (RPC) and frontend (forms) validation.
 */

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

export const emailSchema = z
    .string()
    .email('Adresse email invalide')
    .min(1, 'Email requis');

export const phoneSchema = z
    .string()
    .regex(/^(\+33|0)[1-9](\d{2}){4}$/, 'Numéro de téléphone français invalide (ex: 0612345678 ou +33612345678)')
    .optional()
    .or(z.literal(''));

export const ibanSchema = z
    .string()
    .regex(/^FR\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{3}$/, 'IBAN français invalide (ex: FR76 1234 5678 9012 3456 7890 123)')
    .optional();

export const postalCodeSchema = z
    .string()
    .regex(/^\d{5}$/, 'Code postal invalide (5 chiffres)')
    .optional();

// ============================================================================
// STUDENT SCHEMA
// ============================================================================

export const studentSchema = z.object({
    // Required fields
    first_name: z
        .string()
        .min(2, 'Le prénom doit contenir au moins 2 caractères')
        .max(100, 'Le prénom ne peut pas dépasser 100 caractères')
        .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le prénom ne peut contenir que des lettres, espaces, apostrophes et tirets'),

    last_name: z
        .string()
        .min(2, 'Le nom doit contenir au moins 2 caractères')
        .max(100, 'Le nom ne peut pas dépasser 100 caractères')
        .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets'),

    birth_date: z
        .string()
        .or(z.date())
        .refine(
            (date) => {
                const birthDate = new Date(date);
                const today = new Date();
                const age = today.getFullYear() - birthDate.getFullYear();
                return age >= 3 && age <= 100;
            },
            'L\'élève doit avoir entre 3 et 100 ans'
        ),

    gender: z.enum(['M', 'F', 'OTHER'], {
        errorMap: () => ({ message: 'Genre invalide (M, F, ou OTHER)' }),
    }),

    // Optional fields
    email: emailSchema.optional(),
    phone: phoneSchema,
    address: z.string().max(255, 'L\'adresse ne peut pas dépasser 255 caractères').optional(),
    city: z.string().max(100, 'La ville ne peut pas dépasser 100 caractères').optional(),
    postal_code: postalCodeSchema,
    country: z.string().max(100, 'Le pays ne peut pas dépasser 100 caractères').optional(),

    emergency_contact: z
        .string()
        .max(255, 'Le contact d\'urgence ne peut pas dépasser 255 caractères')
        .optional(),

    registration_number: z
        .string()
        .regex(/^[A-Z0-9-]+$/, 'Le numéro d\'inscription ne peut contenir que des lettres majuscules, chiffres et tirets')
        .optional(),

    status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'EXPELLED'], {
        errorMap: () => ({ message: 'Statut invalide' }),
    }).optional(),
});

export type StudentInput = z.infer<typeof studentSchema>;

// ============================================================================
// INVOICE SCHEMA
// ============================================================================

export const invoiceSchema = z.object({
    // Required fields
    student_id: z.string().uuid('ID élève invalide'),

    amount: z
        .number()
        .positive('Le montant doit être positif')
        .max(100000, 'Le montant ne peut pas dépasser 100 000')
        .refine(
            (val) => Number.isFinite(val) && val.toFixed(2) === val.toString(),
            'Le montant doit avoir au maximum 2 décimales'
        ),

    due_date: z
        .string()
        .or(z.date())
        .refine(
            (date) => new Date(date) >= new Date(new Date().setHours(0, 0, 0, 0)),
            'La date d\'échéance ne peut pas être dans le passé'
        ),

    // Optional fields
    description: z.string().max(500, 'La description ne peut pas dépasser 500 caractères').optional(),

    status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'], {
        errorMap: () => ({ message: 'Statut invalide' }),
    }).optional(),

    invoice_number: z
        .string()
        .regex(/^INV-\d{4}-\d{6}$/, 'Numéro de facture invalide (format: INV-YYYY-XXXXXX)')
        .optional(),

    parent_id: z.string().uuid('ID parent invalide').optional(),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;

// ============================================================================
// PAYMENT SCHEMA
// ============================================================================

export const paymentSchema = z.object({
    // Required fields
    invoice_id: z.string().uuid('ID facture invalide'),

    amount: z
        .number()
        .positive('Le montant doit être positif')
        .max(100000, 'Le montant ne peut pas dépasser 100 000'),

    payment_method: z.enum(['CASH', 'CHECK', 'BANK_TRANSFER', 'CARD', 'MOBILE_PAYMENT'], {
        errorMap: () => ({ message: 'Méthode de paiement invalide' }),
    }),

    payment_date: z
        .string()
        .or(z.date())
        .refine(
            (date) => new Date(date) <= new Date(),
            'La date de paiement ne peut pas être dans le futur'
        ),

    // Optional fields
    reference: z
        .string()
        .max(100, 'La référence ne peut pas dépasser 100 caractères')
        .optional(),

    notes: z
        .string()
        .max(500, 'Les notes ne peuvent pas dépasser 500 caractères')
        .optional(),

    received_by: z.string().uuid('ID utilisateur invalide').optional(),
});

export type PaymentInput = z.infer<typeof paymentSchema>;

// ============================================================================
// GRADE SCHEMA
// ============================================================================

export const gradeSchema = z.object({
    student_id: z.string().uuid('ID élève invalide'),
    subject_id: z.string().uuid('ID matière invalide'),
    term_id: z.string().uuid('ID trimestre invalide'),

    grade: z
        .number()
        .min(0, 'La note ne peut pas être négative')
        .max(20, 'La note ne peut pas dépasser 20')
        .refine(
            (val) => Number.isFinite(val) && val.toFixed(2) === val.toString(),
            'La note doit avoir au maximum 2 décimales'
        ),

    coefficient: z
        .number()
        .positive('Le coefficient doit être positif')
        .max(10, 'Le coefficient ne peut pas dépasser 10')
        .optional()
        .default(1),

    comments: z
        .string()
        .max(1000, 'Les commentaires ne peuvent pas dépasser 1000 caractères')
        .optional(),
});

export type GradeInput = z.infer<typeof gradeSchema>;

// ============================================================================
// ATTENDANCE SCHEMA
// ============================================================================

export const attendanceSchema = z.object({
    student_id: z.string().uuid('ID élève invalide'),

    date: z
        .string()
        .or(z.date())
        .refine(
            (date) => new Date(date) <= new Date(),
            'La date de présence ne peut pas être dans le futur'
        ),

    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'], {
        errorMap: () => ({ message: 'Statut de présence invalide' }),
    }),

    subject_id: z.string().uuid('ID matière invalide').optional(),

    notes: z
        .string()
        .max(500, 'Les notes ne peuvent pas dépasser 500 caractères')
        .optional(),
});

export type AttendanceInput = z.infer<typeof attendanceSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate data and return formatted errors
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: boolean;
    data?: T;
    errors?: Record<string, string>;
} {
    const result = schema.safeParse(data);

    if (result.success) {
        return { success: true, data: result.data };
    }

    const errors: Record<string, string> = {};
    result.error.errors.forEach((err) => {
        const path = err.path.join('.');
        errors[path] = err.message;
    });

    return { success: false, errors };
}

/**
 * Validate and throw error if invalid (for backend use)
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return schema.parse(data);
}
