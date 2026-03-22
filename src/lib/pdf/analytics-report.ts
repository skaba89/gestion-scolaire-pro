import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface ReportData {
    tenantName: string;
    generatedBy: string;
    currency: {
        code: string;
        symbol: string;
    };
    financial: {
        revenueTrend: any[];
        debtAging: any[];
        revenueByCategory: any[];
    };
    academic: {
        stats: any[];
        risks: any[];
    };
}

export const generateAnalyticsReport = async (data: ReportData) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const dateStr = format(new Date(), "PPpp", { locale: fr });

    // --- Header ---
    doc.setFontSize(20);
    doc.setTextColor(40);
    doc.text("Rapport Analytique SchoolFlow Pro", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(12);
    doc.text(`Établissement : ${data.tenantName}`, 14, 30);
    doc.text(`Généré le : ${dateStr}`, 14, 37);
    doc.text(`Généré par : ${data.generatedBy}`, 14, 44);

    let yPos = 55;

    // --- Section 1: Finances ---
    doc.setFontSize(16);
    doc.setTextColor(0, 102, 204);
    doc.text("1. Analyse Financière", 14, yPos);
    yPos += 10;

    // Revenue Trend Table
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Évolution des Revenus (12 derniers mois)", 14, yPos);
    yPos += 5;

    autoTable(doc, {
        startY: yPos,
        head: [["Mois", "Collecté", "Attendu", "Écart"]],
        body: data.financial.revenueTrend.map(item => [
            item.month_val,
            `${item.revenue_collected} ${data.currency.symbol}`,
            `${item.revenue_expected} ${data.currency.symbol}`,
            `${(Number(item.revenue_expected) - Number(item.revenue_collected)).toFixed(2)} ${data.currency.symbol}`
        ]),
        theme: "striped",
        headStyles: { fillColor: [0, 102, 204] }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Revenue By Category
    doc.text("Répartition des Revenus par Catégorie", 14, yPos);
    yPos += 5;

    autoTable(doc, {
        startY: yPos,
        head: [["Catégorie", "Montant Total"]],
        body: data.financial.revenueByCategory.map(item => [
            item.category,
            `${item.amount} ${data.currency.symbol}`
        ]),
        theme: "grid"
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // --- Page Break for Academic ---
    doc.addPage();
    yPos = 20;

    doc.setFontSize(16);
    doc.setTextColor(0, 102, 204);
    doc.text("2. Performance Académique", 14, yPos);
    yPos += 10;

    // Academic Stats
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Taux de Réussite par Classe", 14, yPos);
    yPos += 5;

    autoTable(doc, {
        startY: yPos,
        head: [["Classe", "Moyenne (%)", "Taux de Réussite"]],
        body: data.academic.stats.map(item => [
            item.class_name,
            `${item.average_score}%`,
            `${item.success_rate}%`
        ]),
        theme: "striped"
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Students at Risk
    doc.text("Élèves à Risque Identifiés (IA)", 14, yPos);
    yPos += 5;

    autoTable(doc, {
        startY: yPos,
        head: [["Élève", "Moyenne", "Absences", "Niveau de Risque"]],
        body: data.academic.risks.map(item => [
            `${item.first_name} ${item.last_name}`,
            `${item.avg_grade}/100`,
            item.absence_count,
            item.risk_level
        ]),
        theme: "grid",
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 3) {
                if (data.cell.raw === 'CRITICAL') {
                    data.cell.styles.textColor = [255, 0, 0];
                } else if (data.cell.raw === 'WARNING') {
                    data.cell.styles.textColor = [255, 165, 0];
                }
            }
        }
    });

    // --- Footer ---
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text(
            `Page ${i} sur ${totalPages} - Confidentiel - SchoolFlow Pro`,
            14,
            doc.internal.pageSize.getHeight() - 10
        );
    }

    doc.save(`Rapport_Analytique_${format(new Date(), "yyyy-MM-dd")}.pdf`);
};
