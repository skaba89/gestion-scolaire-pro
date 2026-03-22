import { memo, useCallback } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Edit, Trash2, MoreHorizontal } from "lucide-react";

interface GradeRowProps {
  grade: any;
  onEdit: (grade: any) => void;
  onDelete: (id: string) => void;
}

// Mémoïsé pour éviter re-rendus inutiles
export const GradeRowOptimized = memo(function GradeRowOptimized({
  grade,
  onEdit,
  onDelete,
}: GradeRowProps) {
  // Callbacks locaux pour éviter créations multiples
  const handleEdit = useCallback(() => {
    onEdit(grade);
  }, [onEdit, grade]);

  const handleDelete = useCallback(() => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette note?")) {
      onDelete(grade.id);
    }
  }, [onDelete, grade]);

  // Déterminer la couleur du badge basée sur la note
  const getGradeColor = (score: number) => {
    if (score >= 16) return "bg-green-100 text-green-900";
    if (score >= 12) return "bg-blue-100 text-blue-900";
    if (score >= 10) return "bg-yellow-100 text-yellow-900";
    return "bg-red-100 text-red-900";
  };

  return (
    <TableRow key={grade.id}>
      <TableCell>
        <div>
          <p className="font-medium text-sm">{grade.student?.first_name} {grade.student?.last_name}</p>
          <p className="text-xs text-muted-foreground">{grade.student?.registration_number}</p>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell text-sm">
        {grade.subject?.name || "-"}
      </TableCell>
      <TableCell className="hidden md:table-cell text-sm">
        {grade.academic_year?.year || "-"}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-sm">
        {grade.term?.name || "-"}
      </TableCell>
      <TableCell>
        <Badge className={getGradeColor(grade.score || 0)}>
          {grade.score || "-"}/20
        </Badge>
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
