import React, { useMemo, useState } from "react";
import { BadgeType, BadgeTemplate, UserBadgeWithDetails } from "@/lib/badges-types";
import { BadgeCard } from "./BadgeCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Sparkles, Filter, LayoutGrid, ListFilter, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface BadgeGridProps {
  badges: UserBadgeWithDetails[];
  filterType?: BadgeType | null;
  filterTemplate?: BadgeTemplate | null;
  sortBy?: "date" | "rarity" | "name";
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
  showFilters?: boolean;
  onBadgeShare?: (badgeId: string) => void;
}

type SortOption = "date" | "rarity" | "name";
type FilterTypeOption = "all" | BadgeType;

const RARITY_ORDER = {
  legendary: 5,
  epic: 4,
  rare: 3,
  uncommon: 2,
  common: 1,
};

export const BadgeGrid: React.FC<BadgeGridProps> = ({
  badges,
  filterType,
  filterTemplate,
  sortBy = "date",
  isLoading = false,
  emptyState,
  className,
  showFilters = true,
  onBadgeShare,
}) => {
  const [localFilterType, setLocalFilterType] = useState<FilterTypeOption>(
    filterType || "all"
  );
  const [localSortBy, setLocalSortBy] = useState<SortOption>(sortBy);
  const [viewMode, setViewMode] = useState<"all" | "recent" | "rarest">("all");

  const filtered = useMemo(() => {
    let result = [...badges];

    if (localFilterType !== "all") {
      result = result.filter((b) => b.badge?.badge_type === localFilterType);
    }

    if (filterTemplate) {
      result = result.filter((b) => b.badge?.badge_template === filterTemplate);
    }

    if (viewMode === "recent") {
      result = result.sort(
        (a, b) =>
          new Date(b.earned_date).getTime() -
          new Date(a.earned_date).getTime()
      );
      result = result.slice(0, 8);
    } else if (viewMode === "rarest") {
      result = result.sort(
        (a, b) =>
          (RARITY_ORDER[b.badge?.rarity as any] || 0) -
          (RARITY_ORDER[a.badge?.rarity as any] || 0)
      );
      result = result.slice(0, 8);
    }

    if (localSortBy === "date") {
      result.sort(
        (a, b) =>
          new Date(b.earned_date).getTime() -
          new Date(a.earned_date).getTime()
      );
    } else if (localSortBy === "rarity") {
      result.sort(
        (a, b) =>
          (RARITY_ORDER[b.badge?.rarity as any] || 0) -
          (RARITY_ORDER[a.badge?.rarity as any] || 0)
      );
    } else if (localSortBy === "name") {
      result.sort((a, b) => (a.badge?.name || "").localeCompare(b.badge?.name || ""));
    }

    return result;
  }, [badges, localFilterType, filterTemplate, localSortBy, viewMode]);

  const stats = {
    total: badges.length,
    byType: badges.reduce(
      (acc, b) => {
        const type = b.badge?.badge_type;
        if (type) {
          acc[type] = (acc[type] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    ),
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <motion.div
          animate={{ rotate: 360, scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="p-4 rounded-3xl bg-primary/10"
        >
          <Sparkles className="text-primary h-8 w-8" />
        </motion.div>
        <p className="text-sm font-bold text-muted-foreground animate-pulse">Chargement de votre collection...</p>
      </div>
    );
  }

  if (badges.length === 0) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        {emptyState || (
          <div className="text-center p-12 glass-card rounded-[3rem] border-primary/5 max-w-md">
            <AlertCircle className="mx-auto mb-4 text-primary/20" size={64} />
            <h3 className="font-black text-xl mb-2">Aucun insigne pour le moment</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Le chemin vers l'excellence commence par un premier pas. Continuez vos efforts pour débloquer des récompenses uniques !
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-8", className)}>
      {/* Stats Summary Glass */}
      <div className="glass-card border-none shadow-premium rounded-[2rem] p-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 group-hover:bg-primary/10 transition-colors" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
          <div className="text-center md:text-left">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Palmarès Total</p>
            <div className="flex items-center gap-3">
              <span className="text-5xl font-black tracking-tighter text-primary">{stats.total}</span>
              <span className="text-xl font-bold text-muted-foreground">Apprentissages Gravés</span>
            </div>
          </div>

          <div className="flex gap-4 flex-wrap justify-center">
            {Object.entries(stats.byType).map(([type, count]) => (
              <motion.div
                whileHover={{ scale: 1.05 }}
                key={type}
                className="text-center px-6 py-3 rounded-2xl bg-background/40 border border-primary/5 shadow-sm"
              >
                <p className="text-[10px] font-black uppercase text-muted-foreground leading-none mb-1">
                  {type.substring(0, 3)}
                </p>
                <p className="text-2xl font-black text-foreground">{count}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Control Center */}
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
        {showFilters && (
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-full md:w-auto">
            <TabsList className="bg-muted/50 backdrop-blur-md p-1 rounded-2xl border border-primary/5 grid grid-cols-3 shadow-sm h-12">
              <TabsTrigger value="all" className="rounded-xl font-bold data-[state=active]:bg-background data-[state=active]:text-primary transition-all px-6">
                Tous
              </TabsTrigger>
              <TabsTrigger value="recent" className="rounded-xl font-bold data-[state=active]:bg-background data-[state=active]:text-primary transition-all px-6">
                Récents {filtered.length > 0 && `(${filtered.length})`}
              </TabsTrigger>
              <TabsTrigger value="rarest" className="rounded-xl font-bold data-[state=active]:bg-background data-[state=active]:text-primary transition-all px-6">
                Rares
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {showFilters && (
          <div className="flex gap-3 flex-wrap items-center">
            <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-2xl border border-primary/5 shadow-sm">
              <Select value={localFilterType} onValueChange={setLocalFilterType}>
                <SelectTrigger className="w-40 h-9 border-none bg-transparent focus:ring-0 font-bold text-xs ring-0">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3 w-3 opacity-50" />
                    <SelectValue placeholder="Catégorie" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="all">Toutes Catégories</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="achievement">Succès</SelectItem>
                  <SelectItem value="certification">Certification</SelectItem>
                  <SelectItem value="attendance">Assiduité</SelectItem>
                  <SelectItem value="participation">Participation</SelectItem>
                </SelectContent>
              </Select>

              <div className="w-[1px] h-4 bg-primary/10 mx-1" />

              <Select value={localSortBy} onValueChange={(v) => setLocalSortBy(v as any)}>
                <SelectTrigger className="w-40 h-9 border-none bg-transparent focus:ring-0 font-bold text-xs ring-0">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-3 w-3 opacity-50" />
                    <SelectValue placeholder="Trier par" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="date">Obtention Récente</SelectItem>
                  <SelectItem value="rarity">Plus Rares d'abord</SelectItem>
                  <SelectItem value="name">Ordre Alphabétique</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(localFilterType !== "all" || localSortBy !== "date") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLocalFilterType("all");
                  setLocalSortBy("date");
                }}
                className="rounded-xl hover:bg-primary/10 text-primary font-bold gap-2 h-10 px-4 transition-all"
              >
                <RotateCcw className="h-4 w-4" />
                Réinitialiser
              </Button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20 bg-muted/10 rounded-[3rem] border border-dashed border-primary/10"
          >
            <AlertCircle className="mx-auto mb-4 text-muted-foreground opacity-20" size={48} />
            <p className="text-sm font-bold text-muted-foreground">Aucun badge ne correspond à vos filtres actuels.</p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/60">
                Affichage de {filtered.length} sur {badges.length} insignes
              </p>
              <div className="h-[1px] flex-1 mx-6 bg-gradient-to-r from-primary/5 via-primary/20 to-primary/5" />
            </div>

            <motion.div
              layout
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {filtered.map((userBadge, index) => (
                <motion.div
                  key={userBadge.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <BadgeCard
                    badge={userBadge.badge!}
                    userBadge={userBadge}
                    isNew={
                      new Date(userBadge.earned_date).getTime() >
                      Date.now() - 7 * 24 * 60 * 60 * 1000
                    }
                    onShare={() => onBadgeShare?.(userBadge.id)}
                  />
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BadgeGrid;
