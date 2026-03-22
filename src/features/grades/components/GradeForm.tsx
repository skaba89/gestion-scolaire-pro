/**
 * GradeForm Component
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Grade, GradeFormData } from "../types/grades";
import { useStudentLabel } from "@/hooks/useStudentLabel";

const gradeSchema = z.object({
  student_id: z.string().min(1, "La sélection est requise"),
  subject_id: z.string().min(1, "La matière est requise"),
  grade: z.number().min(0, "Minimum 0").max(100, "Maximum 100"),
  grading_scale: z.string().min(1, "L'échelle de notation est requise"),
  academic_year_id: z.string().min(1, "L'année scolaire est requise"),
  term_id: z.string().optional(),
  comment: z.string().optional(),
});

interface GradeFormProps {
  initialData?: Grade;
  students: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  academicYears: Array<{ id: string; name: string }>;
  terms: Array<{ id: string; name: string }>;
  onSubmit: (data: GradeFormData) => Promise<void>;
  isLoading?: boolean;
}

export function GradeForm({
  initialData,
  students,
  subjects,
  academicYears,
  terms,
  onSubmit,
  isLoading = false,
}: GradeFormProps) {
  const { studentLabel, StudentLabel } = useStudentLabel();
  const form = useForm<z.infer<typeof gradeSchema>>({
    resolver: zodResolver(gradeSchema),
    defaultValues: initialData
      ? {
        student_id: initialData.student_id,
        subject_id: initialData.subject_id,
        grade: initialData.grade,
        grading_scale: initialData.grading_scale,
        academic_year_id: initialData.academic_year_id,
        term_id: initialData.term_id || "",
        comment: initialData.comment || "",
      }
      : {
        student_id: "",
        subject_id: "",
        grade: 0,
        grading_scale: "100",
        academic_year_id: "",
        term_id: "",
        comment: "",
      },
  });

  const handleSubmit = async (data: z.infer<typeof gradeSchema>) => {
    try {
      await onSubmit(data);
      form.reset();
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="student_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{StudentLabel}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={`Sélectionner un ${studentLabel}`} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="subject_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Matière</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une matière" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="grade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Note (0-100)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="grading_scale"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Échelle de notation</FormLabel>
                <FormControl>
                  <Input placeholder="ex: 100, 20, A-F" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="academic_year_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Année scolaire</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une année" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {academicYears.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="term_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trimestre (optionnel)</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un trimestre" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {terms.map((term) => (
                      <SelectItem key={term.id} value={term.id}>
                        {term.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Remarque (optionnel)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Ajouter une remarque ou un commentaire..."
                  {...field}
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? "Traitement..." : initialData ? "Mettre à jour" : "Créer"}
        </Button>
      </form>
    </Form>
  );
}
