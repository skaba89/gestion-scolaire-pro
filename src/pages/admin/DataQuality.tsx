import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
    const { tenant } = useTenant();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [running, setRunning] = useState(false);

    const { data: anomalies, isLoading } = useQuery({
        queryKey: ["data-quality-anomalies", tenant?.id],
        queryFn: async () => {
            if (!tenant?.id) return [];
            const { data, error } = await supabase
                .from("data_quality_anomalies")
                .select("*")
                .eq("tenant_id", tenant.id)
                .eq("is_resolved", false)
                .order("detected_at", { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!tenant?.id,
    });

    const runChecksMutation = useMutation({
        mutationFn: async () => {
            setRunning(true);
            const { data, error } = await supabase.rpc('run_data_quality_checks', {
                p_tenant_id: tenant?.id
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (count) => {
            queryClient.invalidateQueries({ queryKey: ["data-quality-anomalies"] });
            toast({
                title: "Analyse terminée",
                description: `${count} anomalies détectées au total.`,
            });
            setRunning(false);
        },
        onError: (error: any) => {
            toast({
                title: "Erreur d'analyse",
                description: error.message,
                variant: "destructive",
            });
            setRunning(false);
        }
    });

    const resolveMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("data_quality_anomalies")
                .update({ is_resolved: true, resolved_at: new Date().toISOString() })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["data-quality-anomalies"] });
            toast({ title: "Marqué comme résolu" });
        }
    });

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'HIGH': return <Badge variant="destructive">Haute</Badge>;
            case 'MEDIUM': return <Badge variant="secondary" className="bg-orange-500 text-white">Moyenne</Badge>;
            default: return <Badge variant="outline">Basse</Badge>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">Qualité des Données</h1>
                    <p className="text-muted-foreground">Détectez et gérez les anomalies métier de votre établissement</p>
                </div>
                <Button
                    onClick={() => runChecksMutation.mutate()}
                    disabled={running || isLoading}
                    className="gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
                    {running ? "Analyse en cours..." : "Lancer l'analyse"}
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <Database className="w-8 h-8 text-primary opacity-50" />
                            <div>
                                <p className="text-3xl font-bold">{anomalies?.length || 0}</p>
                                <p className="text-sm font-medium text-muted-foreground">Anomalies actives</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-green-500/20">
                    <CardContent className="pt-6 text-center">
                        <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-medium">Santé Globale</p>
                        <p className="text-2xl font-bold">{anomalies?.length === 0 ? "100%" : "Attention"}</p>
                    </CardContent>
                </Card>

                <Card className="border-orange-500/20">
                    <CardContent className="pt-6 text-center">
                        <ShieldAlert className="w-8 h-8 text-orange-500 mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-medium">Règles actives</p>
                        <p className="text-2xl font-bold">12</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-orange-500" />
                        Anomalies détectées
                    </CardTitle>
                    <CardDescription>Liste des incohérences nécessitant une correction manuelle</CardDescription>
                </CardHeader>
                <CardContent>
                    {!anomalies || anomalies.length === 0 ? (
                        <div className="text-center py-12">
                            <CheckCircle className="w-12 h-12 text-green-500/30 mx-auto mb-4" />
                            <p className="text-muted-foreground">Aucune anomalie détectée. Vos données sont saines !</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Sévérité</TableHead>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Détecté le</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
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
                                                Marquer résolu
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
