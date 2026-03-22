/**
 * RGPD Validation Integration Example
 * 
 * This file demonstrates how to integrate Zod validation schemas
 * into existing forms for robust data validation.
 */

import { studentSchema, invoiceSchema, paymentSchema, validateData } from '@/lib/validation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// Mock supabase for demonstration
const supabase = {
    from: (_table: string) => ({
        insert: (_data: any) => ({
            select: () => ({
                single: () => Promise.resolve({ data: null, error: null })
            })
        })
    })
};

// Mock toast for demonstration
const toast = {
    error: (msg: string) => console.log('Toast error:', msg),
    success: (msg: string) => console.log('Toast success:', msg),
};

// Mock createStudent for demonstration
const createStudent = async (data: any) => console.log('Creating student:', data);

// ============================================================================
// Example 1: Student Form Validation
// ============================================================================

/**
 * Usage in a student creation/edit form
 */
export function validateStudentForm(formData: any) {
    const result = validateData(studentSchema, {
        first_name: formData.firstName,
        last_name: formData.lastName,
        birth_date: formData.birthDate,
        gender: formData.gender,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        postal_code: formData.postalCode,
        country: formData.country,
        emergency_contact: formData.emergencyContact,
        registration_number: formData.registrationNumber,
        status: formData.status,
    });

    if (!result.success) {
        return { valid: false, errors: result.errors };
    }

    return { valid: true, data: result.data };
}

/**
 * React Hook Form integration example
 */
export function StudentFormWithZod() {
    const form = useForm({
        resolver: zodResolver(studentSchema),
        defaultValues: {
            first_name: '',
            last_name: '',
            birth_date: '',
            gender: 'M' as 'M' | 'F' | 'O',
            email: '',
            phone: '',
        },
    });

    const onSubmit = async (data: any) => {
        console.log('Valid student data:', data);

        const { error } = await (supabase.from('students') as any)
            .insert(data);

        if (error) {
            console.error('Error creating student:', error);
        }
    };

    return (
        <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* Form fields with automatic validation */}
            <input {...form.register('first_name')} />
            {form.formState.errors.first_name && (
                <span className="text-red-500">
                    {String(form.formState.errors.first_name.message)}
                </span>
            )}
            {/* ... other fields */}
        </form>
    );
}

// ============================================================================
// Example 2: Invoice Form Validation
// ============================================================================

/**
 * Usage in invoice creation form
 */
export function validateInvoiceForm(formData: any) {
    const result = validateData(invoiceSchema, {
        student_id: formData.studentId,
        amount: parseFloat(formData.amount),
        due_date: formData.dueDate,
        description: formData.description,
        status: formData.status,
        invoice_number: formData.invoiceNumber,
        parent_id: formData.parentId,
    });

    if (!result.success) {
        return { valid: false, errors: result.errors };
    }

    return { valid: true, data: result.data };
}

// ============================================================================
// Example 3: Payment Form Validation
// ============================================================================

/**
 * Usage in payment registration form
 */
export function validatePaymentForm(formData: any) {
    const result = validateData(paymentSchema, {
        invoice_id: formData.invoiceId,
        amount: parseFloat(formData.amount),
        payment_method: formData.paymentMethod,
        payment_date: formData.paymentDate,
        reference: formData.reference,
        notes: formData.notes,
        received_by: formData.receivedBy,
    });

    if (!result.success) {
        return { valid: false, errors: result.errors };
    }

    return { valid: true, data: result.data };
}

// ============================================================================
// Example 4: Backend RPC Validation
// ============================================================================

/**
 * Usage in Supabase Edge Functions or RPC
 */
export async function createStudentWithValidation(studentData: any) {
    const validation = validateData(studentSchema, studentData);

    if (!validation.success) {
        throw new Error(JSON.stringify(validation.errors));
    }

    const { data, error } = await (supabase.from('students') as any)
        .insert(validation.data)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ============================================================================
// Example 5: Bulk Validation
// ============================================================================

/**
 * Validate multiple students (e.g., CSV import)
 */
export function validateStudentsBulk(students: any[]) {
    const results = students.map((student, index) => {
        const validation = validateData(studentSchema, student);
        return {
            index,
            valid: validation.success,
            data: validation.data,
            errors: validation.errors,
        };
    });

    const validStudents = results.filter(r => r.valid).map(r => r.data);
    const invalidStudents = results.filter(r => !r.valid);

    return {
        validCount: validStudents.length,
        invalidCount: invalidStudents.length,
        validStudents,
        invalidStudents,
    };
}

// ============================================================================
// Example 6: Custom Error Handling
// ============================================================================

/**
 * Display validation errors in UI
 */
export function displayValidationErrors(errors: Record<string, string>) {
    return Object.entries(errors).map(([field, message]) => ({
        field,
        message,
        severity: 'error' as const,
    }));
}

/**
 * Usage example:
 */
export function ExampleUsage() {
    const handleSubmit = async (formData: any) => {
        const validation = validateStudentForm(formData);

        if (!validation.valid) {
            const errorList = displayValidationErrors(validation.errors!);

            errorList.forEach(error => {
                toast.error(`${error.field}: ${error.message}`);
            });

            return;
        }

        await createStudent(validation.data);
    };
}
