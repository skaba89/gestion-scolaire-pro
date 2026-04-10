import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Star, Gift, History, Search, Award, Minus, Sparkles, UserPlus, TrendingUp, Clock, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { resolveUploadUrl } from "@/utils/url";

export const PointsManager = () => {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [isAwardDialogOpen, setIsAwardDialogOpen] = useState(false);
  const [isBadgeDialogOpen, setIsBadgeDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [pointsForm, setPointsForm] = useState({
    points: 10,
    reason: "",
    isNegative: false
  });
  const [selectedAchievement, setSelectedAchievement] = useState<string>("");

  // Fetch students
  const { data: students } = useQuery({
    queryKey: ["students-gamification", tenant?.id, searchQuery],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const params: Record<string, string> = {
        tenant_id: tenant.id,
        is_archived: false,
        ordering: "last_name",
        limit: "20",
      };
      if (searchQuery) {
        params.search = searchQuery;
      }

      const { data } = await apiClient.get<any[]>("/students/", { params });
      return data || [];
    },
    enabled: !!tenant?.id
  });

  // Fetch achievements for badge assignment
  const { data: achievements } = useQuery({
    queryKey: ["achievements-for-award", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get<any[]>("/achievement-definitions/", {
        params: { tenant_id: tenant.id, is_active: true, requirement_type: "manual", ordering: "name" },
      });
      return data || [];
    },
    enabled: !!tenant?.id
  });

  // Fetch recent transactions
  const { data: recentTransactions } = useQuery({
    queryKey: ["recent-transactions", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get<any[]>("/point-transactions/", {
        params: { tenant_id: tenant.id, ordering: "-created_at", limit: "50" },
      });
      return data || [];
    },
    enabled: !!tenant?.id
  });

  // Award points mutation
  const awardPointsMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id || !selectedStudent || !profile?.id) throw new Error("Missing data");

      const finalPoints = pointsForm.isNegative ? -Math.abs(pointsForm.points) : Math.abs(pointsForm.points);

      await apiClient.post("/point-transactions/", {
        tenant_id: tenant.id,
        student_id: selectedStudent.id,
        points: finalPoints,
        reason: pointsForm.reason,
        reference_type: "manual",
        awarded_by: profile.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["gamification-stats"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success(
        pointsForm.isNegative
          ? t("gamification.pointsDeducted", "Points retirés")
          : t("gamification.pointsAwarded", "Points attribués")
      );
      setIsAwardDialogOpen(false);
      setSelectedStudent(null);
      setPointsForm({ points: 10, reason: "", isNegative: false });
    },
    onError: (error) => {
      toast.error(t("common.error", "Erreur") + ": " + error.message);
    }
  });

  // Award badge mutation
  const awardBadgeMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id || !selectedStudent || !selectedAchievement || !profile?.id)
        throw new Error("Missing data");

      // Check if already earned
      const { data: existing } = await apiClient.get<any[]>("/student-achievements/", {
        params: { student_id: selectedStudent.id, achievement_id: selectedAchievement },
      });

      if (existing && existing.length > 0) {
        throw new Error(t("gamification.alreadyEarned", "L'étudiant possède déjà ce badge"));
      }

      await apiClient.post("/student-achievements/", {
        tenant_id: tenant.id,
        student_id: selectedStudent.id,
        achievement_id: selectedAchievement,
        awarded_by: profile.id
      });

      const achievement = achievements?.find(a => a.id === selectedAchievement);
      if (achievement?.points_reward) {
        await apiClient.post("/point-transactions/", {
          tenant_id: tenant.id,
          student_id: selectedStudent.id,
          points: achievement.points_reward,
          reason: `Badge obtenu: ${achievement.name}`,
          reference_type: "achievement",
          reference_id: selectedAchievement,
          awarded_by: profile.id
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["gamification-stats"] });
      queryClient.invalidateQueries({ queryKey: ["achievements-earned-counts"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success(t("gamification.badgeAwarded", "Badge attribué avec succès"));
      setIsBadgeDialogOpen(false);
      setSelectedStudent(null);
      setSelectedAchievement("");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const getClassroomName = (student: any) => {
    const enrollment = student.enrollments?.[0];
    return enrollment?.classrooms?.name || "-";
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass-card border-none shadow-premium relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-amber-500/10 transition-colors" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              <div className="p-2 rounded-xl bg-amber-500/10">
                <Sparkles className="h-5 w-5 text-amber-500" />
              </div>
              {t("gamification.awardPoints", "Distribution de Points")}
            </CardTitle>
            <CardDescription>
              {t("gamification.awardPointsDescription", "Récompensez les efforts quotidiens des étudiants")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("gamification.searchStudent", "Qui souhaitez-vous récompenser ?")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 rounded-xl border-primary/10 bg-background/50 focus:bg-background transition-all"
                />
              </div>

              <AnimatePresence>
                {searchQuery && students && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="max-h-60 overflow-y-auto rounded-2xl border border-primary/5 bg-background/30 backdrop-blur-md divide-y divide-primary/5 shadow-premium"
                  >
                    {students.length > 0 ? students.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-3 p-4 hover:bg-primary/5 cursor-pointer transition-all group/item"
                        onClick={() => {
                          setSelectedStudent(student);
                          setIsAwardDialogOpen(true);
                          setSearchQuery("");
                        }}
                      >
                        <Avatar className="h-10 w-10 border border-primary/10 shadow-sm">
                          <AvatarImage src={resolveUploadUrl(student.photo_url) || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-bold">{student.first_name?.[0]}{student.last_name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-bold group-hover/item:text-primary transition-colors">{student.first_name} {student.last_name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {getClassroomName(student)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover/item:text-primary group-hover/item:translate-x-1 transition-all" />
                      </div>
                    )) : (
                      <div className="p-8 text-center text-muted-foreground italic text-sm">
                        Aucun étudiant trouvé...
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-premium relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-purple-500/10 transition-colors" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              <div className="p-2 rounded-xl bg-purple-500/10">
                <Award className="h-5 w-5 text-purple-500" />
              </div>
              {t("gamification.awardBadge", "Cérémonie des Badges")}
            </CardTitle>
            <CardDescription>
              {t("gamification.awardBadgeDescription", "Décernez un titre honorifique pour un exploit spécial")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("gamification.searchStudentBadge", "Rechercher un lauréat...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 rounded-xl border-primary/10 bg-background/50 focus:bg-background transition-all"
                />
              </div>

              {/* Le même menu déroulant pour les deux car ils partagent le searchQuery state, 
                  mais on peut imaginer un state séparé pour plus de clarté si besoin */}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-none shadow-premium overflow-hidden">
        <CardHeader className="bg-muted/30 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <History className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Historique des Flux</CardTitle>
              <CardDescription>Suivi en temps réel des interactions gamifiées</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow className="hover:bg-transparent border-primary/5">
                <TableHead className="font-bold text-xs uppercase tracking-wider pl-6">Étudiant</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider">Impact</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider">Source / Raison</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider">Auteur</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider pr-6">Instant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {recentTransactions?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-20 italic">
                      {t("gamification.noTransactions", "Aucune activité enregistrée")}
                    </TableCell>
                  </TableRow>
                ) : (
                  recentTransactions?.map((transaction, index) => {
                    const student = transaction.students as any;
                    const awardedBy = transaction.profiles as any;
                    const isPositive = transaction.points >= 0;

                    return (
                      <motion.tr
                        key={transaction.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="hover:bg-primary/5 transition-colors border-primary/5 group"
                      >
                        <TableCell className="pl-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border-2 border-background shadow-sm transition-transform group-hover:scale-110">
                              <AvatarImage src={resolveUploadUrl(student?.photo_url) || undefined} />
                              <AvatarFallback className="bg-muted text-xs font-bold">
                                {student?.first_name?.[0]}{student?.last_name?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-bold">
                              {student?.first_name} {student?.last_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black shadow-sm",
                            isPositive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                          )}>
                            {isPositive ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {Math.abs(transaction.points)}
                            <Star className={cn("h-3 w-3", isPositive ? "fill-emerald-500" : "fill-rose-500")} />
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate font-medium text-sm">
                          {transaction.reason || <span className="text-muted-foreground italic text-xs">Sans motif particulier</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-lg border-primary/10 bg-primary/5 text-primary text-[10px] py-0 px-2">
                            {awardedBy ? `${awardedBy.first_name} ${awardedBy.last_name}` : "Système"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs pr-6">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3 h-3 opacity-50" />
                            {format(new Date(transaction.created_at), "HH:mm", { locale: fr })}
                            <span className="opacity-40">|</span>
                            {format(new Date(transaction.created_at), "dd MMM", { locale: fr })}
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Award Points Dialog */}
      <Dialog open={isAwardDialogOpen} onOpenChange={setIsAwardDialogOpen}>
        <DialogContent className="glass-card border-primary/10 backdrop-blur-xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
              <div className="p-3 rounded-2xl bg-amber-500/10">
                <Sparkles className="h-6 w-6 text-amber-500" />
              </div>
              Attribuer des Points
            </DialogTitle>
            {selectedStudent && (
              <div className="flex items-center gap-3 mt-4 p-3 rounded-2xl bg-muted/50 border border-primary/5">
                <Avatar className="h-10 w-10 border shadow-premium">
                  <AvatarImage src={resolveUploadUrl(selectedStudent.photo_url) || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-black">
                    {selectedStudent.first_name?.[0]}{selectedStudent.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold text-foreground">
                    {selectedStudent.first_name} {selectedStudent.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground uppercase font-black tracking-widest leading-none">Étudiant</p>
                </div>
              </div>
            )}
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex gap-4">
              <Button
                variant={!pointsForm.isNegative ? "default" : "outline"}
                onClick={() => setPointsForm({ ...pointsForm, isNegative: false })}
                className={cn(
                  "flex-1 h-12 rounded-2xl border-primary/10 transition-all",
                  !pointsForm.isNegative && "shadow-premium scale-105"
                )}
              >
                <Plus className="h-4 w-4 mr-2" />
                Récompense
              </Button>
              <Button
                variant={pointsForm.isNegative ? "destructive" : "outline"}
                onClick={() => setPointsForm({ ...pointsForm, isNegative: true })}
                className={cn(
                  "flex-1 h-12 rounded-2xl border-primary/10 transition-all",
                  pointsForm.isNegative && "shadow-premium scale-105 shadow-rose-500/20"
                )}
              >
                <Minus className="h-4 w-4 mr-2" />
                Sanction
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-sm">Montant du flux</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  className="h-14 text-2xl font-black text-center rounded-2xl border-primary/10 bg-background/50 focus:bg-background"
                  value={pointsForm.points}
                  onChange={(e) => setPointsForm({ ...pointsForm, points: parseInt(e.target.value) || 0 })}
                />
                <Star className="absolute right-4 top-1/2 -translate-y-1/2 h-6 w-6 text-amber-500 opacity-20" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-sm">Motivations / Raison</Label>
              <Textarea
                className="rounded-2xl border-primary/10 min-h-[100px] bg-background/50 focus:bg-background"
                value={pointsForm.reason}
                onChange={(e) => setPointsForm({ ...pointsForm, reason: e.target.value })}
                placeholder="Ex: Participation exceptionnelle au projet scientifique..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsAwardDialogOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button
              onClick={() => awardPointsMutation.mutate()}
              disabled={!pointsForm.points || awardPointsMutation.isPending}
              variant={pointsForm.isNegative ? "destructive" : "default"}
              className="rounded-xl px-12 shadow-premium"
            >
              {awardPointsMutation.isPending
                ? "Transmission..."
                : pointsForm.isNegative
                  ? "Retirer les points"
                  : "Confirmer l'envoi"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Award Badge Dialog */}
      <Dialog open={isBadgeDialogOpen} onOpenChange={setIsBadgeDialogOpen}>
        <DialogContent className="glass-card border-primary/10 backdrop-blur-xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
              <div className="p-3 rounded-2xl bg-purple-500/10">
                <Award className="h-6 w-6 text-purple-500" />
              </div>
              Attribuer un Badge
            </DialogTitle>
            {selectedStudent && (
              <div className="flex items-center gap-3 mt-4 p-3 rounded-2xl bg-muted/50 border border-primary/5">
                <Avatar className="h-10 w-10 border shadow-premium">
                  <AvatarImage src={resolveUploadUrl(selectedStudent.photo_url) || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-black">
                    {selectedStudent.first_name?.[0]}{selectedStudent.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold text-foreground">
                    {selectedStudent.first_name} {selectedStudent.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground uppercase font-black tracking-widest leading-none">Lauréat</p>
                </div>
              </div>
            )}
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="font-bold text-sm">Sélectionner un titre honorifique</Label>
              <Select value={selectedAchievement} onValueChange={setSelectedAchievement}>
                <SelectTrigger className="h-14 rounded-2xl border-primary/10">
                  <SelectValue placeholder="Quel badge décerner ?" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl p-2">
                  {achievements?.map((achievement) => (
                    <SelectItem key={achievement.id} value={achievement.id} className="rounded-xl py-3 border-b last:border-0 border-primary/5">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full shadow-sm"
                          style={{ backgroundColor: achievement.color }}
                        />
                        <span className="font-bold">{achievement.name}</span>
                        <Badge variant="outline" className="ml-auto bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                          +{achievement.points_reward} pts
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {achievements?.length === 0 && (
              <div className="p-6 text-center bg-muted/30 rounded-2xl border border-dashed border-primary/10">
                <p className="text-sm text-muted-foreground">
                  Aucun badge manuel n'est configuré.
                  <br />Créez-en un dans la liste des badges.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsBadgeDialogOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button
              className="rounded-xl px-12 shadow-premium"
              onClick={() => awardBadgeMutation.mutate()}
              disabled={!selectedAchievement || awardBadgeMutation.isPending}
            >
              {awardBadgeMutation.isPending
                ? "Enregistrement..."
                : "Attribuer le badge"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
