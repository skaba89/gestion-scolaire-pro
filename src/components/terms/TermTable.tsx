import { Calendar, Edit, Trash2, Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Term } from "@/queries/terms";

interface TermTableProps {
    terms: Term[];
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onEdit: (term: Term) => void;
    onDelete: (id: string) => void;
    currentPage: number;
    onPageChange: (page: number) => void;
    pageSize: number;
    onPageSizeChange: (size: number) => void;
}

export const TermTable = ({
    terms,
    searchTerm,
    onSearchChange,
    onEdit,
    onDelete,
    currentPage,
    onPageChange,
    pageSize,
    onPageSizeChange,
}: TermTableProps) => {
    const totalItems = terms.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginatedTerms = terms.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        Liste des trimestres
                    </CardTitle>
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Rechercher..."
                            className="pl-8 h-9"
                            value={searchTerm}
                            onChange={(e) => {
                                onSearchChange(e.target.value);
                                onPageChange(1);
                            }}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {terms.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        Aucun trimestre créé
                    </div>
                ) : (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nom</TableHead>
                                    <TableHead>Année</TableHead>
                                    <TableHead>Début</TableHead>
                                    <TableHead>Fin</TableHead>
                                    <TableHead>Statut</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedTerms.map((term) => (
                                    <TableRow key={term.id}>
                                        <TableCell className="font-medium">{term.name}</TableCell>
                                        <TableCell>{term.academic_year?.name}</TableCell>
                                        <TableCell>{new Date(term.start_date).toLocaleDateString("fr-FR")}</TableCell>
                                        <TableCell>{new Date(term.end_date).toLocaleDateString("fr-FR")}</TableCell>
                                        <TableCell>
                                            {term.is_active ? (
                                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                                    En cours
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                                    Inactif
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => onEdit(term)}>
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onDelete(term.id)}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {/* Pagination Controls */}
                        {totalItems > 0 && (
                            <div className="flex items-center justify-between mt-4 px-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span>Afficher</span>
                                    <Select
                                        value={pageSize.toString()}
                                        onValueChange={(v) => {
                                            onPageSizeChange(parseInt(v));
                                            onPageChange(1);
                                        }}
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
                                        {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalItems)} sur {totalItems}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        Précédent
                                    </Button>
                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                                            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                            .map((p, i, arr) => (
                                                <div key={p} className="flex items-center gap-1">
                                                    {i > 0 && arr[i - 1] !== p - 1 && <span className="text-muted-foreground">...</span>}
                                                    <Button
                                                        variant={currentPage === p ? "default" : "outline"}
                                                        size="sm"
                                                        className="w-8 h-8 p-0"
                                                        onClick={() => onPageChange(p)}
                                                    >
                                                        {p}
                                                    </Button>
                                                </div>
                                            ))}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                                        disabled={currentPage === totalPages || totalPages === 0}
                                    >
                                        Suivant
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};
