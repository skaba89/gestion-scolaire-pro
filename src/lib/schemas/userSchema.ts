/**
 * User/Auth Validation Schema
 * Zod schemas for authentication
 */

import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email("Invalid email format"),
  first_name: z
    .string()
    .min(1, "First name is required")
    .max(100),
  last_name: z
    .string()
    .min(1, "Last name is required")
    .max(100),
  phone: z.string().max(20).optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  is_active: z.boolean().default(true),
  created_at: z.string().optional(),
});

export const LoginSchema = z.object({
  email: z
    .string()
    .email("Email invalide")
    .transform((e) => e.toLowerCase()),
  password: z
    .string()
    .min(6, "Le mot de passe doit contenir au moins 6 caractères")
    .max(128),
  remember: z.boolean().default(false),
});

export const RegisterSchema = z
  .object({
    email: z
      .string()
      .email("Email invalide")
      .transform((e) => e.toLowerCase()),
    first_name: z
      .string()
      .min(1, "Le prénom est requis")
      .max(100),
    last_name: z
      .string()
      .min(1, "Le nom de famille est requis")
      .max(100),
    password: z
      .string()
      .min(8, "Le mot de passe doit contenir au moins 8 caractères")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
        "Le mot de passe doit contenir majuscules, minuscules, chiffres et caractères spéciaux"
      ),
    password_confirm: z.string(),
    terms: z.literal(true, {
      errorMap: () => ({ message: "Vous devez accepter les conditions" }),
    }),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: "Les mots de passe ne correspondent pas",
    path: ["password_confirm"],
  });

export const PasswordResetSchema = z.object({
  email: z.string().email("Email invalide"),
});

export const PasswordChangeSchema = z
  .object({
    current_password: z
      .string()
      .min(1, "Le mot de passe actuel est requis"),
    new_password: z
      .string()
      .min(8, "Le nouveau mot de passe doit contenir au moins 8 caractères")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
        "Doit contenir majuscules, minuscules, chiffres et caractères spéciaux"
      ),
    password_confirm: z.string(),
  })
  .refine((data) => data.new_password === data.password_confirm, {
    message: "Les mots de passe ne correspondent pas",
    path: ["password_confirm"],
  });

export type User = z.infer<typeof UserSchema>;
export type LoginFormData = z.infer<typeof LoginSchema>;
export type RegisterFormData = z.infer<typeof RegisterSchema>;
export type PasswordResetFormData = z.infer<typeof PasswordResetSchema>;
export type PasswordChangeFormData = z.infer<typeof PasswordChangeSchema>;
