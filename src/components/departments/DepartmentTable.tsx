import {
    Building2,
    Search,
    Pencil,
    Trash2,
    BookOpen,
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
import { Badge } from "@/components/ui/badge";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { Department } from "@/queries/departments";

interface DepartmentTableProps {
    departments: Department[];
    programs: any[];
    isLoading: boolean;
    searchQuery: string;
    onSearchChange: (value: string) => void;
    selectedIds: string[];
    onToggleSelectAll: () => void;
    onToggleSelectOne: (id: string) => void;
    onEdit: (dept: Department) => void;
    onDelete: (id: string) => void;
    currentPage: number;
    onPageChange: (page: number) => void;
    pageSize: number;
    onPageSizeChange: (size: number) => void;
}

export const DepartmentTable = ({
    departments,
    programs,
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
}: DepartmentTableProps) => {
    const totalItems = departments.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginatedDepartments = departments.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Liste des départements</CardTitle>
                        <CardDescription>
                            Gérez les codes de départements pour la génération des numéros d'étudiants.
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
                    <TableSkeleton columns={6} rows={5} />
                ) : departments.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Aucun département trouvé.</p>
                        <p className="text-sm">Créez votre premier département pour commencer.</p>
                    </div>
                ) : (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">
                                        <Checkbox
                                            checked={departments.length > 0 && selectedIds.length === departments.length}
                                            onCheckedChange={onToggleSelectAll}
                                            aria-label="Tout sélectionner"
                                        />
                                    </TableHead>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Nom du Département</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Filières</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedDepartments.map((dept) => (
                                    <TableRow key={dept.id}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedIds.includes(dept.id)}
                                                onCheckedChange={() => onToggleSelectOne(dept.id)}
                                                aria-label={`Sélectionner ${dept.name}`}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono font-medium">{dept.code || "—"}</TableCell>
                                        <TableCell className="font-medium">{dept.name}</TableCell>
                                        <TableCell className="text-muted-foreground max-w-md truncate">
                                            {dept.description || "—"}
                                        </TableCell>
                                        <TableCell>
                                            {(() => {
                                                const deptPrograms = programs.filter(p => p.department_id === dept.id);
                                                if (deptPrograms.length === 0) return <span className="text-muted-foreground text-sm">Aucune</span>;

                                                return (
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <Button variant="outline" size="sm" className="h-7 text-xs">
                                                                <BookOpen className="w-3 h-3 mr-1" />
                                                                {deptPrograms.length} Filière{deptPrograms.length > 1 ? 's' : ''}
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-80 p-0" align="start">
                                                            <div className="p-3 border-b bg-muted/40">
                                                                <h4 className="font-semibold text-sm">Filières & Programmes</h4>
                                                                <p className="text-xs text-muted-foreground">{dept.name}</p>
                                                            </div>
                                                            <ScrollArea className="h-[200px]">
                                                                <div className="p-2 space-y-1">
                                                                    {deptPrograms.map((program) => (
                                                                        <div key={program.id} className="flex items-center justify-between p-2 hover:bg-muted rounded-md text-sm">
                                                                            <div className="grid gap-0.5">
                                                                                <span className="font-medium">{program.code}</span>
                                                                                <span className="text-xs text-muted-foreground line-clamp-1">{program.name}</span>
                                                                            </div>
                                                                            <Badge variant={program.degree === 'LICENCE' ? 'secondary' : 'default'} className="text-[10px]">
                                                                                {program.degree}
                                                                            </Badge>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </ScrollArea>
                                                        </PopoverContent>
                                                    </Popover>
                                                );
                                            })()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onEdit(dept)}
                                                >
                                                    <Pencil className="w-4 h-4 text-muted-foreground hover:text-primary" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onDelete(dept.id)}
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
