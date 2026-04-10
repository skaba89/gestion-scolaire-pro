/**
 * HomeworkList - Display all homework items
 */

import { useState } from "react";
import { useHomework } from "../hooks/useHomework";
import { HomeworkCard } from "./HomeworkCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Homework, HomeworkFilters } from "../types/homework";

// Loading spinner component
function LoadingSpinner() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-40" />
      ))}
    </div>
  );
}

interface HomeworkListProps {
  filters?: HomeworkFilters;
  onEdit?: (homework: Homework) => void;
  onDelete?: (homeworkId: string) => void;
  onView?: (homeworkId: string) => void;
  showActions?: boolean;
}

export function HomeworkList({
  filters,
  onEdit,
  onDelete,
  onView,
  showActions = true,
}: HomeworkListProps) {
  const { homeworkList, isLoading, error, delete: deleteHomework } = useHomework(filters);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this homework?")) {
      setDeletingId(id);
      try {
        if (onDelete) {
          await onDelete(id);
        } else {
          await deleteHomework(id);
        }
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load homework: {error instanceof Error ? error.message : "Unknown error"}
        </AlertDescription>
      </Alert>
    );
  }

  if (!homeworkList || homeworkList.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No homework found. Create one to get started.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {homeworkList.map((homework) => (
        <HomeworkCard
          key={homework.id}
          homework={homework}
          onEdit={onEdit}
          onDelete={handleDelete}
          onView={onView}
          showActions={showActions}
        />
      ))}
    </div>
  );
}
