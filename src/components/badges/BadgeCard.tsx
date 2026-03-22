import React, { useState } from "react";
import { BadgeDefinition, UserBadge } from "@/lib/badges-types";
import { BadgeDisplay } from "./BadgeDisplay";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Share2, Check, Lock, Sparkles, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface BadgeCardProps {
  badge: BadgeDefinition;
  userBadge?: UserBadge;
  isNew?: boolean;
  onShare?: () => void;
  onLearnMore?: () => void;
  className?: string;
}

export const BadgeCard: React.FC<BadgeCardProps> = ({
  badge,
  userBadge,
  isNew = false,
  onShare,
  onLearnMore,
  className,
}) => {
  const [shared, setShared] = useState(userBadge?.shared || false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    try {
      const text = `J'ai débloqué le badge "${badge.name}" ! 🏆 ${badge.description}`;
      if (navigator.share) {
        await navigator.share({
          title: `Badge: ${badge.name}`,
          text,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      setShared(true);
      onShare?.();
    } catch (error) {
      console.error("Error sharing badge:", error);
    }
  };

  const isUnlocked = !!userBadge;
  const isLockedState = !isUnlocked;

  return (
    <TooltipProvider>
      <motion.div
        layout
        whileHover={{ y: -5 }}
        className={cn(
          "relative group rounded-[2.5rem] border-none overflow-hidden transition-all duration-500",
          isLockedState
            ? "bg-slate-100/50 backdrop-blur-sm border border-slate-200"
            : "glass-card shadow-premium hover:shadow-2xl border border-primary/5",
          isNew && "ring-2 ring-amber-400 ring-offset-2",
          className
        )}
      >
        {/* Glow Effects */}
        {!isLockedState && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        )}

        {/* New badge indicator */}
        <AnimatePresence>
          {isNew && (
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              className="absolute -top-1 -right-1 z-20"
            >
              <div className="bg-amber-400 text-amber-950 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-lg flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Nouveau
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Locked Overlay */}
        {isLockedState && (
          <div className="absolute inset-0 z-10 bg-slate-200/20 backdrop-blur-[2px] rounded-[2.5rem] flex flex-col items-center justify-center transition-all group-hover:backdrop-blur-0">
            <div className="p-3 rounded-full bg-slate-400/20 text-slate-500 mb-2 transition-transform group-hover:scale-110">
              <Lock className="h-6 w-6" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Verrouillé</p>
          </div>
        )}

        <div className="p-6 flex flex-col items-center text-center h-full relative z-0">
          {/* Badge Visual Section */}
          <div className={cn(
            "mb-6 transition-all duration-700 relative",
            isLockedState ? "opacity-30 grayscale blur-[1px] group-hover:blur-0 group-hover:grayscale-0 group-hover:opacity-50" : "scale-110 group-hover:scale-125"
          )}>
            {!isLockedState && (
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
            )}
            <BadgeDisplay badge={badge} size="lg" />
          </div>

          {/* Info Section */}
          <div className="space-y-3 flex-1">
            <h3 className="font-black text-lg tracking-tight leading-tight group-hover:text-primary transition-colors">
              {badge.name}
            </h3>

            <Badge className={cn(
              "rounded-full px-3 py-0.5 text-[9px] font-black tracking-widest uppercase shadow-sm border-none",
              badge.rarity === "legendary" ? "bg-amber-500 text-white" :
                badge.rarity === "epic" ? "bg-purple-600 text-white" :
                  badge.rarity === "rare" ? "bg-blue-600 text-white" :
                    badge.rarity === "uncommon" ? "bg-emerald-600 text-white" : "bg-slate-500 text-white"
            )}>
              {badge.rarity}
            </Badge>

            <p className="text-xs text-muted-foreground leading-relaxed font-medium px-2">
              {badge.description}
            </p>

            {isUnlocked && userBadge?.earned_date && (
              <div className="flex items-center justify-center gap-1.5 pt-2 text-[10px] font-bold text-muted-foreground/60">
                <TrendingUp className="h-3 w-3" />
                Obtenu le {format(new Date(userBadge.earned_date), "dd/MM/yyyy", { locale: fr })}
              </div>
            )}
          </div>

          {/* Action Footer */}
          {!isLockedState && (
            <div className="w-full flex gap-2 mt-6 pt-4 border-t border-primary/5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleShare}
                className="flex-1 rounded-xl hover:bg-primary/10 hover:text-primary transition-all group/btn"
              >
                {copied || shared ? (
                  <div className="flex items-center gap-1">
                    <Check size={14} className="text-emerald-500" />
                    <span className="text-[11px] font-bold">Partagé</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Share2 size={14} className="group-hover/btn:rotate-12 transition-transform" />
                    <span className="text-[11px] font-bold">Partager</span>
                  </div>
                )}
              </Button>

              {onLearnMore && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLearnMore}
                  className="h-9 px-3 rounded-xl hover:bg-secondary/50 transition-all"
                >
                  <Info size={16} />
                </Button>
              )}
            </div>
          )}

          {isLockedState && (
            <div className="mt-6 pt-4 border-t border-slate-200/50 w-full">
              <div className="flex items-center justify-center gap-2 text-rose-500/50 font-black text-[10px] uppercase tracking-tighter">
                <Sparkles className="h-3 w-3" />
                Bientôt le vôtre ?
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </TooltipProvider>
  );
};

export default BadgeCard;
