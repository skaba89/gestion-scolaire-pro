/**
 * useStudents Hook
 * Centralized hook for all student-related operations
 * Includes: CRUD, pagination, archiving, account creation, audit logging
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantStore } from "@/stores/tenantStore";
import { studentsService, type ListStudentsOptions } from "../services/studentsService";
import type { StudentFormData, Student } from "../types/students";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";

export const useStudents = (options?: ListStudentsOptions) => {
  const currentTenant = useTenantStore((state) => state.currentTenant);
  const queryClient = useQueryClient();
  const { logCreate, logUpdate, logDelete } = useAuditLog();

  // Query key for cache management
  const queryKey = ["students", currentTenant?.id, options];

  // Fetch students with pagination
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!currentTenant?.id) return { students: [], totalCount: 0 };
      return studentsService.listStudents(currentTenant.id, options);
    },
    enabled: !!currentTenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create student mutation
  const createMutation = useMutation({
    mutationFn: (studentData: StudentFormData) => {
      if (!currentTenant?.id) throw new Error("No tenant selected");
      return studentsService.createStudent(currentTenant.id, studentData);
    },
    onSuccess: (newStudent) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      logCreate("student", newStudent.id, newStudent);
      toast.success("Étudiant créé avec succès");
    },
    onError: (error: Error) => {
      toast.error(`Erreur : ${error.message}`);
    },
  });

  // Update student mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<StudentFormData> }) =>
      studentsService.updateStudent(id, updates),
    onMutate: async ({ id, updates }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          students: old.students.map((s: Student) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        };
      });

      return { previousData };
    },
    onSuccess: (updatedStudent, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      logUpdate("student", id, {}, updatedStudent);
      toast.success("Étudiant mis à jour");
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(`Erreur : ${error.message}`);
    },
  });

  // Delete student mutation
  const deleteMutation = useMutation({
    mutationFn: ({ id, studentData }: { id: string; studentData: Student }) => {
      logDelete("student", id, studentData);
      return studentsService.deleteStudent(id);
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          students: old.students.filter((s: Student) => s.id !== id),
          totalCount: old.totalCount - 1,
        };
      });

      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success("Étudiant supprimé définitivement");
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(`Erreur : ${error.message}`);
    },
  });

  // Archive/unarchive student mutation
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived, studentName }: { id: string; archived: boolean; studentName: string }) => {
      logUpdate("student", id, { is_archived: !archived }, { is_archived: archived, name: studentName });
      return studentsService.archiveStudent(id, archived);
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          students: old.students.filter((s: Student) => s.id !== id),
          totalCount: old.totalCount - 1,
        };
      });

      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success("Statut de l'étudiant mis à jour");
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(`Erreur : ${error.message}`);
    },
  });

  // Create account mutation
  const createAccountMutation = useMutation({
    mutationFn: (student: Student) => {
      if (!currentTenant) throw new Error("No tenant selected");
      return studentsService.createStudentAccount(student, currentTenant);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      const message = data?.emailSent
        ? "Compte créé et email envoyé avec succès"
        : "Compte créé avec succès";
      toast.success(message);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de la création du compte");
    },
  });

  return {
    // Data
    students: data?.students || [],
    totalCount: data?.totalCount || 0,

    // Loading states
    isLoading,
    error,

    // Actions
    refetch,
    createStudent: createMutation.mutate,
    updateStudent: updateMutation.mutate,
    deleteStudent: deleteMutation.mutate,
    archiveStudent: archiveMutation.mutate,
    createAccount: createAccountMutation.mutate,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isCreatingAccount: createAccountMutation.isPending,

    // Legacy aliases for backward compatibility
    studentList: data?.students || [],
    create: createMutation.mutate,
    update: updateMutation.mutate,
    delete: deleteMutation.mutate,
  };
};
