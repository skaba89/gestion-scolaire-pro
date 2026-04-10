/**
 * useHomework - Main hook for homework management
 * Handles fetching, creating, updating, and deleting homework
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { homeworkService } from "../services/homeworkService";
import { useTenant } from "@/contexts/TenantContext";
import type { Homework, HomeworkFormData, HomeworkFilters } from "../types/homework";

const HOMEWORK_QUERY_KEY = "homework";

export function useHomework(filters?: HomeworkFilters) {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /**
   * Fetch list of homework
   */
  const {
    data: homeworkList = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [HOMEWORK_QUERY_KEY, currentTenant?.id, filters],
    queryFn: async () => {
      if (!currentTenant) return [];
      try {
        return await homeworkService.listHomework(currentTenant.id, filters);
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to fetch homework",
          variant: "destructive",
        });
        throw err;
      }
    },
    enabled: !!currentTenant,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  /**
   * Create homework mutation
   */
  const createMutation = useMutation({
    mutationFn: async (formData: HomeworkFormData) => {
      if (!currentTenant) throw new Error("No tenant selected");
      return await homeworkService.createHomework(currentTenant.id, formData);
    },
    onSuccess: (newHomework) => {
      queryClient.invalidateQueries({ queryKey: [HOMEWORK_QUERY_KEY] });
      toast({
        title: "Success",
        description: `${newHomework.title} created successfully`,
      });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create homework",
        variant: "destructive",
      });
    },
  });

  /**
   * Update homework mutation
   */
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<HomeworkFormData>;
    }) => {
      return await homeworkService.updateHomework(id, data);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: [HOMEWORK_QUERY_KEY] });
      toast({
        title: "Success",
        description: `${updated.title} updated successfully`,
      });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update homework",
        variant: "destructive",
      });
    },
  });

  /**
   * Delete homework mutation
   */
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await homeworkService.deleteHomework(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [HOMEWORK_QUERY_KEY] });
      toast({
        title: "Success",
        description: "Homework deleted successfully",
      });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete homework",
        variant: "destructive",
      });
    },
  });

  return {
    // Query state
    homeworkList,
    isLoading,
    error,
    refetch,

    // Mutations
    create: createMutation.mutate,
    update: updateMutation.mutate,
    delete: deleteMutation.mutate,

    // Loading states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
