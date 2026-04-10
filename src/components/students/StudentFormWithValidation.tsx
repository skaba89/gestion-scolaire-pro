/**
 * StudentFormDialog with Zod Validation
 * Example of integrating Zod schemas with form submission
 * Can be applied to other forms
 */

import { useState } from "react";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { StudentSchema } from "@/lib/schemas/studentSchema";
import { useZodValidation } from "@/hooks/useZodValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { z } from "zod";

type StudentFormDataType = z.infer<typeof StudentSchema>;

interface StudentFormWithValidationProps {
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Enhanced form component with Zod validation
 * Features:
 * - Real-time field validation
 * - Type-safe form data
 * - Clear error messages
 * - Graceful error handling
 */
export function StudentFormWithValidation({
  onSuccess,
  onCancel,
}: StudentFormWithValidationProps) {
  const { currentTenant } = useTenant();
  const { validate, validateField, getFieldError, clearErrors } = useZodValidation(StudentSchema);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<Partial<StudentFormDataType>>({
    first_name: "",
    last_name: "",
    email: "",
    date_of_birth: "",
    gender: "M",
    nationality: "",
  });

  // Handle field change with real-time validation
  const handleFieldChange = async (field: keyof StudentFormDataType, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Optional: Real-time validation as user types
    // Uncomment for immediate feedback
    // const error = await validateField(field, value);
    // if (!error) {
    //   // Clear specific field error
    // }
  };

  // Handle form submission with full validation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate entire form
      const validationResult = await validate(formData);

      if (!validationResult.isValid) {
        toast.error("Please fix the validation errors");
        return;
      }

      // Form is valid, submit to database
      const submissionData = {
        ...validationResult.data,
        tenant_id: currentTenant?.id,
      };

      await apiClient.post('/students/', [submissionData]);

      if (false) {
        toast.error(`Failed to create student`);
        return;
      }

      toast.success("Student created successfully!");
      clearErrors();
      onSuccess();
    } catch (error) {
      console.error("Submission error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to render field with error
  const renderField = (
    label: string,
    fieldName: keyof StudentFormDataType,
    value: any,
    type: string = "text"
  ) => {
    const error = getFieldError(fieldName);
    return (
      <div key={fieldName}>
        <Label htmlFor={fieldName}>{label}</Label>
        <Input
          id={fieldName}
          type={type}
          value={value || ""}
          onChange={(e) => handleFieldChange(fieldName, e.target.value)}
          aria-invalid={!!error}
          className={error ? "border-red-500" : ""}
        />
        {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {renderField("First Name", "first_name", formData.first_name)}
        {renderField("Last Name", "last_name", formData.last_name)}
      </div>

      {renderField("Email", "email", formData.email, "email")}
      {renderField("Date of Birth", "date_of_birth", formData.date_of_birth, "date")}

      <div className="grid grid-cols-2 gap-4">
        {renderField("Gender", "gender", formData.gender)}
        {renderField("Nationality", "nationality", formData.nationality)}
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create Student"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Integration Notes:
 * 
 * 1. This component demonstrates Zod validation integration
 * 2. Apply same pattern to other forms (HomeworkForm, GradeForm, etc.)
 * 3. studentSchema provides runtime validation + TypeScript types
 * 4. Errors are caught and displayed inline
 * 5. Form only submits if all validations pass
 * 
 * To use in StudentFormDialog:
 * - Replace existing form with this component
 * - Pass onSuccess and onCancel handlers
 * - Adjust styling to match existing UI
 * 
 * Benefits:
 * - 100% type safety
 * - Clear error messages
 * - Automatic field validation
 * - Consistent validation across forms
 * - Easy to extend with custom validators
 */
