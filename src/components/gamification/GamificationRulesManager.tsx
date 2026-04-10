import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Settings, Trash2, Sparkles, Award, TrendingUp, CheckCircle2, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
    getGamificationRules,
    createGamificationRule,
    updateGamificationRule,
    deleteGamificationRule,
    toggleRuleActive,
    type GamificationRule,
} from "@/lib/gamification-rules-service";

const EVENT_TYPES = [
    { value: "GRADE_ADDED", label: "Note ajoutée", icon: "📝" },
    { value: "PERFECT_SCORE", label: "Note parfaite (20/20)", icon: "🎯" },
    { value: "ATTENDANCE_PRESENT", label: "Présence", icon: "✅" },
    { value: "ATTENDANCE_STREAK", label: "Série de présences", icon: "🔥" },
    { value: "HOMEWORK_SUBMITTED", label: "Devoir rendu", icon: "📚" },
    { value: "GRADE_IMPROVEMENT", label: "Amélioration de note", icon: "📈" },
];

export const GamificationRulesManager = () => {
    const { tenant } = useTenant();
    const queryClient = useQueryClient();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<GamificationRule | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        event_type: "",
        conditions: "{}",
        reward_type: "POINTS" as "POINTS" | "BADGE",
        reward_value: 10,
        reward_badge_id: "",
        priority: 10,
    });

    // Fetch rules
    const { data: rules, isLoading } = useQuery({
        queryKey: ["gamification-rules", tenant?.id],
        queryFn: () => getGamificationRules(tenant!.id),
        enabled: !!tenant?.id,
    });

    // Create rule mutation
    const createMutation = useMutation({
        mutationFn: () =>
            createGamificationRule({
                tenant_id: tenant!.id,
                ...formData,
                conditions: JSON.parse(formData.conditions),
                is_active: true,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["gamification-rules"] });
            toast.success("Règle créée avec succès");
            setIsCreateDialogOpen(false);
            resetForm();
        },
        onError: (error: any) => {
            toast.error("Erreur: " + error.message);
        },
    });

    // Update rule mutation
    const updateMutation = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<GamificationRule> }) =>
            updateGamificationRule(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["gamification-rules"] });
            toast.success("Règle mise à jour");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + error.message);
        },
    });

    // Delete rule mutation
    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteGamificationRule(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["gamification-rules"] });
            toast.success("Règle supprimée");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + error.message);
        },
    });

    // Toggle active mutation
    const toggleMutation = useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
            toggleRuleActive(id, isActive),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["gamification-rules"] });
        },
    });

    const resetForm = () => {
        setFormData({
            name: "",
            description: "",
            event_type: "",
            conditions: "{}",
            reward_type: "POINTS",
            reward_value: 10,
            reward_badge_id: "",
            priority: 10,
        });
        setEditingRule(null);
    };

    const handleSubmit = () => {
        try {
            JSON.parse(formData.conditions); // Validate JSON
            createMutation.mutate();
        } catch (e) {
            toast.error("Format JSON invalide pour les conditions");
        }
    };

    return (
        <div className="space-y-6">
            <Card className="glass-card border-none shadow-premium">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-2xl font-bold">
                                <div className="p-2 rounded-xl bg-primary/10">
                                    <Settings className="h-6 w-6 text-primary" />
                                </div>
                                Règles Automatiques
                            </CardTitle>
                            <CardDescription>
                                Configurez les récompenses automatiques basées sur les événements académiques
                            </CardDescription>
                        </div>
                        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="rounded-xl shadow-premium">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Nouvelle Règle
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="glass-card border-primary/10 backdrop-blur-xl rounded-3xl max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl font-bold">Créer une Règle Automatique</DialogTitle>
                                    <DialogDescription>
                                        Définissez les conditions et les récompenses pour cette règle
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Nom de la règle</Label>
                                        <Input
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Ex: Excellence Académique"
                                            className="rounded-xl"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Description (optionnelle)</Label>
                                        <Textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Décrivez cette règle..."
                                            className="rounded-xl"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Type d'événement</Label>
                                        <Select value={formData.event_type} onValueChange={(v) => setFormData({ ...formData, event_type: v })}>
                                            <SelectTrigger className="rounded-xl">
                                                <SelectValue placeholder="Sélectionner un événement" />
                                            </SelectTrigger>
                                            <SelectContent className="rounded-2xl">
                                                {EVENT_TYPES.map((type) => (
                                                    <SelectItem key={type.value} value={type.value} className="rounded-xl">
                                                        {type.icon} {type.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Conditions (JSON)</Label>
                                        <Textarea
                                            value={formData.conditions}
                                            onChange={(e) => setFormData({ ...formData, conditions: e.target.value })}
                                            placeholder='{"min_score": 18}'
                                            className="rounded-xl font-mono text-sm"
                                            rows={3}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Exemples: {`{"min_score": 18}`}, {`{"consecutive_days": 30}`}, {`{"on_time": true}`}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Type de récompense</Label>
                                            <Select value={formData.reward_type} onValueChange={(v: any) => setFormData({ ...formData, reward_type: v })}>
                                                <SelectTrigger className="rounded-xl">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-2xl">
                                                    <SelectItem value="POINTS" className="rounded-xl">
                                                        <div className="flex items-center gap-2">
                                                            <Sparkles className="h-4 w-4 text-amber-500" />
                                                            Points
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="BADGE" className="rounded-xl">
                                                        <div className="flex items-center gap-2">
                                                            <Award className="h-4 w-4 text-purple-500" />
                                                            Badge
                                                        </div>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {formData.reward_type === "POINTS" && (
                                            <div className="space-y-2">
                                                <Label>Nombre de points</Label>
                                                <Input
                                                    type="number"
                                                    value={formData.reward_value}
                                                    onChange={(e) => setFormData({ ...formData, reward_value: parseInt(e.target.value) || 0 })}
                                                    className="rounded-xl"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Priorité (0-100)</Label>
                                        <Input
                                            type="number"
                                            value={formData.priority}
                                            onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                                            className="rounded-xl"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Les règles avec une priorité plus élevée sont évaluées en premier
                                        </p>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)} className="rounded-xl">
                                        Annuler
                                    </Button>
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={!formData.name || !formData.event_type || createMutation.isPending}
                                        className="rounded-xl shadow-premium"
                                    >
                                        {createMutation.isPending ? "Création..." : "Créer la règle"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-12 text-muted-foreground">Chargement...</div>
                    ) : !rules || rules.length === 0 ? (
                        <div className="text-center py-12 bg-muted/10 rounded-2xl border border-dashed border-primary/10">
                            <p className="text-muted-foreground">Aucune règle configurée</p>
                            <p className="text-sm text-muted-foreground mt-2">Créez votre première règle automatique</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Règle</TableHead>
                                    <TableHead>Événement</TableHead>
                                    <TableHead>Récompense</TableHead>
                                    <TableHead>Priorité</TableHead>
                                    <TableHead>Statut</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <AnimatePresence mode="popLayout">
                                    {rules.map((rule) => (
                                        <motion.tr
                                            key={rule.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="hover:bg-primary/5 transition-colors"
                                        >
                                            <TableCell>
                                                <div>
                                                    <p className="font-bold">{rule.name}</p>
                                                    {rule.description && (
                                                        <p className="text-xs text-muted-foreground">{rule.description}</p>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="rounded-lg">
                                                    {EVENT_TYPES.find((t) => t.value === rule.event_type)?.label || rule.event_type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {rule.reward_type === "POINTS" ? (
                                                    <div className="flex items-center gap-1 text-amber-600">
                                                        <Sparkles className="h-4 w-4" />
                                                        <span className="font-bold">+{rule.reward_value} pts</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 text-purple-600">
                                                        <Award className="h-4 w-4" />
                                                        <span className="font-bold">Badge</span>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="rounded-lg">
                                                    {rule.priority}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Switch
                                                    checked={rule.is_active}
                                                    onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, isActive: checked })}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => deleteMutation.mutate(rule.id)}
                                                    className="rounded-xl text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
