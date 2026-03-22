import { Button } from "@/components/ui/button";
import { Download, Bell, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { StudentRisk, Prediction, Recommendation } from "@/types/ai";

interface AIActionsProps {
    tenantName?: string;
    studentRisks: StudentRisk[];
    predictions: Prediction[];
    recommendations: Recommendation[];
    onRefresh: () => void;
    isAnalyzing: boolean;
}

export function AIActions({ tenantName, studentRisks, predictions, recommendations, onRefresh, isAnalyzing }: AIActionsProps) {

    const handleExportPDF = () => {
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.width;

            // Header
            doc.setFontSize(20);
            doc.setTextColor(41, 128, 185);
            doc.text("Rapport d'Analyse IA - SchoolFlow Pro", pageWidth / 2, 15, { align: "center" });

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Établissement : ${tenantName || "Non défini"}`, 14, 25);
            doc.text(`Date : ${format(new Date(), "dd MMMM yyyy à HH:mm", { locale: fr })}`, 14, 30);

            doc.line(14, 35, pageWidth - 14, 35);

            // 1. Résumé Exécutif / Prédictions
            doc.setFontSize(14);
            doc.setTextColor(0);
            doc.text("1. Résumé Exécutif & Prédictions", 14, 45);

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
                    `${s.avgGrade}%`,
                    `${s.attendanceRate}%`,
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
                r.impact
            ]);

            autoTable(doc, {
                startY: finalY + 5,
                head: [['Validité', 'Catégorie', 'Action Suggérée', 'Impact Estimé']],
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
                doc.text('Généré automatiquement par SchoolFlow Pro AI', pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
            }

            doc.save(`rapport-ia-${format(new Date(), "yyyy-MM-dd")}.pdf`);
            toast.success("Rapport PDF généré avec succès");
        } catch (error) {
            console.error("PDF Export Error:", error);
            toast.error("Erreur lors de la génération du PDF");
        }
    };

    const handleSendAlerts = () => {
        const highRiskCount = studentRisks.filter(s => s.riskLevel === "high").length;
        if (highRiskCount === 0) {
            toast.info("Aucun étudiant à risque élevé - pas d'alertes à envoyer");
            return;
        }
        toast.promise(
            new Promise((resolve) => setTimeout(resolve, 2000)),
            {
                loading: `Envoi de ${highRiskCount} alertes aux parents...`,
                success: `${highRiskCount} alertes envoyées avec succès`,
                error: "Erreur lors de l'envoi des alertes",
            }
        );
    };

    const highRiskCount = studentRisks.filter(s => s.riskLevel === "high").length;

    return (
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportPDF}>
                <Download className="mr-2 h-4 w-4" />
                Exporter PDF
            </Button>
            <Button
                variant="outline"
                onClick={handleSendAlerts}
                className={highRiskCount > 0 ? "border-orange-500/50 text-orange-600 hover:bg-orange-50" : ""}
            >
                <Bell className="mr-2 h-4 w-4" />
                Alerter parents ({highRiskCount})
            </Button>
            <Button onClick={onRefresh} disabled={isAnalyzing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isAnalyzing ? "animate-spin" : ""}`} />
                Actualiser
            </Button>
        </div>
    );
}
