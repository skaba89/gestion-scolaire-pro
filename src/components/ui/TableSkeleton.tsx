import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TableSkeletonProps {
    columns: number;
    rows?: number;
    showHeader?: boolean;
}

export function TableSkeleton({ columns, rows = 5, showHeader = true }: TableSkeletonProps) {
    return (
        <div className="rounded-md border bg-card animate-pulse">
            <Table>
                {showHeader && (
                    <TableHeader>
                        <TableRow>
                            {Array.from({ length: columns }).map((_, i) => (
                                <TableHead key={i}>
                                    <Skeleton className="h-4 w-[100px] opacity-70" />
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                )}
                <TableBody>
                    {Array.from({ length: rows }).map((_, i) => (
                        <TableRow key={i}>
                            {Array.from({ length: columns }).map((_, j) => (
                                <TableCell key={j}>
                                    <Skeleton className="h-4 w-full max-w-[150px]" />
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
