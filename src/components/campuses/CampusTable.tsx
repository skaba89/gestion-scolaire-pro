import { Building2, Edit, Trash2 } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Campus } from "@/queries/campuses";

interface CampusTableProps {
    campuses: Campus[];
    isLoading: boolean;
    onEdit: (campus: Campus) => void;
    onDelete: (id: string) => void;
}

export const CampusTable = ({
    campuses,
    isLoading,
    onEdit,
    onDelete,
}: CampusTableProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Liste des campus
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Chargement...</div>
                ) : campuses.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        Aucun campus créé
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nom</TableHead>
                                <TableHead>Adresse</TableHead>
                                <TableHead>Téléphone</TableHead>
                                <TableHead>Statut</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {campuses.map((campus) => (
                                <TableRow key={campus.id}>
                                    <TableCell className="font-medium">{campus.name}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {campus.address || "-"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {campus.phone || "-"}
                                    </TableCell>
                                    <TableCell>
                                        {campus.is_main ? (
                                            <Badge variant="default">Principal</Badge>
                                        ) : (
                                            <Badge variant="secondary">Annexe</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => onEdit(campus)}>
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onDelete(campus.id)}
                                                className="text-destructive hover:text-destructive"
                                                disabled={campus.is_main}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
};
