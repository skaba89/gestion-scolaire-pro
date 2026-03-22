import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    MoreHorizontal,
    Edit,
    Trash2,
    CheckCircle,
    XCircle,
    Shield,
    KeyRound,
    Loader2,
    UserX,
    UserCheck,
    ArrowDown,
} from "lucide-react";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { UserWithRoles, AppRole } from "@/queries/users";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { getRoleLabel as getRoleLabelBase } from "@/lib/permissions";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { StaggerContainer, StaggerItem } from "@/components/layouts/PageTransition";

import { exportToCSV } from "@/utils/exportUtils";
import { toast } from "sonner";
import { Download, Search } from "lucide-react";

interface UserTableProps {
    users: UserWithRoles[];
    isLoading: boolean;
    totalCount: number;
    currentPage: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onEdit?: (user: UserWithRoles) => void;
    onDelete: (user: UserWithRoles) => void;
    onToggleStatus: (user: UserWithRoles) => void;
    onManageRoles: (user: UserWithRoles) => void;
    onResetPassword: (user: UserWithRoles) => void;
    currentUserId?: string;
    isSuperAdmin: boolean;
}

const ROLE_COLORS: Record<AppRole, string> = {
    SUPER_ADMIN: "bg-red-500",
    TENANT_ADMIN: "bg-purple-500",
    DIRECTOR: "bg-blue-500",
    DEPARTMENT_HEAD: "bg-indigo-500",
    TEACHER: "bg-green-500",
    STUDENT: "bg-yellow-500",
    PARENT: "bg-orange-500",
    ACCOUNTANT: "bg-cyan-500",
    STAFF: "bg-gray-500",
};

export const UserTable = ({
    users,
    isLoading,
    totalCount,
    currentPage,
    pageSize,
    onPageChange,
    onPageSizeChange,
    onEdit,
    onDelete,
    onToggleStatus,
    onManageRoles,
    onResetPassword,
    currentUserId,
    isSuperAdmin
}: UserTableProps) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const { StudentLabel } = useStudentLabel();
    const totalPages = Math.ceil(totalCount / pageSize);

    const rowVirtualizer = useVirtualizer({
        count: users.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 72, // Hauteur moyenne d'une ligne utilisateur
        overscan: 5,
    });

    const getRoleLabel = (role: AppRole) => {
        return getRoleLabelBase(role, StudentLabel);
    };

    if (isLoading) {
        return <TableSkeleton columns={5} rows={8} />;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        const count = exportToCSV(
                            users.map(u => ({
                                nom: u.last_name,
                                prenom: u.first_name,
                                email: u.email,
                                roles: u.roles.join(", "),
                                statut: u.is_active ? "Actif" : "Inactif",
                                date_inscription: u.created_at
                            })),
                            "utilisateurs"
                        );
                        toast.success(`${count} utilisateurs exportés`);
                    }}
                    disabled={users.length === 0}
                >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                </Button>
            </div>
            <div
                ref={parentRef}
                className="rounded-md border h-[600px] overflow-auto relative"
            >
                <Table role="grid" aria-label="Tableau des utilisateurs">
                    <TableHeader className="sticky top-0 bg-background z-20 shadow-sm">
                        <TableRow>
                            <TableHead className="bg-background" role="columnheader">Nom</TableHead>
                            <TableHead className="bg-background" role="columnheader">Email</TableHead>
                            <TableHead className="bg-background" role="columnheader">Rôles</TableHead>
                            <TableHead className="bg-background" role="columnheader">Statut</TableHead>
                            <TableHead className="text-right bg-background" role="columnheader">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                        {users.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    Aucun utilisateur trouvé
                                </TableCell>
                            </TableRow>
                        ) : (
                            rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const user = users[virtualRow.index];
                                return (
                                    <TableRow
                                        key={user.id}
                                        role="row"
                                        aria-rowindex={virtualRow.index + 1}
                                        className="border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50 absolute w-full left-0"
                                        style={{
                                            height: `${virtualRow.size}px`,
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                    >
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9 border-2 border-background shadow-sm">
                                                    <AvatarImage src={user.avatar_url || ""} />
                                                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                                        {user.first_name?.[0]}{user.last_name?.[0]}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <span className="font-bold">
                                                        {user.first_name || user.last_name
                                                            ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
                                                            : user.email.split("@")[0]}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-tighter">
                                                        Inscrit le {user.created_at ? format(new Date(user.created_at), "dd MMM yyyy", { locale: fr }) : "-"}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {user.roles.map((role) => (
                                                    <Badge
                                                        key={role}
                                                        variant="secondary"
                                                        className={cn(
                                                            "text-[10px] px-2 py-0.5 border-0 font-medium text-white shadow-sm",
                                                            ROLE_COLORS[role] || "bg-gray-500"
                                                        )}
                                                    >
                                                        {getRoleLabel(role)}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={user.is_active ? "default" : "destructive"}
                                                className={cn(
                                                    "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                                                    user.is_active ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"
                                                )}
                                            >
                                                {user.is_active ? (
                                                    <span className="flex items-center gap-1">
                                                        <CheckCircle className="w-3 h-3" /> Actif
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1">
                                                        <XCircle className="w-3 h-3" /> Inactif
                                                    </span>
                                                )}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <MoreHorizontal className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    <DropdownMenuSeparator />

                                                    {onEdit && (
                                                        <DropdownMenuItem onClick={() => onEdit(user)}>
                                                            <Edit className="w-4 h-4 mr-2" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                    )}

                                                    <DropdownMenuItem onClick={() => onManageRoles(user)}>
                                                        <Shield className="w-4 h-4 mr-2" />
                                                        Gérer les rôles
                                                    </DropdownMenuItem>

                                                    <DropdownMenuItem onClick={() => onResetPassword(user)}>
                                                        <KeyRound className="w-4 h-4 mr-2" />
                                                        Réinitialiser mot de passe
                                                    </DropdownMenuItem>

                                                    <DropdownMenuItem onClick={() => onToggleStatus(user)}>
                                                        {user.is_active ? (
                                                            <>
                                                                <UserX className="w-4 h-4 mr-2" />
                                                                Désactiver le compte
                                                            </>
                                                        ) : (
                                                            <>
                                                                <UserCheck className="w-4 h-4 mr-2" />
                                                                Activer le compte
                                                            </>
                                                        )}
                                                    </DropdownMenuItem>

                                                    {(isSuperAdmin || user.id !== currentUserId) && (
                                                        <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                                                onClick={() => onDelete(user)}
                                                            >
                                                                <Trash2 className="w-4 h-4 mr-2" />
                                                                Supprimer définitivement
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Controls */}
            {totalCount > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Afficher</span>
                        <Select
                            value={pageSize.toString()}
                            onValueChange={(v) => onPageSizeChange(parseInt(v))}
                        >
                            <SelectTrigger className="h-8 w-[70px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                        </Select>
                        <span>par page</span>
                        <span className="ml-4">
                            {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} sur {totalCount}
                        </span>
                    </div>

                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                            </PaginationItem>

                            <PaginationItem>
                                <span className="text-sm font-medium">Page {currentPage} sur {totalPages}</span>
                            </PaginationItem>

                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    );
};
