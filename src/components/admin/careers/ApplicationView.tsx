import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface ApplicationViewProps {
    applications: any[];
    onUpdateStatus: (id: string, status: string) => void;
}

export function ApplicationView({ applications, onUpdateStatus }: ApplicationViewProps) {
    const getStatusBadge = (status: string) => {
        const variants: any = {
            PENDING: { label: "En attente", className: "bg-yellow-500" },
            REVIEWING: { label: "En révision", className: "bg-blue-500" },
            INTERVIEW: { label: "Entretien", className: "bg-purple-500" },
            ACCEPTED: { label: "Acceptée", className: "bg-green-500" },
            REJECTED: { label: "Refusée", className: "bg-red-500" },
            WITHDRAWN: { label: "Retirée", className: "bg-gray-500" },
        };
        const { label, className } = variants[status] || { label: status, className: "bg-gray-500" };
        return <Badge className={className}>{label}</Badge>;
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Candidatures reçues</CardTitle>
                <CardDescription>Gérez les candidatures des étudiants</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Étudiant</TableHead>
                            <TableHead>Offre</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {applications.map((app) => (
                            <TableRow key={app.id}>
                                <TableCell>
                                    <div>
                                        <p className="font-medium">
                                            {app.students?.first_name} {app.students?.last_name}
                                        </p>
                                        <p className="text-sm text-muted-foreground">{app.students?.registration_number}</p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div>
                                        <p className="font-medium">{app.job_offers?.title}</p>
                                        <p className="text-sm text-muted-foreground">{app.job_offers?.company_name}</p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {format(new Date(app.applied_at), "dd MMM yyyy", { locale: fr })}
                                </TableCell>
                                <TableCell>{getStatusBadge(app.status)}</TableCell>
                                <TableCell className="text-right">
                                    <Select
                                        value={app.status}
                                        onValueChange={(status: string) => onUpdateStatus(app.id, status)}
                                    >
                                        <SelectTrigger className="w-32">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="PENDING">En attente</SelectItem>
                                            <SelectItem value="REVIEWING">En révision</SelectItem>
                                            <SelectItem value="INTERVIEW">Entretien</SelectItem>
                                            <SelectItem value="ACCEPTED">Acceptée</SelectItem>
                                            <SelectItem value="REJECTED">Refusée</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                            </TableRow>
                        ))}
                        {applications.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                    Aucune candidature reçue
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
