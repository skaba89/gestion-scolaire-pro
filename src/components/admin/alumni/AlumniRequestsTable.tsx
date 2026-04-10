import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Eye, FileText } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface AlumniRequestsTableProps {
    requests: any[];
    profilesMap: Record<string, any>;
    staffMembers: any[];
    onAssign: (requestId: string, staffId: string) => void;
    onViewDetails: (request: any) => void;
    statusLabels: Record<string, any>;
    documentTypes: any[];
}

export function AlumniRequestsTable({
    requests,
    profilesMap,
    staffMembers,
    onAssign,
    onViewDetails,
    statusLabels,
    documentTypes
}: AlumniRequestsTableProps) {
    if (requests.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Aucune demande</h3>
                <p className="text-muted-foreground">Aucun résultat trouvé</p>
            </div>
        );
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Étudiant</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Assigné à</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {requests.map((request) => {
                    const status = statusLabels[request.status];
                    const docType = documentTypes.find(t => t.value === request.document_type);
                    const alumni = profilesMap[request.alumni_id];
                    const assignee = request.assigned_to ? profilesMap[request.assigned_to] : null;

                    return (
                        <TableRow key={request.id}>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                        <User className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium">
                                            {alumni?.first_name} {alumni?.last_name}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {alumni?.email}
                                        </p>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div>
                                    <p className="font-medium">{docType?.label}</p>
                                    {request.urgency === "urgent" && (
                                        <Badge variant="destructive" className="text-xs">Urgent</Badge>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                {request.created_at ? format(new Date(request.created_at), "dd/MM/yyyy", { locale: fr }) : "-"}
                            </TableCell>
                            <TableCell>
                                {assignee ? (
                                    <span>{assignee.first_name} {assignee.last_name}</span>
                                ) : (
                                    <Select
                                        onValueChange={(value) => onAssign(request.id, value)}
                                    >
                                        <SelectTrigger className="w-36 h-8">
                                            <SelectValue placeholder="Assigner" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {staffMembers?.map((staff) => (
                                                <SelectItem key={staff.id} value={staff.id}>
                                                    {staff.first_name} {staff.last_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </TableCell>
                            <TableCell>
                                <Badge className={status?.color}>
                                    {status?.icon}
                                    <span className="ml-1">{status?.label}</span>
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onViewDetails(request)}
                                >
                                    <Eye className="w-4 h-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
