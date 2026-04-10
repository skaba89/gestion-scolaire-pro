import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QrCode, Trash2, Edit } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface StudentBadge {
    id: string;
    student_id: string;
    badge_code: string;
    status: "ACTIVE" | "INACTIVE" | "LOST" | "EXPIRED";
    issued_at: string;
    student?: {
        first_name: string;
        last_name: string;
        registration_number?: string | null;
    };
    classroomName?: string;
}

interface BadgeTableProps {
    badges: StudentBadge[];
    onSelect: (badge: StudentBadge) => void;
    onUpdateStatus: (id: string, status: any) => void;
    onDelete: (id: string) => void;
    statusLabels: Record<string, string>;
    statusColors: Record<string, string>;
}

export function BadgeTable({
    badges,
    onSelect,
    onUpdateStatus,
    onDelete,
    statusLabels,
    statusColors,
}: BadgeTableProps) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Étudiant</TableHead>
                    <TableHead>N° Étudiant</TableHead>
                    <TableHead>Code Badge</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date d'émission</TableHead>
                    <TableHead>Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {badges.map((badge) => (
                    <TableRow key={badge.id}>
                        <TableCell className="font-medium">
                            {badge.student?.first_name} {badge.student?.last_name}
                        </TableCell>
                        <TableCell>{badge.student?.registration_number || "-"}</TableCell>
                        <TableCell>
                            <code className="bg-muted px-2 py-1 rounded text-sm">
                                {badge.badge_code}
                            </code>
                        </TableCell>
                        <TableCell>
                            <Badge className={statusColors[badge.status]}>
                                {statusLabels[badge.status]}
                            </Badge>
                        </TableCell>
                        <TableCell>
                            {format(new Date(badge.issued_at), "dd/MM/yyyy", { locale: fr })}
                        </TableCell>
                        <TableCell>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onSelect(badge)}
                                >
                                    <QrCode className="h-4 w-4" />
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
