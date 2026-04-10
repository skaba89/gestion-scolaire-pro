/**
 * useZodValidation Hook
 * Integrates Zod schemas with form validation
 * Provides error messages and validation state
 */

import { useState, useCallback } from 'react';
import { ZodSchema, z } from 'zod';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  data?: Record<string, any>;
}

/**
 * Validate data against a Zod schema
 */
export function useZodValidation(schema: ZodSchema) {
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  const validate = useCallback(async (data: unknown): Promise<ValidationResult> => {
    setIsValidating(true);
    try {
      const result = await schema.parseAsync(data);
      setErrors([]);
      return {
        isValid: true,
        errors: [],
        data: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors: ValidationError[] = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        setErrors(validationErrors);
        return {
          isValid: false,
          errors: validationErrors,
        };
      }
      return {
        isValid: false,
        errors: [{ field: 'unknown', message: 'Validation error' }],
      };
    } finally {
      setIsValidating(false);
    }
  }, [schema]);

  const validateField = useCallback(async (fieldName: string, value: any): Promise<string | null> => {
    try {
      // Create a schema for just this field if possible
      if (schema instanceof z.ZodObject) {
        const fieldSchema = schema.shape[fieldName];
        if (fieldSchema) {
          await fieldSchema.parseAsync(value);
          return null;
        }
      }
      return null;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return error.errors[0]?.message || 'Invalid input';
      }
      return 'Invalid input';
    }
  }, [schema]);

  const getFieldError = useCallback((fieldName: string): string | null => {
    const error = errors.find((err) => err.field === fieldName);
    return error?.message || null;
  }, [errors]);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return {
    validate,
    validateField,
    getFieldError,
    clearErrors,
    errors,
    isValidating,
  };
}

/**
 * Type-safe form data extractor
 */
export function createFormValidator<T extends ZodSchema>(schema: T) {
  return {
    validate: async (data: unknown) => {
      return schema.parseAsync(data) as Promise<z.infer<T>>;
    },
    safeParse: (data: unknown) => {
      return schema.safeParse(data);
    },
  };
}
