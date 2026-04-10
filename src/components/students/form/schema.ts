import { z } from "zod";

export const studentSchema = z.object({
    // Identity
    first_name: z.string().min(1, "Le prénom est requis"),
    last_name: z.string().min(1, "Le nom est requis"),
    date_of_birth: z.string().optional().or(z.literal("")),
    gender: z.string().optional(),
    nationality: z.string().optional(),
    student_id_card: z.string().optional(),

    // Contact
    email: z.string().email("Email invalide").optional().or(z.literal("")),
    phone: z.string()
        .min(8, "Numéro de téléphone trop court")
        .max(20, "Numéro de téléphone trop long")
        .regex(/^[+]?[(]?[0-9]{3,}[)]?[-s./0-9]*$/, "Format de téléphone invalide")
        .optional()
        .or(z.literal("")),
    address: z.string().min(5, "L'adresse est trop courte").optional().or(z.literal("")),
    postal_code: z.string().optional(),
    city: z.string().min(2, "Le nom de la ville est trop court").optional().or(z.literal("")),
    state: z.string().optional(),
    country: z.string().optional(),

    // Academic
    registration_number: z.string().optional(),
    admission_date: z.string().optional().or(z.literal("")),
    department_id: z.string().optional(),
    level_id: z.string().optional(),
    class_id: z.string().optional(),
    notes: z.string().optional(),
});

export type StudentFormValues = z.infer<typeof studentSchema>;

export interface Parent {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address?: string;
}

export type UserParent = {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
};

export const parentSchema = z.object({
    first_name: z.string().min(1, "Le prénom est requis"),
    last_name: z.string().min(1, "Le nom est requis"),
    email: z.string().email("Email invalide").optional().or(z.literal("")),
    phone: z.string().optional(),
    address: z.string().optional(),
});

export type ParentFormValues = z.infer<typeof parentSchema>;
