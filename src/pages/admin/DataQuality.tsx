import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
    Activity,
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    ShieldAlert,
    Search,
    Database
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const DataQuality = () => {
    const { t } = useTranslation();
    const { tenant } = useTenant();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [running, setRunning] = useState(false);

    const { data: anomalies, isLoading } = useQuery({
        queryKey: ["data-quality-anomalies", tenant?.id],
        queryFn: async () => {
            if (!tenant?.id) return [];
            const { data } = await apiClient.get("/audit/data-quality/", {
                params: { is_resolved: false, ordering: "-detected_at" },
            });

            return data;
        },
        enabled: !!tenant?.id,
    });

    const runChecksMutation = useMutation({
        mutationFn: async () => {
            setRunning(true);
            const { data } = await apiClient.post("/audit/data-quality/run-checks/");
            return data;
        },
        onSuccess: (count) => {
            queryClient.invalidateQueries({ queryKey: ["data-quality-anomalies"] });
            toast({
                title: t("dataQuality.analysisDone"),
                description: t("dataQuality.anomaliesCount", { count }),
            });
            setRunning(false);
        },
        onError: (error: any) => {
            toast({
                title: t("dataQuality.analysisError"),
                description: error.message,
                variant: "destructive",
            });
            setRunning(false);
        }
    });

    const resolveMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.patch(`/audit/data-quality/${id}/`, { is_resolved: true, resolved_at: new Date().toISOString() });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["data-quality-anomalies"] });
            toast({ title: t("dataQuality.resolvedSuccess") });
        }
    });

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'HIGH': return <Badge variant="destructive">{t("dataQuality.severityHigh")}</Badge>;
            case 'MEDIUM': return <Badge variant="secondary" className="bg-orange-500 text-white">{t("dataQuality.severityMedium")}</Badge>;
            default: return <Badge variant="outline">{t("dataQuality.severityLow")}</Badge>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">{t("dataQuality.pageTitle")}</h1>
                    <p className="text-muted-foreground">{t("dataQuality.pageSubtitle")}</p>
                </div>
                <Button
                    onClick={() => runChecksMutation.mutate()}
                    disabled={running || isLoading}
                    className="gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
                    {running ? t("dataQuality.runningAnalysis") : t("dataQuality.runAnalysis")}
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <Database className="w-8 h-8 text-primary opacity-50" />
                            <div>
                                <p className="text-3xl font-bold">{anomalies?.length || 0}</p>
                                <p className="text-sm font-medium text-muted-foreground">{t("dataQuality.activeAnomalies")}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-green-500/20">
                    <CardContent className="pt-6 text-center">
                        <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-medium">{t("dataQuality.globalHealth")}</p>
                        <p className="text-2xl font-bold">{anomalies?.length === 0 ? "100%" : t("dataQuality.attention")}</p>
                    </CardContent>
                </Card>

                <Card className="border-orange-500/20">
                    <CardContent className="pt-6 text-center">
                        <ShieldAlert className="w-8 h-8 text-orange-500 mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-medium">{t("dataQuality.activeRules")}</p>
                        <p className="text-2xl font-bold">12</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-orange-500" />
                        {t("dataQuality.anomaliesTitle")}
                    </CardTitle>
                    <CardDescription>{t("dataQuality.anomaliesDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                    {!anomalies || anomalies.length === 0 ? (
                        <div className="text-center py-12">
                            <CheckCircle className="w-12 h-12 text-green-500/30 mx-auto mb-4" />
                            <p className="text-muted-foreground">{t("dataQuality.noAnomalies")}</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t("dataQuality.colSeverity")}</TableHead>
                                    <TableHead>{t("dataQuality.colCode")}</TableHead>
                                    <TableHead>{t("dataQuality.colDescription")}</TableHead>
                                    <TableHead>{t("dataQuality.colDetected")}</TableHead>
                                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {anomalies.map((anomaly) => (
                                    <TableRow key={anomaly.id}>
                                        <TableCell>{getSeverityBadge(anomaly.severity)}</TableCell>
                                        <TableCell><code className="text-xs font-mono bg-muted p-1 rounded">{anomaly.rule_code}</code></TableCell>
                                        <TableCell className="font-medium">{anomaly.description}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {format(new Date(anomaly.detected_at), "d MMM yyyy HH:mm", { locale: fr })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => resolveMutation.mutate(anomaly.id)}
                                            >
                                                {t("dataQuality.markResolved")}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default DataQuality;
