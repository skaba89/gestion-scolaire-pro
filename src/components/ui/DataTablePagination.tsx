import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    if (totalCount === 0) return null;

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="hidden sm:inline">{t("pagination.show")}</span>
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
                <span className="hidden sm:inline">{t("pagination.perPage")}</span>
                <span className="ml-2 sm:ml-4">
                    {t("pagination.range", { from: (currentPage - 1) * pageSize + 1, to: Math.min(currentPage * pageSize, totalCount), total: totalCount })}
                </span>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0 lg:flex"
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                >
                    <span className="sr-only">{t("pagination.first")}</span>
                    <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                >
                    <span className="sr-only">{t("pagination.previous")}</span>
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="text-sm font-medium min-w-[80px] text-center">
                    {t("pagination.pageOf", { page: currentPage, total: totalPages })}
                </div>

                <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                >
                    <span className="sr-only">{t("pagination.next")}</span>
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0 lg:flex"
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages}
                >
                    <span className="sr-only">{t("pagination.last")}</span>
                    <ChevronsRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
};
