import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Users, Shield, Heart, Building, FileText, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface IncidentTableProps {
    incidents: any[];
    onUpdateStatus: (id: string, status: string) => void;
    showActions?: boolean;
}

export function IncidentTable({ incidents, onUpdateStatus, showActions = true }: IncidentTableProps) {
    const getTypeBadge = (type: string) => {
        const configs: Record<string, { icon: any; label: string; className: string }> = {
            discipline: { icon: Users, label: "Discipline", className: "bg-orange-100 text-orange-800" },
            safety: { icon: Shield, label: "Sécurité", className: "bg-red-100 text-red-800" },
            health: { icon: Heart, label: "Santé", className: "bg-pink-100 text-pink-800" },
            property: { icon: Building, label: "Matériel", className: "bg-blue-100 text-blue-800" },
            bullying: { icon: AlertTriangle, label: "Harcèlement", className: "bg-purple-100 text-purple-800" },
            other: { icon: FileText, label: "Autre", className: "bg-gray-100 text-gray-800" },
        };
        const config = configs[type] || configs.other;
        const Icon = config.icon;
        return (
            <Badge className={config.className}>
                <Icon className="h-3 w-3 mr-1" />
                {config.label}
            </Badge>
        );
    };

    const getSeverityBadge = (severity: string) => {
        const configs: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
            minor: { variant: "outline", label: "Mineur" },
            medium: { variant: "secondary", label: "Moyen" },
            major: { variant: "default", label: "Majeur" },
            critical: { variant: "destructive", label: "Critique" },
        };
        const config = configs[severity] || configs.medium;
        return <Badge variant={config.variant}>{config.label}</Badge>;
    };

    const getStatusBadge = (status: string) => {
        const configs: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
            reported: { variant: "outline", label: "Signalé" },
            investigating: { variant: "default", label: "En cours" },
            action_taken: { variant: "secondary", label: "Action prise" },
            resolved: { variant: "secondary", label: "Résolu" },
            closed: { variant: "outline", label: "Clôturé" },
        };
        const config = configs[status] || configs.reported;
        return <Badge variant={config.variant}>{config.label}</Badge>;
    };

    return (
        <Card>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>N°</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Titre</TableHead>
                        <TableHead>Gravité</TableHead>
                        {!showActions && <TableHead>Résolu par</TableHead>}
                        <TableHead>Lieu</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Statut</TableHead>
                        {showActions && <TableHead>Actions</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {incidents.map((incident) => (
                        <TableRow key={incident.id} className={!showActions ? "opacity-75" : ""}>
                            <TableCell className="font-mono text-sm">{incident.incident_number}</TableCell>
                            <TableCell>{getTypeBadge(incident.incident_type)}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{incident.title}</TableCell>
                            <TableCell>{getSeverityBadge(incident.severity)}</TableCell>
                            {!showActions && (
                                <TableCell className="text-muted-foreground">
                                    {incident.resolver?.first_name} {incident.resolver?.last_name}
                                </TableCell>
                            )}
                            <TableCell className="text-muted-foreground">
                                {incident.location && (
                                    <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {incident.location}
                                    </span>
                                )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {format(new Date(incident.occurred_at), "d MMM HH:mm", { locale: fr })}
                            </TableCell>
                            <TableCell>{getStatusBadge(incident.status)}</TableCell>
                            {showActions && (
                                <TableCell>
                                    <div className="flex gap-1">
                                        {incident.status === "reported" && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => onUpdateStatus(incident.id, "investigating")}
                                            >
                                                Investiguer
                                            </Button>
                                        )}
                                        {incident.status === "investigating" && (
                                            <Button
                                                size="sm"
                                                onClick={() => onUpdateStatus(incident.id, "resolved")}
                                            >
                                                Résoudre
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                    {incidents.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={showActions ? 8 : 8} className="text-center py-8 text-muted-foreground">
                                Aucun incident trouvé
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </Card>
    );
}
