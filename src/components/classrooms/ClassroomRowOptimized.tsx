import { memo, useCallback } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Edit,
  Archive,
  MoreHorizontal,
  Trash2,
  Users,
} from "lucide-react";

interface ClassroomRowProps {
  classroom: any;
  onEdit: (classroom: any) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string, archived: boolean, name: string) => void;
}

// Mémoïsé pour éviter re-rendus inutiles
export const ClassroomRowOptimized = memo(function ClassroomRowOptimized({
  classroom,
  onEdit,
  onDelete,
  onArchive,
}: ClassroomRowProps) {
  // Callbacks locaux pour éviter créations multiples
  const handleEdit = useCallback(() => {
    onEdit(classroom);
  }, [onEdit, classroom]);

  const handleDelete = useCallback(() => {
    if (confirm(`Êtes-vous sûr de vouloir supprimer définitivement la classe "${classroom.name}"?`)) {
      onDelete(classroom.id);
    }
  }, [onDelete, classroom]);

  const handleArchive = useCallback(() => {
    onArchive(classroom.id, !classroom.is_archived, classroom.name);
  }, [onArchive, classroom]);

  return (
    <TableRow key={classroom.id}>
      <TableCell className="font-medium">
        <div>
          <p className="font-semibold text-sm">{classroom.name}</p>
          <p className="text-xs text-muted-foreground">{classroom.code || "-"}</p>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Badge variant="outline">{classroom.level?.name || "-"}</Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="flex items-center gap-1">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">{classroom.student_count || 0}</span>
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell text-sm">
        {classroom.teacher?.first_name && classroom.teacher?.last_name
          ? `${classroom.teacher.first_name} ${classroom.teacher.last_name}`
          : "-"}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Modifier
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleArchive}>
              {classroom.is_archived ? (
                <>Restaurer</>
              ) : (
                <>
                  <Archive className="w-4 h-4 mr-2" />
                  Archiver
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600 focus:bg-red-50"
              onClick={handleDelete}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
});
