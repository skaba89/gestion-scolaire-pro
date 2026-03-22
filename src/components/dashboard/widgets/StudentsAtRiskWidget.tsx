import { useTerms } from "@/queries/terms";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertCircle, AlertTriangle, User, RefreshCw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { Link } from "react-router-dom";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useStudentRisks, StudentRiskScore } from "@/hooks/useStudentRisks";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export const StudentsAtRiskWidget = () => {
    const { tenant } = useTenant();
    const { getTenantUrl } = useTenantUrl();
    const { studentLabel } = useStudentLabel();

    // Fetch risks
    const { risks, isLoading, calculateRisks } = useStudentRisks(tenant?.id || "");

    // Fetch current term to enable calculation
    const { data: terms } = useTerms(tenant?.id || "");
    const currentTerm = terms?.find(t => t.is_active);

    if (isLoading) {
        return (
            <Card className="border-none shadow-sm h-full">
                <CardHeader>
                    <Skeleton className="h-6 w-48" />
                </CardHeader>
                <CardContent className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </CardContent>
            </Card>
        );
    }

    const hasCritical = risks?.some(s => s.risk_level === 'CRITICAL');

    const getFactorDetail = (risk: StudentRiskScore, category: string) => {
        const factor = risk.factors?.find(f => f.category === category);
        return factor ? factor.details : null;
    };

    return (
        <Card className="glass-card border-none shadow-premium h-full flex flex-col overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16" />

            <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                    <div className={cn(
                        "p-1.5 rounded-lg",
                        hasCritical ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                    )}>
                        {hasCritical ? (
                            <AlertCircle className="w-4 h-4" />
                        ) : (
                            <AlertTriangle className="w-4 h-4" />
                        )}
                    </div>
                    Réussite Académique
                </CardTitle>
                {currentTerm && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full"
                        onClick={() => calculateRisks.mutate(currentTerm.id)}
                        disabled={calculateRisks.isPending}
                        title="Lancer l'analyse IA"
                    >
                        <RefreshCw className={cn("h-4 w-4", calculateRisks.isPending && "animate-spin")} />
                    </Button>
                )}
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden relative z-10">
                <AnimatePresence mode="wait">
                    {!risks || risks.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground text-center"
                        >
                            <div className="w-16 h-16 bg-primary/5 rounded-3xl flex items-center justify-center mb-4">
                                <Zap className="w-8 h-8 text-primary/40" />
                            </div>
                            <p className="text-sm font-medium">Prêt pour l'analyse</p>
                            <p className="text-xs opacity-60 mt-1 mb-4">L'IA est prête à analyser les performances.</p>
                            {currentTerm && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl border-primary/20 hover:bg-primary/5 text-primary"
                                    onClick={() => calculateRisks.mutate(currentTerm.id)}
                                    disabled={calculateRisks.isPending}
                                >
                                    {calculateRisks.isPending ? (
                                        <><RefreshCw className="w-3 h-3 mr-2 animate-spin" /> Analyse...</>
                                    ) : (
                                        "Lancer l'IA"
                                    )}
                                </Button>
                            )}
                        </motion.div>
                    ) : (
                        <ScrollArea className="h-full max-h-[350px] pr-4">
                            <div className="space-y-3">
                                {risks.map((risk, index) => (
                                    <motion.div
                                        key={risk.student_id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                    >
                                        <Link
                                            to={getTenantUrl(`/admin/students/${risk.student_id}`)}
                                            className="flex items-center justify-between group bg-muted/30 hover:bg-primary/5 p-3 rounded-2xl border border-transparent hover:border-primary/10 transition-all duration-300"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-10 w-10 border-2 border-background shadow-sm ring-1 ring-primary/10">
                                                    {risk.student?.photo_url ? (
                                                        <img src={risk.student.photo_url} alt="Student" className="object-cover" />
                                                    ) : (
                                                        <AvatarFallback className="bg-primary/5 text-primary text-xs font-bold">
                                                            {risk.student?.first_name?.[0]}{risk.student?.last_name?.[0]}
                                                        </AvatarFallback>
                                                    )}
                                                </Avatar>
                                                <div>
                                                    <p className="text-sm font-bold leading-none group-hover:text-primary transition-colors">
                                                        {risk.student?.first_name} {risk.student?.last_name}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        <p className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-md">
                                                            {getFactorDetail(risk, "Academic Performance") || "N/A"}
                                                        </p>
                                                        {getFactorDetail(risk, "Attendance") && (
                                                            <p className="text-[10px] font-medium text-destructive/70 bg-destructive/5 px-1.5 py-0.5 rounded-md">
                                                                {getFactorDetail(risk, "Attendance")}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1.5">
                                                <Badge
                                                    variant={risk.risk_level === 'CRITICAL' ? "destructive" : "secondary"}
                                                    className={cn(
                                                        "text-[9px] font-bold px-2 py-0 rounded-full",
                                                        risk.risk_level === 'CRITICAL'
                                                            ? "bg-destructive text-destructive-foreground shadow-sm animate-pulse-subtle"
                                                            : "bg-warning/10 text-warning border-warning/20 shadow-none"
                                                    )}
                                                >
                                                    {risk.risk_level === 'CRITICAL' ? 'CRITIQUE' : 'À RISQUE'}
                                                </Badge>
                                                <span className="text-[10px] font-mono font-bold text-muted-foreground/80">
                                                    {risk.risk_score}%
                                                </span>
                                            </div>
                                        </Link>
                                    </motion.div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    );
};
