import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonStats } from "@/components/ui/skeleton-cards";
import { motion } from "framer-motion";

export const DashboardSkeleton = () => {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Welcome Header Skeleton */}
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96 opacity-60" />
            </div>

            {/* Stats Grid Skeleton */}
            <SkeletonStats count={4} />

            {/* Charts Section Skeleton */}
            <div className="grid lg:grid-cols-2 gap-6">
                <Card className="border-none shadow-sm overflow-hidden">
                    <CardHeader className="pb-2">
                        <Skeleton className="h-5 w-40" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-[250px] w-full rounded-xl" />
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm overflow-hidden">
                    <CardHeader className="pb-2">
                        <Skeleton className="h-5 w-48" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center h-[250px]">
                            <Skeleton className="h-40 w-40 rounded-full" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions Skeleton */}
            <div className="space-y-4">
                <Skeleton className="h-6 w-32" />
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="p-5 flex items-center gap-4 rounded-xl border bg-card/50">
                            <Skeleton className="w-12 h-12 rounded-xl" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
