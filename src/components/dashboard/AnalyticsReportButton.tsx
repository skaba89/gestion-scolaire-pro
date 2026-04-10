import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { analyticsQueries } from "@/queries/analytics";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Download } from "lucide-react";
import { generateAnalyticsReport } from "@/lib/pdf/analytics-report";
import { toast } from "sonner";

export const AnalyticsReportButton = () => {
    const { tenant } = useTenant();
    const { profile } = useAuth();
    const { currency } = useCurrency();
    const [isGenerating, setIsGenerating] = useState(false);
    const queryClient = useQueryClient();

    const handleExport = async () => {
        if (!tenant?.id) return;
        setIsGenerating(true);

        try {
            // Fetch all data in parallel
            const [
                revenueTrend,
                debtAging,
                revenueByCategory,
                academicStats,
                studentsAtRisk
            ] = await Promise.all([
                queryClient.fetchQuery(analyticsQueries.revenueTrend(tenant.id)),
                queryClient.fetchQuery(analyticsQueries.debtAging(tenant.id)),
                queryClient.fetchQuery(analyticsQueries.revenueByCategory(tenant.id)),
                queryClient.fetchQuery(analyticsQueries.academicStats(tenant.id)),
                queryClient.fetchQuery(analyticsQueries.studentsAtRisk(tenant.id))
            ]);

            await generateAnalyticsReport({
                tenantName: tenant.name,
                generatedBy: `${profile?.first_name} ${profile?.last_name}`,
                currency: {
                    code: currency.code,
                    symbol: currency.symbol
                },
                financial: {
                    revenueTrend: revenueTrend || [],
                    debtAging: debtAging || [],
                    revenueByCategory: revenueByCategory || []
                },
                academic: {
                    stats: academicStats || [],
                    risks: studentsAtRisk || []
                }
            });

            toast.success("Rapport généré avec succès");
        } catch (error) {
            console.error("Export error:", error);
            toast.error("Erreur lors de la génération du rapport");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Button
            onClick={handleExport}
            disabled={isGenerating}
            variant="outline"
            size="sm"
            className="flex items-center gap-2 border-primary/20 hover:border-primary/50"
        >
            {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <Download className="w-4 h-4" />
            )}
            Exporter le Rapport (PDF)
        </Button>
    );
};
