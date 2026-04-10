import { Calendar, Edit, Trash2 } from "lucide-react";
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
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { AcademicYear } from "@/queries/academic-years";

interface AcademicYearTableProps {
    years: AcademicYear[];
    loading: boolean;
    onEdit: (year: AcademicYear) => void;
    onDelete: (id: string) => void;
}

export const AcademicYearTable = ({
    years,
    loading,
    onEdit,
    onDelete,
}: AcademicYearTableProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Liste des années scolaires
                </CardTitle>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <TableSkeleton columns={5} rows={5} />
                ) : years.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        Aucune année scolaire créée
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nom</TableHead>
                                <TableHead>Début</TableHead>
                                <TableHead>Fin</TableHead>
                                <TableHead>Statut</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {years.map((year) => (
                                <TableRow key={year.id}>
                                    <TableCell className="font-medium">{year.name}</TableCell>
                                    <TableCell>{new Date(year.start_date).toLocaleDateString("fr-FR")}</TableCell>
                                    <TableCell>{new Date(year.end_date).toLocaleDateString("fr-FR")}</TableCell>
                                    <TableCell>
                                        {year.is_current ? (
                                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                                En cours
                                            </span>
                                        ) : (
                                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                                Inactive
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" onClick={() => onEdit(year)}>
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onDelete(year.id)}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
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
