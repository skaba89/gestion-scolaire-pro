/**
 * useToast - Hook to display toast notifications
 */

import { useToast as useToastFromUI } from "@/components/ui/use-toast";

export function useToast() {
  return useToastFromUI();
}
