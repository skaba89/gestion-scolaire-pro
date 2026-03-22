import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trophy, Star, Medal, Award, Zap, Target, BookOpen, Clock, Heart, Trash2, Edit, Sparkles, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const ICONS = [
  { value: "trophy", icon: Trophy, label: "Trophée" },
  { value: "star", icon: Star, label: "Étoile" },
  { value: "medal", icon: Medal, label: "Médaille" },
  { value: "award", icon: Award, label: "Prix" },
  { value: "zap", icon: Zap, label: "Éclair" },
  { value: "target", icon: Target, label: "Cible" },
  { value: "book", icon: BookOpen, label: "Livre" },
  { value: "clock", icon: Clock, label: "Horloge" },
  { value: "heart", icon: Heart, label: "Cœur" },
];

const RARITIES = [
  { value: "common", label: "Commun", color: "bg-slate-500", shadow: "shadow-slate-500/20" },
  { value: "rare", label: "Rare", color: "bg-blue-500", shadow: "shadow-blue-500/20" },
  { value: "epic", label: "Épique", color: "bg-purple-500", shadow: "shadow-purple-500/20" },
  { value: "legendary", label: "Légendaire", color: "bg-amber-500", shadow: "shadow-amber-500/20" },
];

const CATEGORIES = [
  { value: "academic", label: "Académique" },
  { value: "attendance", label: "Assiduité" },
  { value: "social", label: "Social" },
  { value: "special", label: "Spécial" },
];

const REQUIREMENT_TYPES = [
  { value: "points_total", label: "Total de points" },
  { value: "grades_avg", label: "Moyenne des notes" },
  { value: "attendance_rate", label: "Taux de présence" },
  { value: "homework_count", label: "Devoirs rendus" },
  { value: "manual", label: "Attribution manuelle" },
];

const getIconComponent = (iconName: string) => {
  const iconConfig = ICONS.find(i => i.value === iconName);
  return iconConfig?.icon || Trophy;
};

