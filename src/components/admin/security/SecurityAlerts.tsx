import React from 'react';
import { useAuditLogs } from "@/hooks/queries/useAuditLogs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, AlertTriangle, ShieldCheck, MapPin, Monitor, User, Clock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

export const SecurityAlerts = () => {
    // Fetch only WARNING and CRITICAL alerts from the last 7 days
    const { data, isLoading } = useAuditLogs({
        severity: "CRITICAL", // Start with critical, we might want to blend WARNING too
        pageSize: 5
    });

    // Blend in WARNING alerts if needed, or just let the hook handle it if we support multiple?
    // For now, let's just show CRITICAL for a focused experience
    const alerts = data?.logs || [];

    if (isLoading) {
        return (
            <Card className="border-red-500/20 bg-red-500/5">
                <CardHeader>
                    <CardTitle className="text-red-700 flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5" />
                        Alertes de Sécurité
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="animate-pulse space-y-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-red-200/20 rounded-lg" />)}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (alerts.length === 0) {
        return (
            <Card className="border-green-500/20 bg-green-500/5">
                <CardHeader>
                    <CardTitle className="text-green-700 flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5" />
                        Sécurité Système
                    </CardTitle>
                    <CardDescription>Aucune menace critique détectée récemment.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card className="border-red-500/50 bg-red-500/5 shadow-lg">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-red-700 flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 shadow-sm" />
                            Alertes de Sécurité
                        </CardTitle>
                        <CardDescription className="text-red-600/80 font-medium pt-1">
                            {alerts.length} incident(s) critique(s) en attente de revue
                        </CardDescription>
                    </div>
                    <Badge variant="destructive" className="animate-pulse">Critique</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {alerts.map((alert) => (
                    <div
                        key={alert.id}
                        className="p-4 rounded-xl border border-red-200 bg-white/50 backdrop-blur-sm space-y-3 hover:shadow-md transition-all group"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex gap-3">
                                <div className="p-2 rounded-lg bg-red-100 text-red-600">
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-900 group-hover:text-red-700 transition-colors">
                                        {alert.action.replace(/_/g, ' ')}
                                    </h4>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                        <User className="w-3 h-3" />
                                        <span>{alert.user_name || alert.user_email || "Système"}</span>
                                        <span>•</span>
                                        <Clock className="w-3 h-3" />
                                        <span>{format(new Date(alert.created_at), "Pp", { locale: fr })}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100/50 p-2 rounded-lg">
                                <MapPin className="w-3 h-3 text-red-500" />
                                <span className="font-mono truncate">{alert.ip_address || "IP Inconnue"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100/50 p-2 rounded-lg">
                                <Monitor className="w-3 h-3 text-blue-500" />
                                <span className="truncate">{alert.user_agent ? alert.user_agent.split(' ')[0] : "Navigateur Inconnu"}</span>
                            </div>
                        </div>

                        {alert.new_values && (
                            <div className="text-[10px] p-2 bg-slate-900 text-slate-300 rounded-lg overflow-auto max-h-20 font-mono">
                                {JSON.stringify(alert.new_values, null, 2)}
                            </div>
                        )}
                    </div>
                ))}
            </CardContent>
        </Card>
    );
};
