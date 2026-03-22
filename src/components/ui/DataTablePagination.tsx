import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface DataTablePaginationProps {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    pageSizeOptions?: number[];
}

export const DataTablePagination = ({
    currentPage,
    pageSize,
    totalCount,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 50, 100]
}: DataTablePaginationProps) => {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    if (totalCount === 0) return null;

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="hidden sm:inline">Afficher</span>
                <Select
                    value={pageSize.toString()}
                    onValueChange={(v) => {
                        onPageSizeChange(parseInt(v));
                        onPageChange(1); // Reset to first page on size change
                    }}
                >
                    <SelectTrigger className="h-8 w-[70px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {pageSizeOptions.map(size => (
                            <SelectItem key={size} value={size.toString()}>
                                {size}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <span className="hidden sm:inline">par page</span>
                <span className="ml-2 sm:ml-4">
                    {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} sur {totalCount}
                </span>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0 lg:flex"
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                >
                    <span className="sr-only">Première page</span>
                    <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                >
                    <span className="sr-only">Précédent</span>
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="text-sm font-medium min-w-[80px] text-center">
                    Page {currentPage} / {totalPages}
                </div>

                <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                >
                    <span className="sr-only">Suivant</span>
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0 lg:flex"
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages}
                >
                    <span className="sr-only">Dernière page</span>
                    <ChevronsRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
};
