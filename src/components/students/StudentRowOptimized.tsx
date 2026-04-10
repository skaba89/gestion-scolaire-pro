import { memo, useCallback } from "react";
import { Link } from "react-router-dom";
import { TableCell, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StudentAvatar } from "./StudentAvatar";
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
  Eye,
  Edit,
  Archive,
  UserCheck,
  UserPlus,
  MoreHorizontal,
  Loader2,
  Link2,
  Mail,
  FileText,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { resolveUploadUrl } from "@/utils/url";

interface StudentRowProps {
  student: any;
  creatingAccountFor: string | null;
  onEdit: (student: any) => void;
  onView: (student: any) => void;
  onArchive: (id: string, archived: boolean, name: string) => void;
  onDelete: (id: string) => void;
  onCreateAccount: (student: any) => void;
  onEnrollClick: () => void;
  tenantId?: string;
  style?: React.CSSProperties;
  className?: string;
  ariaRole?: string;
  ariaRowIndex?: number;
}

// Mémoïsé pour éviter re-rendus inutiles
export const StudentRowOptimized = memo(function StudentRowOptimized({
  student,
  creatingAccountFor,
  onEdit,
  onView,
  onArchive,
  onDelete,
  onCreateAccount,
  onEnrollClick,
  tenantId,
  style,
  className,
  ariaRole,
  ariaRowIndex,
}: StudentRowProps) {
  const { studentLabel } = useStudentLabel();
  const { getTenantUrl } = useTenantUrl();

  // Callbacks locaux pour éviter créations multiples
  const handleEdit = useCallback(() => {
    onEdit(student);
  }, [onEdit, student]);

  const handleView = useCallback(() => {
    onView(student);
  }, [onView, student]);

  const handleArchive = useCallback(() => {
    onArchive(student.id, !student.is_archived, `${student.first_name} ${student.last_name}`);
  }, [onArchive, student]);

  const handleDelete = useCallback(() => {
    if (confirm(`Êtes-vous sûr de vouloir supprimer définitivement cet ${studentLabel} ? Cette action est irréversible et supprimera toutes les données associées (notes, présences, etc.).`)) {
      onDelete(student.id);
    }
  }, [onDelete, student, studentLabel]);

  const handleCreateAccount = useCallback(() => {
    onCreateAccount(student);
  }, [onCreateAccount, student]);

  return (
    <TableRow
      key={student.id}
      style={style}
      className={className}
      role={ariaRole}
      aria-rowindex={ariaRowIndex}
    >
      <TableCell>
        <StudentAvatar
          photoUrl={student.photo_url}
          firstName={student.first_name}
          lastName={student.last_name}
          className="h-8 w-8 sm:h-10 sm:w-10"
        />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Badge variant="outline" className="text-xs">{student.registration_number}</Badge>
      </TableCell>
      <TableCell>
        <div>
          <Link
            to={getTenantUrl(`/admin/students/${student.id}`)}
            className="font-medium text-sm hover:text-primary transition-colors hover:underline"
          >
            {student.first_name} {student.last_name}
          </Link>
          <p className="text-xs text-muted-foreground sm:hidden">
            {student.registration_number}
          </p>
          {student.guardian_first_name && (
            <p className="text-xs text-muted-foreground hidden sm:block">
              Resp: {student.guardian_first_name} {student.guardian_last_name}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
        {student.email || "-"}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-sm">
        {student.date_of_birth
          ? format(new Date(student.date_of_birth), "dd MMM yyyy", { locale: fr })
          : "-"
        }
      </TableCell>
      <TableCell className="hidden lg:table-cell text-sm">{student.gender || "-"}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={handleView}
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={handleEdit}
          >
            <Edit className="w-4 h-4" />
          </Button>

          {/* Dropdown for more actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Create account option - only if no user_id */}
              {!student.user_id && (
                <>
                  <DropdownMenuItem
                    onClick={handleCreateAccount}
                    disabled={creatingAccountFor === student.id || !student.email}
                  >
                    {creatingAccountFor === student.id ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4 mr-2" />
                    )}
                    Créer compte
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Show linked status */}
              {student.user_id && (
                <>
                  <DropdownMenuItem disabled className="text-green-600">
                    <UserCheck className="w-4 h-4 mr-2" />
                    Compte lié
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Link to parents tab */}
              <DropdownMenuItem onClick={handleEdit}>
                <Link2 className="w-4 h-4 mr-2" />
                Gérer les parents liés
              </DropdownMenuItem>

              {!student.is_archived && tenantId && (
                <>
                  <DropdownMenuItem onClick={onEnrollClick}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Inscrire dans une classe
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />

              {/* Archive/Restore */}
              <DropdownMenuItem onClick={handleArchive}>
                {student.is_archived ? (
                  <>
                    <UserCheck className="w-4 h-4 mr-2" />
                    Restaurer
                  </>
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
                Supprimer définitivement
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem>
                <Mail className="w-4 h-4 mr-2" />
                Contacter parents
              </DropdownMenuItem>

              <DropdownMenuItem>
                <FileText className="w-4 h-4 mr-2" />
                Générer Bulletin
              </DropdownMenuItem>

              <DropdownMenuItem onClick={handleView}>
                <UserCheck className="w-4 h-4 mr-2" />
                Voir Profil Détaillé
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
});