export const AchievementsList = () => {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "trophy",
    color: "#FFD700",
    category: "academic",
    requirement_type: "manual",
    requirement_value: 0,
    points_reward: 50,
    rarity: "common"
  });

  // Fetch achievements
  const { data: achievements, isLoading } = useQuery({
    queryKey: ["achievements", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from("achievement_definitions")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id
  });

  // Fetch earned achievements count per definition
  const { data: earnedCounts } = useQuery({
    queryKey: ["achievements-earned-counts", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return {};
      const { data } = await supabase
        .from("student_achievements")
        .select("achievement_id")
        .eq("tenant_id", tenant.id);

      const counts: Record<string, number> = {};
      data?.forEach(a => {
        counts[a.achievement_id] = (counts[a.achievement_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!tenant?.id
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!tenant?.id) throw new Error("No tenant");

      if (editingAchievement) {
        const { error } = await supabase
          .from("achievement_definitions")
          .update(data)
          .eq("id", editingAchievement.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("achievement_definitions")
          .insert({ ...data, tenant_id: tenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["achievements"] });
      toast.success(editingAchievement ? t("common.updated", "Mis à jour") : t("common.created", "Badge créé"));
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(t("common.error", "Erreur") + ": " + error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("achievement_definitions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["achievements"] });
      toast.success(t("common.deleted", "Renvoyé au néant"));
    },
    onError: (error) => {
      toast.error(t("common.error", "Erreur") + ": " + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      icon: "trophy",
      color: "#FFD700",
      category: "academic",
      requirement_type: "manual",
      requirement_value: 0,
      points_reward: 50,
      rarity: "common"
    });
    setEditingAchievement(null);
  };

  const handleEdit = (achievement: any) => {
    setEditingAchievement(achievement);
    setFormData({
      name: achievement.name,
      description: achievement.description || "",
      icon: achievement.icon,
      color: achievement.color,
      category: achievement.category,
      requirement_type: achievement.requirement_type,
      requirement_value: achievement.requirement_value || 0,
      points_reward: achievement.points_reward,
      rarity: achievement.rarity
    });
    setIsDialogOpen(true);
  };

  const getRarityConfig = (rarity: string) => {
    return RARITIES.find(r => r.value === rarity) || RARITIES[0];
  };

  return (
    <Card className="glass-card border-none shadow-premium relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />

      <CardHeader className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-500" />
            {t("gamification.achievements", "Bibliothèque des Badges")}
          </CardTitle>
          <CardDescription>
            {t("gamification.achievementsDescription", "Configurez les récompenses et les critères d'obtention")}
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="rounded-xl shadow-premium group">
              <Plus className="h-4 w-4 mr-2 transition-transform group-hover:rotate-90" />
              {t("gamification.addAchievement", "Créer un Badge")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl glass-card border-primary/10 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                {editingAchievement ? <Edit className="h-6 w-6 text-primary" /> : <Plus className="h-6 w-6 text-primary" />}
                {editingAchievement
                  ? t("gamification.editAchievement", "Édition du Badge")
                  : t("gamification.addAchievement", "Nouveau Badge")}
              </DialogTitle>
              <DialogDescription>
                Créez une récompense mémorable pour vos étudiants.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">{t("common.name", "Nom du badge")}</Label>
                  <Input
                    className="rounded-xl border-primary/10 focus:ring-primary/20"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Visionnaire"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">{t("gamification.pointsReward", "Récompense (Points)")}</Label>
                  <div className="relative">
                    <Star className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500" />
                    <Input
                      type="number"
                      className="pl-9 rounded-xl border-primary/10"
                      value={formData.points_reward}
                      onChange={(e) => setFormData({ ...formData, points_reward: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">{t("common.description", "Description")}</Label>
                <Textarea
                  className="rounded-xl border-primary/10 min-h-[100px]"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Décrivez l'exploit à accomplir..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">{t("gamification.icon", "Icône")}</Label>
                  <Select value={formData.icon} onValueChange={(v) => setFormData({ ...formData, icon: v })}>
                    <SelectTrigger className="rounded-xl border-primary/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {ICONS.map((icon) => {
                        const IconComp = icon.icon;
                        return (
                          <SelectItem key={icon.value} value={icon.value}>
                            <div className="flex items-center gap-2">
                              <IconComp className="h-4 w-4" />
                              {icon.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">{t("gamification.rarity", "Rareté")}</Label>
                  <Select value={formData.rarity} onValueChange={(v) => setFormData({ ...formData, rarity: v })}>
                    <SelectTrigger className="rounded-xl border-primary/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {RARITIES.map((rarity) => (
                        <SelectItem key={rarity.value} value={rarity.value}>
                          <div className="flex items-center gap-2">
                            <div className={cn("w-3 h-3 rounded-full", rarity.color)} />
                            {rarity.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">{t("gamification.category", "Catégorie")}</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger className="rounded-xl border-primary/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-muted/50 border border-primary/5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-primary">
                  <Filter className="h-4 w-4" />
                  Conditions de déblocage
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">{t("gamification.requirementType", "Règles")}</Label>
                    <Select
                      value={formData.requirement_type}
                      onValueChange={(v) => setFormData({ ...formData, requirement_type: v })}
                    >
                      <SelectTrigger className="rounded-xl border-white/20 bg-background/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {REQUIREMENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.requirement_type !== "manual" && (
                    <div className="space-y-2">
                      <Label className="text-xs">{t("gamification.requirementValue", "Seuil à atteindre")}</Label>
                      <Input
                        type="number"
                        className="rounded-xl border-white/20 bg-background/50"
                        value={formData.requirement_value}
                        onChange={(e) => setFormData({ ...formData, requirement_value: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">{t("gamification.color", "Teinte visuelle")}</Label>
                <div className="flex gap-4 items-center">
                  <Input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-16 h-12 p-1 border-primary/10 rounded-xl cursor-pointer"
                  />
                  <div className="flex-1 px-4 py-2 bg-muted/30 rounded-xl border border-primary/5 font-mono text-sm">
                    {formData.color.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl">
                {t("common.cancel", "Annuler")}
              </Button>
              <Button
                onClick={() => saveMutation.mutate(formData)}
                disabled={!formData.name || saveMutation.isPending}
                className="rounded-xl px-8 shadow-premium"
              >
                {saveMutation.isPending ? t("common.saving", "Magie en cours...") : t("common.save", "Enregistrer le Badge")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="relative z-10">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-3xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : achievements?.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-3xl border border-dashed border-primary/10">
            <Award className="h-16 w-16 mx-auto mb-4 opacity-10" />
            <p className="text-lg font-medium">{t("gamification.noAchievements", "Le coffre est vide")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("gamification.createFirstAchievement", "Créez votre premier badge pour récompenser vos talents")}</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {achievements?.map((achievement, index) => {
                const IconComp = getIconComponent(achievement.icon);
                const rarityConfig = getRarityConfig(achievement.rarity);
                const earnedCount = earnedCounts?.[achievement.id] || 0;

                return (
                  <motion.div
                    layout
                    key={achievement.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative p-6 rounded-3xl bg-background/40 border-primary/10 border backdrop-blur-sm hover:bg-background/60 hover:shadow-premium transition-all duration-300"
                  >
                    <div
                      className={cn("absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none blur-xl")}
                      style={{ backgroundColor: achievement.color }}
                    />

                    <div className="flex justify-between items-start mb-4">
                      <div
                        className="p-4 rounded-2xl shadow-premium relative z-10 transition-transform group-hover:scale-110 duration-300"
                        style={{ backgroundColor: achievement.color + "20" }}
                      >
                        <IconComp className="h-8 w-8" style={{ color: achievement.color }} />
                      </div>
                      <Badge className={cn("rounded-full px-3 py-1 font-bold text-[10px] tracking-widest uppercase", rarityConfig.color, rarityConfig.shadow)}>
                        {rarityConfig.label}
                      </Badge>
                    </div>

                    <div className="space-y-2 mb-6">
                      <h3 className="text-lg font-bold tracking-tight group-hover:text-primary transition-colors">{achievement.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed h-10">
                        {achievement.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-primary/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">Récompense</span>
                        <span className="flex items-center gap-1.5 text-amber-500 font-black">
                          <Star className="h-3.5 w-3.5 fill-amber-500" />
                          +{achievement.points_reward}
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">Détenteurs</span>
                        <span className="font-bold text-sm">{earnedCount}</span>
                      </div>
                    </div>

                    <div className="absolute bottom-4 left-6 right-6 flex justify-center gap-1 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 z-20">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEdit(achievement)}
                        className="h-8 rounded-full bg-background/80 backdrop-blur-sm border shadow-sm"
                      >
                        <Edit className="h-3 w-3 mr-1.5" />
                        Modifier
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => deleteMutation.mutate(achievement.id)}
                        className="h-8 w-8 rounded-full shadow-sm"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
