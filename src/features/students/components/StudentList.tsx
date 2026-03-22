/**
 * StudentList Component
 */

import { useRef, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { StudentCard } from "./StudentCard";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import type { Student } from "../types/students";

interface StudentListProps {
  students: Student[];
  isLoading?: boolean;
  onEdit?: (student: Student) => void;
  onDelete?: (id: string) => Promise<void>;
  emptyMessage?: string;
}

export function StudentList({
  students,
  isLoading = false,
  onEdit,
  onDelete,
  emptyMessage,
}: StudentListProps) {
  const { studentLabel, StudentsLabel } = useStudentLabel();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  // SCALABILITY: Grid virtualization logic
  // Calculate items per row based on viewport (3 for lg, 2 for md, 1 for sm)
  // For simplicity in a general list, we virtualize rows.
  const rowCount = Math.ceil(students.length / 3);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 320, // Height of a StudentCard row
    overscan: 5,
  });

  const defaultEmptyMessage = `Aucun ${studentLabel} trouvé`;
  const finalEmptyMessage = emptyMessage || defaultEmptyMessage;

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      await onDelete?.(id);
      setDeleteId(null);
    } catch (error) {
      console.error("Delete error:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!students?.length) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{finalEmptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={parentRef}
        className="h-[800px] overflow-auto rounded-md border bg-muted/5 p-4"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const startIndex = virtualRow.index * 3;
            const itemsInRow = students.slice(startIndex, startIndex + 3);

            return (
              <div
                key={virtualRow.key}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 absolute top-0 left-0 w-full"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {itemsInRow.map((student) => (
                  <StudentCard
                    key={student.id}
                    student={student}
                    onEdit={onEdit}
                    onDelete={(id) => setDeleteId(id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'{studentLabel} sera définitivement supprimé du système.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
