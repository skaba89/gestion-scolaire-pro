import {
    GraduationCap,
    Search,
    ArrowUp,
    ArrowDown,
    Edit,
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
import { Level } from "@/queries/levels";

interface LevelTableProps {
    levels: Level[];
    totalLevels: number;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onEdit: (level: Level) => void;
    onDelete: (id: string) => void;
    onMove: (level: Level, direction: "up" | "down") => void;
    isReordering: boolean;
    currentPage: number;
    onPageChange: (page: number) => void;
    pageSize: number;
    onPageSizeChange: (size: number) => void;
}

export const LevelTable = ({
    levels,
    totalLevels,
    searchTerm,
    onSearchChange,
    onEdit,
    onDelete,
    onMove,
    isReordering,
    currentPage,
    onPageChange,
    pageSize,
    onPageSizeChange,
}: LevelTableProps) => {
    const totalItems = levels.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginatedLevels = levels.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <GraduationCap className="w-5 h-5" />
                        Liste des niveaux
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
                {levels.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        Aucun niveau trouvé
                    </div>
                ) : (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-24">Ordre</TableHead>
                                    <TableHead>Nom</TableHead>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Libellé</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedLevels.map((level, index) => {
                                    const globalIndex = (currentPage - 1) * pageSize + index;
                                    return (
                                        <TableRow key={level.id}>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onMove(level, "up")}
                                                        disabled={globalIndex === 0 || isReordering}
                                                    >
                                                        <ArrowUp className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onMove(level, "down")}
                                                        disabled={globalIndex === totalLevels - 1 || isReordering}
                                                    >
                                                        <ArrowDown className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">{level.name}</TableCell>
                                            <TableCell>{level.code}</TableCell>
                                            <TableCell>{level.label}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" onClick={() => onEdit(level)}>
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onDelete(level.id)}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
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
