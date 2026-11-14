import { Button } from "@/components/ui/button";
import { Download, Bell, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { StudentRisk, Prediction, Recommendation } from "@/types/ai";
import { dateFnsLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

interface AIActionsProps {
    tenantName?: string;
    studentRisks: StudentRisk[];
    predictions: Prediction[];
    recommendations: Recommendation[];
    onRefresh: () => void;
    isAnalyzing: boolean;
}

export function AIActions({ tenantName, studentRisks, predictions, recommendations, onRefresh, isAnalyzing }: AIActionsProps) {
  const { t } = useTranslation();

    const handleExportPDF = async () => {
        try {
            // jspdf (~600 kB) est chargé au clic seulement, pas avec la page.
            // i18n-ignore-start : contenu du PDF laissé en français — les polices
            // par défaut de jsPDF ne contiennent ni l'arabe ni le chinois.
            const [{ jsPDF }, { default: autoTable }] = await Promise.all([
                import("jspdf"),
                import("jspdf-autotable"),
            ]);
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.width;

            // Header
            doc.setFontSize(20);
            doc.setTextColor(41, 128, 185);
            doc.text(`Rapport d'Analyse IA - ${tenantName || "Établissement"}`, pageWidth / 2, 15, { align: "center" });

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Établissement : ${tenantName || "Non défini"}`, 14, 25);
            doc.text(`Date : ${format(new Date(), "dd MMMM yyyy à HH:mm", { locale: dateFnsLocale() })}`, 14, 30);

            doc.line(14, 35, pageWidth - 14, 35);

            // 1. Résumé Exécutif / Prédictions
            doc.setFontSize(14);
            doc.setTextColor(0);
            doc.text("1. Indicateurs actuels", 14, 45);

            const predictionData = predictions.map(p => [p.title, p.value, p.description]);

            autoTable(doc, {
                startY: 50,
                head: [['Indicateur', 'Valeur', 'Description']],
                body: predictionData,
                theme: 'striped',
                headStyles: { fillColor: [41, 128, 185] }
            });

            // 2. Étudiants à Risque Élevé
            let finalY = (doc as any).lastAutoTable.finalY + 15;
            doc.text("2. Étudiants à Risque Élevé", 14, finalY);

            const highRiskStudents = studentRisks.filter(s => s.riskLevel === "high");

            if (highRiskStudents.length > 0) {
                const riskData = highRiskStudents.map(s => [
                    s.name,
                    s.classroom,
                    `${s.avgGrade.toFixed(1)}/20`,
                    s.attendanceRate === null ? "—" : `${Math.round(s.attendanceRate)} %`,
                    s.factors.join(", ")
                ]);

                autoTable(doc, {
                    startY: finalY + 5,
                    head: [['Nom', 'Classe', 'Moyenne', 'Présence', 'Facteurs']],
                    body: riskData,
                    theme: 'grid',
                    headStyles: { fillColor: [231, 76, 60] }
                });
            } else {
                doc.setFontSize(11);
                doc.setTextColor(46, 204, 113);
                doc.text("Aucun étudiant à risque élevé détecté.", 14, finalY + 10);
            }

            // 3. Recommandations
            finalY = (doc as any).lastAutoTable.finalY ? (doc as any).lastAutoTable.finalY + 15 : finalY + 20;
            doc.setFontSize(14);
            doc.setTextColor(0);
            doc.text("3. Recommandations IA", 14, finalY);

            const recData = recommendations.map(r => [
                r.priority.toUpperCase(),
                r.category,
                r.title,
                r.description
            ]);

            autoTable(doc, {
                startY: finalY + 5,
                head: [['Priorité', 'Catégorie', 'Action suggérée', 'Constat']],
                body: recData,
                theme: 'striped',
                headStyles: { fillColor: [142, 68, 173] }
            });

            // Footer
            const totalPages = (doc as any).internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Généré automatiquement par ${tenantName || 'l\'IA'}`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
            }

            doc.save(`rapport-ia-${format(new Date(), "yyyy-MM-dd")}.pdf`);
            // i18n-ignore-end
            toast.success(t("aiInsights.pdfDone"));
        } catch (error) {
            console.error("PDF Export Error:", error);
            toast.error(t("aiInsights.pdfError"));
        }
    };

    const handleSendAlerts = () => {
        const highRiskCount = studentRisks.filter(s => s.riskLevel === "high").length;
        if (highRiskCount === 0) {
            toast.info(t("aiInsights.noHighRisk"));
            return;
        }
        toast.promise(
            new Promise((resolve) => setTimeout(resolve, 2000)),
            {
                loading: t("aiInsights.sending", { count: highRiskCount }),
                success: t("aiInsights.sent", { count: highRiskCount }),
                error: t("aiInsights.sendError"),
            }
        );
    };

    const highRiskCount = studentRisks.filter(s => s.riskLevel === "high").length;

    return (
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportPDF}>
                <Download className="mr-2 h-4 w-4" />
                {t("aiInsights.exportPdf")}
            </Button>
            <Button
                variant="outline"
                onClick={handleSendAlerts}
                className={highRiskCount > 0 ? "border-orange-500/50 text-orange-600 hover:bg-orange-50" : ""}
            >
                <Bell className="mr-2 h-4 w-4" />
                {t("aiInsights.alertParents", { count: highRiskCount })}
            </Button>
            <Button onClick={onRefresh} disabled={isAnalyzing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isAnalyzing ? "animate-spin" : ""}`} />
                {t("aiInsights.refresh")}
            </Button>
        </div>
    );
}
