/**
 * Zod Validation Demo Component
 * Interactive component to test and demonstrate Zod validation
 * Useful for validating the validation system is working
 */

import { useState } from "react";
import { StudentSchema } from "@/lib/schemas/studentSchema";
import { useZodValidation } from "@/hooks/useZodValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import type { z } from "zod";

type StudentFormDataType = z.infer<typeof StudentSchema>;

/**
 * Interactive demo component to test Zod validation
 * Shows real-time validation feedback as user types
 */
export function ZodValidationDemo() {
  const { validate, validateField, getFieldError } = useZodValidation(StudentSchema);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<Partial<StudentFormDataType>>({
    first_name: "",
    last_name: "",
    email: "",
    date_of_birth: "",
    gender: "M",
    nationality: "",
  });

  const [validationResult, setValidationResult] = useState<{
    success: boolean;
    errors?: Record<string, string>;
  } | null>(null);

  /**
   * Handle field change - validates in real-time
   */
  const handleFieldChange = (field: keyof StudentFormDataType, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Real-time validation on each field
    const error = validateField(field, value);
    if (error) {
      toast.error(`${field}: ${error}`);
    } else {
      toast.success(`${field}: ✓ Valid`);
    }
  };

  /**
   * Test: Submit with INVALID data (missing fields)
   */
  const testInvalidSubmit = async () => {
    setIsSubmitting(true);
    const result = validate(formData);

    if (!result.success && result.errors) {
      setValidationResult({ success: false, errors: result.errors });
      const errorSummary = Object.entries(result.errors)
        .map(([field, error]) => `${field}: ${error}`)
        .join("\n");
      toast.error(`Validation failed:\n${errorSummary}`);
    } else {
      toast.info("No errors found (unexpected)");
    }
    setIsSubmitting(false);
  };

  /**
   * Test: Fill with VALID data and submit
   */
  const testValidSubmit = async () => {
    // Fill form with valid data
    const validData: Partial<StudentFormDataType> = {
      first_name: "John",
      last_name: "Doe",
      email: "john.doe@school.com",
      date_of_birth: "2010-05-15",
      gender: "M",
      nationality: "French",
    };

    setFormData(validData);

    // Validate all fields
    const result = validate(validData);

    if (result.success) {
      setValidationResult({ success: true });
      toast.success("✓ All fields valid! Ready to submit");
    } else if (result.errors) {
      setValidationResult({ success: false, errors: result.errors });
      toast.error("Validation failed");
    }
  };

  /**
   * Test: Clear the form
   */
  const testClear = () => {
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      date_of_birth: "",
      gender: "M",
      nationality: "",
    });
    setValidationResult(null);
    toast.info("Form cleared");
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-bold text-lg mb-2">🧪 Zod Validation Demo</h2>
        <p className="text-sm text-gray-700">
          Test the Zod validation system by filling fields and submitting. Watch for error messages
          and validation feedback.
        </p>
      </div>

      {/* Form Fields */}
      <div className="space-y-4 border rounded-lg p-4 bg-white">
        <h3 className="font-semibold">Student Form Fields</h3>

        {/* First Name */}
        <div className="space-y-1">
          <Label htmlFor="first_name">First Name *</Label>
          <Input
            id="first_name"
            placeholder="e.g., John"
            value={formData.first_name || ""}
            onChange={(e) => handleFieldChange("first_name", e.target.value)}
            className={getFieldError("first_name", formData.first_name || "") ? "border-red-500" : ""}
          />
          {getFieldError("first_name", formData.first_name || "") && (
            <p className="text-sm text-red-500">
              ❌ {getFieldError("first_name", formData.first_name || "")}
            </p>
          )}
        </div>

        {/* Last Name */}
        <div className="space-y-1">
          <Label htmlFor="last_name">Last Name *</Label>
          <Input
            id="last_name"
            placeholder="e.g., Doe"
            value={formData.last_name || ""}
            onChange={(e) => handleFieldChange("last_name", e.target.value)}
            className={getFieldError("last_name", formData.last_name || "") ? "border-red-500" : ""}
          />
          {getFieldError("last_name", formData.last_name || "") && (
            <p className="text-sm text-red-500">
              ❌ {getFieldError("last_name", formData.last_name || "")}
            </p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            placeholder="e.g., john@school.com"
            value={formData.email || ""}
            onChange={(e) => handleFieldChange("email", e.target.value)}
            className={getFieldError("email", formData.email || "") ? "border-red-500" : ""}
          />
          {getFieldError("email", formData.email || "") && (
            <p className="text-sm text-red-500">
              ❌ {getFieldError("email", formData.email || "")}
            </p>
          )}
        </div>

        {/* Date of Birth */}
        <div className="space-y-1">
          <Label htmlFor="dob">Date of Birth *</Label>
          <Input
            id="dob"
            type="date"
            value={formData.date_of_birth || ""}
            onChange={(e) => handleFieldChange("date_of_birth", e.target.value)}
            className={
              getFieldError("date_of_birth", formData.date_of_birth || "") ? "border-red-500" : ""
            }
          />
          {getFieldError("date_of_birth", formData.date_of_birth || "") && (
            <p className="text-sm text-red-500">
              ❌ {getFieldError("date_of_birth", formData.date_of_birth || "")}
            </p>
          )}
        </div>

        {/* Gender */}
        <div className="space-y-1">
          <Label htmlFor="gender">Gender</Label>
          <Select value={formData.gender || "M"} onValueChange={(value) => handleFieldChange("gender", value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">Male</SelectItem>
              <SelectItem value="F">Female</SelectItem>
              <SelectItem value="O">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Nationality */}
        <div className="space-y-1">
          <Label htmlFor="nationality">Nationality</Label>
          <Input
            id="nationality"
            placeholder="e.g., French"
            value={formData.nationality || ""}
            onChange={(e) => handleFieldChange("nationality", e.target.value)}
          />
        </div>
      </div>

      {/* Test Buttons */}
      <div className="space-y-3">
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
          <p className="text-sm font-semibold mb-3">🧪 Validation Tests</p>
          <div className="grid grid-cols-1 gap-2">
            <Button
              onClick={testInvalidSubmit}
              disabled={isSubmitting}
              className="bg-orange-500 hover:bg-orange-600"
            >
              ❌ Test Invalid Submit (Current Data)
            </Button>
            <Button
              onClick={testValidSubmit}
              disabled={isSubmitting}
              className="bg-green-500 hover:bg-green-600"
            >
              ✓ Test Valid Submit (Auto-fill)
            </Button>
            <Button onClick={testClear} variant="outline">
              🔄 Clear Form
            </Button>
          </div>
        </div>
      </div>

      {/* Validation Result Display */}
      {validationResult && (
        <Alert
          className={
            validationResult.success
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }
        >
          <AlertDescription
            className={validationResult.success ? "text-green-800" : "text-red-800"}
          >
            <div className="font-semibold mb-2">
              {validationResult.success ? "✅ Validation Passed!" : "❌ Validation Errors:"}
            </div>
            {!validationResult.success && validationResult.errors && (
              <ul className="list-disc list-inside space-y-1">
                {Object.entries(validationResult.errors).map(([field, error]) => (
                  <li key={field} className="text-sm">
                    <strong>{field}:</strong> {error}
                  </li>
                ))}
              </ul>
            )}
            {validationResult.success && (
              <p className="text-sm">All fields are valid and ready to submit!</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Instructions */}
      <div className="bg-gray-50 rounded p-4 text-sm space-y-2">
        <p className="font-semibold">📖 How to Test:</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-700">
          <li>Try leaving fields empty and clicking "Test Invalid Submit" → See errors</li>
          <li>Try entering invalid email (e.g., "not-an-email") → See email error</li>
          <li>Click "Test Valid Submit" → Auto-fills with valid data and validates</li>
          <li>Watch the toast notifications for real-time field validation</li>
          <li>See error messages below invalid fields in red</li>
        </ol>
      </div>

      {/* Current Form Data Display */}
      <details className="bg-gray-100 rounded p-4 cursor-pointer">
        <summary className="font-semibold">📊 Current Form Data (JSON)</summary>
        <pre className="mt-2 text-xs overflow-auto bg-white p-2 rounded border">
          {JSON.stringify(formData, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default ZodValidationDemo;
