import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

export const SkeletonCard = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="rounded-lg border bg-card p-6 space-y-4"
  >
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
  </motion.div>
);

export const SkeletonTable = ({ rows = 5 }: { rows?: number }) => (
  <div className="rounded-lg border bg-card overflow-hidden">
    <div className="p-4 border-b bg-muted/30">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-24 ml-auto" />
      </div>
    </div>
    <div className="divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="p-4 flex items-center gap-4"
        >
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-8 w-8 rounded" />
        </motion.div>
      ))}
    </div>
  </div>
);

export const SkeletonStats = ({ count = 4 }: { count?: number }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: i * 0.1 }}
        className="rounded-lg border bg-card p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-24" />
      </motion.div>
    ))}
  </div>
);

export const SkeletonList = ({ items = 5 }: { items?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: items }).map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.08 }}
        className="rounded-lg border bg-card p-4 flex items-center gap-4"
      >
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </motion.div>
    ))}
  </div>
);
