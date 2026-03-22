/**
 * AttendanceList Component
 */

import { useState } from "react";
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
import { AttendanceCard } from "./AttendanceCard";
import type { AttendanceRecord } from "../types/attendance";

interface AttendanceListProps {
  records: AttendanceRecord[];
  isLoading?: boolean;
  onEdit?: (record: AttendanceRecord) => void;
  onDelete?: (id: string) => Promise<void>;
  showStudent?: boolean;
  emptyMessage?: string;
}

export function AttendanceList({
  records,
  isLoading = false,
  onEdit,
  onDelete,
  showStudent = false,
  emptyMessage = "Aucune présence enregistrée",
}: AttendanceListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  if (!records?.length) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {records.map((record) => (
          <AttendanceCard
            key={record.id}
            record={record}
            showStudent={showStudent}
            onEdit={onEdit}
            onDelete={(id) => setDeleteId(id)}
          />
        ))}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'enregistrement de présence sera définitivement supprimé.
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
