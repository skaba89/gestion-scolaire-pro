import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type MentorshipStatus = "PENDING" | "ACCEPTED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

interface MentorshipRequestsTableProps {
    requests: any[];
    onStatusChange: (id: string, status: MentorshipStatus) => void;
}

export function MentorshipRequestsTable({ requests, onStatusChange }: MentorshipRequestsTableProps) {
    const getStatusBadge = (status: MentorshipStatus) => {
        const variants: Record<MentorshipStatus, { label: string; className: string }> = {
            PENDING: { label: "En attente", className: "bg-yellow-500" },
            ACCEPTED: { label: "Acceptée", className: "bg-blue-500" },
            ACTIVE: { label: "Active", className: "bg-green-500" },
            COMPLETED: { label: "Terminée", className: "bg-gray-500" },
            CANCELLED: { label: "Annulée", className: "bg-red-500" },
        };
        const { label, className } = variants[status] || { label: status, className: "bg-gray-500" };
        return <Badge className={className}>{label}</Badge>;
    };

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Étudiant</TableHead>
                    <TableHead>Mentor</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {requests.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            Aucune demande de mentorat
                        </TableCell>
                    </TableRow>
                ) : (
                    requests.map((request) => (
                        <TableRow key={request.id}>
                            <TableCell>
                                <div>
                                    <p className="font-medium">
                                        {request.students?.first_name} {request.students?.last_name}
                                    </p>
                                    <p className="text-sm text-muted-foreground">{request.students?.email}</p>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div>
                                    <p className="font-medium">
                                        {request.alumni_mentors?.first_name} {request.alumni_mentors?.last_name}
                                    </p>
                                    <p className="text-sm text-muted-foreground truncate max-w-[150px]">
                                        {request.alumni_mentors?.current_position} @ {request.alumni_mentors?.current_company}
                                    </p>
                                </div>
                            </TableCell>
                            <TableCell className="max-w-xs">
                                <p className="text-sm truncate">{request.message || "-"}</p>
                            </TableCell>
                            <TableCell>
                                {request.created_at ? format(new Date(request.created_at), "dd MMM yyyy", { locale: fr }) : "-"}
                            </TableCell>
                            <TableCell>{getStatusBadge(request.status)}</TableCell>
                            <TableCell className="text-right">
                                <Select
                                    value={request.status}
                                    onValueChange={(status: MentorshipStatus) => onStatusChange(request.id, status)}
                                >
                                    <SelectTrigger className="w-32 ml-auto">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PENDING">En attente</SelectItem>
                                        <SelectItem value="ACCEPTED">Acceptée</SelectItem>
                                        <SelectItem value="ACTIVE">Active</SelectItem>
                                        <SelectItem value="COMPLETED">Terminée</SelectItem>
                                        <SelectItem value="CANCELLED">Annulée</SelectItem>
                                    </SelectContent>
                                </Select>
                            </TableCell>
                        </TableRow>
                    ))
                )}
            </TableBody>
        </Table>
    );
}
