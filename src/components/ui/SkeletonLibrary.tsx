import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Composant de base pour les transitions de skeleton
 */
const SkeletonTransition = ({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) => (
    <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay }}
        className={className}
    >
        {children}
    </motion.div>
);

/**
 * Skeleton pour une carte standard
 */
export const CardSkeleton = () => (
    <SkeletonTransition className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center space-x-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
            </div>
        </div>
        <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
        </div>
    </SkeletonTransition>
);

/**
 * Skeleton pour un tableau avec en-tête
 */
export const TableSkeleton = ({ columns = 5, rows = 5 }: { columns?: number, rows?: number }) => (
    <div className="rounded-lg border bg-card overflow-hidden">
        <div className="p-4 border-b bg-muted/30">
            <div className="flex items-center gap-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-8 w-24 ml-auto" />
            </div>
        </div>
        <Table>
            <TableHeader>
                <TableRow>
                    {Array.from({ length: columns }).map((_, i) => (
                        <TableHead key={i}>
                            <Skeleton className="h-4 w-[100px]" />
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {Array.from({ length: rows }).map((_, i) => (
                    <TableRow key={i}>
                        {Array.from({ length: columns }).map((_, j) => (
                            <TableCell key={j}>
                                <SkeletonTransition delay={i * 0.05}>
                                    <Skeleton className="h-4 w-full max-w-[150px]" />
                                </SkeletonTransition>
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
);

/**
 * Skeleton pour les statistiques (Dashboard)
 */
export const StatsSkeleton = ({ count = 4 }: { count?: number }) => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: count }).map((_, i) => (
            <SkeletonTransition key={i} delay={i * 0.1} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-8 rounded" />
                </div>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-24" />
            </SkeletonTransition>
        ))}
    </div>
);

/**
 * Skeleton pour une liste d'items (ex: messages ou activités)
 */
export const ListSkeleton = ({ items = 5 }: { items?: number }) => (
    <div className="space-y-3">
        {Array.from({ length: items }).map((_, i) => (
            <SkeletonTransition key={i} delay={i * 0.08} className="rounded-lg border bg-card p-4 flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
            </SkeletonTransition>
        ))}
    </div>
);

/**
 * Dashboard complet de chargement
 */
export const DashboardSkeleton = () => (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96" />
            </div>
            <Skeleton className="h-10 w-32" />
        </div>

        <StatsSkeleton />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
                <TableSkeleton columns={4} rows={6} />
            </div>
            <div className="space-y-6">
                <CardSkeleton />
                <ListSkeleton items={3} />
            </div>
        </div>
    </div>
);
