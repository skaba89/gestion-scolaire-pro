import { z } from "zod";

/**
 * Validates data against a Zod schema or throws a formatted error.
 * Useful for backend RPCs and Edge Functions.
 */
export function validateOrThrow<T>(schema: z.Schema<T>, data: unknown): T {
    const result = schema.safeParse(data);

    if (!result.success) {
        const errorMessages = result.error.errors
            .map((err) => `${err.path.join('.')}: ${err.message}`)
            .join(', ');

        throw new Error(`Validation failed: ${errorMessages}`);
    }

    return result.data;
}
