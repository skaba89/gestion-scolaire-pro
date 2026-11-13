/**
 * HomeworkForm - Form for creating/editing homework
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useHomework } from "../hooks/useHomework";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Homework } from "../types/homework";
import { useTranslation } from "react-i18next";

// Zod schema for form validation
const homeworkFormSchema = z.object({
  title: z.string()
    .min(1, "homeworkFeature.titleRequired")
    .max(255, "homeworkFeature.titleTooLong"),
  description: z.string()
    .max(2000, "homeworkFeature.descriptionTooLong")
    .optional(),
  due_date: z.string()
    .datetime()
    .optional(),
  class_id: z.string().optional(),
  subject_id: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'COMPLETED', 'ARCHIVED']).optional(),
});

// Local form data type (subset of Homework interface or separate)
interface HomeworkFormValues {
  title: string;
  description?: string;
  due_date?: string;
  class_id?: string;
  subject_id?: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'ARCHIVED';
}

interface HomeworkFormProps {
  homework?: Homework;
  onSuccess?: (homework: Homework) => void;
  onCancel?: () => void;
}

export function HomeworkForm({ homework, onSuccess, onCancel }: HomeworkFormProps) {
  const { t } = useTranslation();
  const { create, update, isCreating, isUpdating } = useHomework();
  const isLoading = isCreating || isUpdating;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<HomeworkFormValues>({
    resolver: zodResolver(homeworkFormSchema),
    defaultValues: homework ? {
      title: homework.title,
      description: homework.description,
      due_date: homework.due_date,
      class_id: homework.class_id,
      subject_id: homework.subject_id,
      status: homework.status as any,
    } : undefined,
  });

  const onSubmit = (data: HomeworkFormValues) => {
    if (homework) {
      // Update mode
      update(
        { id: homework.id, data: data as any },
        {
          onSuccess: (updated) => {
            reset();
            onSuccess?.(updated);
          },
        }
      );
    } else {
      // Create mode
      create(data as any, {
        onSuccess: (created) => {
          reset();
          onSuccess?.(created);
        },
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">
          {t("homeworkFeature.title")}
        </label>
        <Input
          {...register("title")}
          placeholder={t("homeworkFeature.titlePlaceholder")}
          disabled={isLoading}
          className={errors.title ? "border-red-500" : ""}
        />
        {errors.title && (
          <p className="text-sm text-red-500 mt-1">{errors.title.message ? t(errors.title.message) : null}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          {t("homeworkFeature.description")}
        </label>
        <Textarea
          {...register("description")}
          placeholder={t("homeworkFeature.descriptionPlaceholder")}
          disabled={isLoading}
          rows={4}
          className={errors.description ? "border-red-500" : ""}
        />
        {errors.description && (
          <p className="text-sm text-red-500 mt-1">{errors.description.message ? t(errors.description.message) : null}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            {t("homeworkFeature.dueDate")}
          </label>
          <Input
            {...register("due_date")}
            type="datetime-local"
            disabled={isLoading}
            className={errors.due_date ? "border-red-500" : ""}
          />
          {errors.due_date && (
            <p className="text-sm text-red-500 mt-1">{errors.due_date.message ? t(errors.due_date.message) : null}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            {t("homeworkFeature.status")}
          </label>
          <select
            {...register("status")}
            disabled={isLoading}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="">{t("homeworkFeature.selectStatus")}</option>
            <option value="DRAFT">{t("homeworkFeature.DRAFT")}</option>
            <option value="PUBLISHED">{t("homeworkFeature.PUBLISHED")}</option>
            <option value="COMPLETED">{t("homeworkFeature.COMPLETED")}</option>
            <option value="ARCHIVED">{t("homeworkFeature.ARCHIVED")}</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            {t("homeworkFeature.cancel")}
          </Button>
        )}
        <Button
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? t("homeworkFeature.saving") : homework ? t("homeworkFeature.update") : t("homeworkFeature.create")}
        </Button>
      </div>
    </form>
  );
}
