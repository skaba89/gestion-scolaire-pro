import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Layers, MapPin, Edit, Trash2, FilterX } from "lucide-react";
import { Subject } from "@/queries/subjects";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface SubjectTableProps {
    subjects: Subject[];
    onEdit: (subject: Subject) => void;
    onDelete: (id: string) => void;
    onAssignLevel: (subject: Subject) => void;
    onAssignRooms: (subject: Subject) => void;
    currentPage: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    onClearFilters: () => void;
    hasFilters: boolean;
    canEdit?: boolean;
}

export const SubjectTable = ({
    subjects,
    onEdit,
    onDelete,
    onAssignLevel,
    onAssignRooms,
    currentPage,
    pageSize,
    onPageChange,
    onPageSizeChange,
    onClearFilters,
    hasFilters,
    canEdit = false
}: SubjectTableProps) => {
    const totalItems = subjects.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginatedSubjects = subjects.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-primary" />
                        Liste des matières
                    </CardTitle>
                    <div className="text-xs text-muted-foreground font-medium bg-muted px-2 py-1 rounded">
                        {totalItems} résultat{totalItems > 1 ? 's' : ''}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {totalItems === 0 ? (
                    <div className="text-center py-12">
                        <FilterX className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                        <p className="text-muted-foreground">Aucune matière ne correspond à votre recherche</p>
                        {hasFilters && (
                            <Button variant="link" onClick={onClearFilters} className="mt-2 text-primary">
                                Effacer tous les filtres
                            </Button>
                        )}
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Matière</TableHead>
                                <TableHead>Code</TableHead>
                                <TableHead>ECTS</TableHead>
                                <TableHead>CM/TD/TP</TableHead>
                                <TableHead>Total</TableHead>
                                {canEdit && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedSubjects.map((subject) => (
                                <TableRow key={subject.id}>
                                    <TableCell className="font-medium">{subject.name}</TableCell>
                                    <TableCell>
                                        {subject.code ? (
                                            <Badge variant="outline">{subject.code}</Badge>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary">{subject.ects || 0} ECTS</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm font-mono">
                                        <span className="text-blue-600">{subject.cm_hours || 0}</span>/
                                        <span className="text-green-600">{subject.td_hours || 0}</span>/
                                        <span className="text-purple-600">{subject.tp_hours || 0}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="font-bold">
                                            {(subject.cm_hours || 0) + (subject.td_hours || 0) + (subject.tp_hours || 0)}h
                                        </span>
                                    </TableCell>
                                    {canEdit && (
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onAssignLevel(subject)}
                                                title="Assigner aux niveaux"
                                            >
                                                <Layers className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onAssignRooms(subject)}
                                                title="Salles préférentielles"
                                            >
                                                <MapPin className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => onEdit(subject)}>
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onDelete(subject.id)}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                {totalItems > 0 && (
                    <div className="flex items-center justify-between mt-4 px-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>Afficher</span>
                            <Select
                                value={pageSize.toString()}
                                onValueChange={(v) => onPageSizeChange(parseInt(v))}
                            >
                                <SelectTrigger className="h-8 w-16">
                                    <SelectValue placeholder={pageSize.toString()} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                            <span>par page</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onPageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                            >
                                Précédent
                            </Button>
                            <div className="flex items-center px-4 text-sm font-medium">
                                Page {currentPage} sur {totalPages || 1}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onPageChange(currentPage + 1)}
                                disabled={currentPage >= totalPages}
                            >
                                Suivant
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
