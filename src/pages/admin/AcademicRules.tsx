
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2, Settings, AlertTriangle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useTerminology } from "@/hooks/useTerminology";

type AcademicRuleType = 'PASSING_GRADE' | 'HONOR_ROLL_THRESHOLD' | 'COEFFICIENT_POLICY' | 'ATTENDANCE_LIMIT' | 'PROMOTION_RULE';

interface AcademicRule {
    id: string;
    type: AcademicRuleType;
    level_id?: string;
    program_id?: string;
    value: any;
    is_active: boolean;
    levels?: { name: string };
}

export default function AcademicRules() {
    const { t } = useTranslation();
    const { termLabel, coefficientLabel, levelLabel, gradeLabel } = useTerminology();
    const queryClient = useQueryClient();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newRule, setNewRule] = useState<Partial<AcademicRule> & { valueStr: string }>({
        type: 'PASSING_GRADE',
        is_active: true,
        valueStr: '{"min": 10}',
    });

    // Fetch rules
    const { data: rules, isLoading } = useQuery({
        queryKey: ["academic-rules"],
        queryFn: async () => {
            const { data } = await apiClient.get("/tenants/settings/academic-rules/", {
                params: { ordering: "-created_at" },
            });
            return (data as any[] || []) as AcademicRule[];
        },
    });

    // Fetch levels for dropdown
    const { data: levels } = useQuery({
        queryKey: ["levels"],
        queryFn: async () => {
            const { data } = await apiClient.get("/students/levels/", {
                params: { ordering: "name" },
            });
            return data;
        },
    });

    // Create mutation
    const createMutation = useMutation({
        mutationFn: async (rule: any) => {
            // Parse value string to JSON
            let valueJson;
            try {
                valueJson = JSON.parse(rule.valueStr);
            } catch (e) {
                throw new Error(t("academicRules.invalidJson"));
            }

            const { data } = await apiClient.post("/tenants/settings/academic-rules/", {
                type: rule.type,
                level_id: rule.level_id === "all" ? null : rule.level_id,
                value: valueJson,
                is_active: rule.is_active,
            });

            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["academic-rules"] });
            setIsCreateOpen(false);
            setNewRule({ type: 'PASSING_GRADE', is_active: true, valueStr: '{"min": 10}' });
            toast.success(t("academicRules.createSuccess"));
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.detail || error.message || t("academicRules.createError"));
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/tenants/settings/academic-rules/${id}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["academic-rules"] });
            toast.success(t("academicRules.deleteSuccess"));
        },
    });

    const handleSubmit = () => {
        createMutation.mutate(newRule);
    };

    const getRuleDescription = (type: AcademicRuleType) => {
        switch (type) {
            case 'PASSING_GRADE': return t("academicRules.rulePassingGrade", { label: gradeLabel });
            case 'HONOR_ROLL_THRESHOLD': return t("academicRules.ruleHonorRoll");
            case 'COEFFICIENT_POLICY': return t("academicRules.ruleCoefficientPolicy", { label: coefficientLabel });
            case 'ATTENDANCE_LIMIT': return t("academicRules.ruleAttendanceLimit");
            case 'PROMOTION_RULE': return t("academicRules.rulePromotion", { label: levelLabel });
            default: return type;
        }
    };

    const getDefaultValueForType = (type: AcademicRuleType) => {
        switch (type) {
            case 'PASSING_GRADE': return '{"min": 10}';
            case 'HONOR_ROLL_THRESHOLD': return '{"honors": 12, "high_honors": 14, "highest_honors": 16}';
            case 'ATTENDANCE_LIMIT': return '{"max_unexcused": 10}';
            default: return '{}';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{t("academicRules.pageTitle")}</h2>
                    <p className="text-muted-foreground">
                        {t("academicRules.pageSubtitle")}
                    </p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            {t("academicRules.newRule")}
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t("academicRules.dialogTitle")}</DialogTitle>
                            <DialogDescription>
                                {t("academicRules.dialogDescription")}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>{t("academicRules.ruleType")}</Label>
                                <Select
                                    value={newRule.type}
                                    onValueChange={(val: AcademicRuleType) =>
                                        setNewRule({ ...newRule, type: val, valueStr: getDefaultValueForType(val) })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PASSING_GRADE">{t("academicRules.typePassingGrade")}</SelectItem>
                                        <SelectItem value="HONOR_ROLL_THRESHOLD">{t("academicRules.typeHonorRoll")}</SelectItem>
                                        <SelectItem value="ATTENDANCE_LIMIT">{t("academicRules.typeAttendanceLimit")}</SelectItem>
                                        <SelectItem value="PROMOTION_RULE">{t("academicRules.typePromotion")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>{levelLabel} ({t("academicRules.optional")})</Label>
                                <Select
                                    value={newRule.level_id || "all"}
                                    onValueChange={(val) => setNewRule({ ...newRule, level_id: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t("academicRules.allLevels")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t("academicRules.allLevelsGlobal")}</SelectItem>
                                        {levels?.map((l) => (
                                            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    {t("academicRules.levelHint")}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>{t("academicRules.valueJson")}</Label>
                                <Input
                                    value={newRule.valueStr}
                                    onChange={(e) => setNewRule({ ...newRule, valueStr: e.target.value })}
                                    className="font-mono"
                                />
                                <p className="text-xs text-muted-foreground">
                                    {t("academicRules.jsonHint")}
                                </p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t("academicRules.cancel")}</Button>
                            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t("academicRules.save")}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {isLoading ? (
                    <div className="col-span-3 text-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    </div>
                ) : rules?.length === 0 ? (
                    <div className="col-span-3 text-center py-12 border rounded-lg bg-muted/10">
                        <Settings className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium">{t("academicRules.emptyTitle")}</h3>
                        <p className="text-muted-foreground mb-4">{t("academicRules.emptySubtitle")}</p>
                        <Button onClick={() => setIsCreateOpen(true)} variant="outline">{t("academicRules.createRule")}</Button>
                    </div>
                ) : (
                    rules?.map((rule) => (
                        <Card key={rule.id}>
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base font-semibold">
                                            {getRuleDescription(rule.type)}
                                        </CardTitle>
                                        <CardDescription>
                                            {rule.levels ? t("academicRules.levelApplied", { name: rule.levels.name }) : t("academicRules.globalApplication")}
                                        </CardDescription>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive opacity-50 hover:opacity-100"
                                        onClick={() => deleteMutation.mutate(rule.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto">
                                    {JSON.stringify(rule.value, null, 2)}
                                </div>
                                <div className="mt-4 flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <Switch checked={rule.is_active} disabled />
                                        <span className="text-xs text-muted-foreground">
                                            {rule.is_active ? t("academicRules.active") : t("academicRules.inactive")}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Card className="bg-amber-50 border-amber-200">
                <CardContent className="flex items-start p-4 space-x-4">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div className="space-y-1">
                        <h4 className="font-semibold text-amber-800">{t("academicRules.noteTitle")}</h4>
                        <p className="text-sm text-amber-700">
                            {t("academicRules.noteContent")}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
