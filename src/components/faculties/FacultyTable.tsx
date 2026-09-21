import {
    Landmark,
    Search,
    Pencil,
    Trash2,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
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
    CardTitle,
    CardDescription
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { Faculty } from "@/queries/faculties";

interface FacultyTableProps {
    faculties: Faculty[];
    isLoading: boolean;
    searchQuery: string;
    onSearchChange: (value: string) => void;
    selectedIds: string[];
    onToggleSelectAll: () => void;
    onToggleSelectOne: (id: string) => void;
    onEdit: (faculty: Faculty) => void;
    onDelete: (id: string) => void;
    currentPage: number;
    onPageChange: (page: number) => void;
    pageSize: number;
    onPageSizeChange: (size: number) => void;
}

export const FacultyTable = ({
    faculties,
    isLoading,
    searchQuery,
    onSearchChange,
    selectedIds,
    onToggleSelectAll,
    onToggleSelectOne,
    onEdit,
    onDelete,
    currentPage,
    onPageChange,
    pageSize,
    onPageSizeChange,
}: FacultyTableProps) => {
    const totalItems = faculties.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginatedFaculties = faculties.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Liste des facultés</CardTitle>
                        <CardDescription>
                            Gérez les facultés — regroupement de départements dans une structure LMD.
                        </CardDescription>
                    </div>
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Rechercher..."
                            className="pl-8"
                            value={searchQuery}
                            onChange={(e) => {
                                onSearchChange(e.target.value);
                                onPageChange(1);
                            }}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <TableSkeleton columns={5} rows={5} />
                ) : faculties.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <Landmark className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Aucune faculté trouvée.</p>
                        <p className="text-sm">Créez votre première faculté pour commencer.</p>
                    </div>
                ) : (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">
                                        <Checkbox
                                            checked={faculties.length > 0 && selectedIds.length === faculties.length}
                                            onCheckedChange={onToggleSelectAll}
                                            aria-label="Tout sélectionner"
                                        />
                                    </TableHead>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Nom de la Faculté</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedFaculties.map((faculty) => (
                                    <TableRow key={faculty.id}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedIds.includes(faculty.id)}
                                                onCheckedChange={() => onToggleSelectOne(faculty.id)}
                                                aria-label={`Sélectionner ${faculty.name}`}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono font-medium">{faculty.code || "—"}</TableCell>
                                        <TableCell className="font-medium">{faculty.name}</TableCell>
                                        <TableCell className="text-muted-foreground max-w-md truncate">
                                            {faculty.description || "—"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onEdit(faculty)}
                                                >
                                                    <Pencil className="w-4 h-4 text-muted-foreground hover:text-primary" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onDelete(faculty.id)}
                                                >
                                                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {/* Pagination Controls */}
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
                                    <ChevronLeft className="h-4 w-4 mr-1" />
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
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
};
