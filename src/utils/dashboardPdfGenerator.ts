import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { format as formatDate } from "date-fns";
import { fr } from "date-fns/locale";

interface DashboardData {
    tenantName: string;
    period: string;
    financial: {
        totalRevenue: string;
        collectionRate: string;
        paidRevenue: string;
        pendingRevenue: string;
    };
    academic: {
        successRate: string;
        totalStudents: number;
        averageGrade: string;
        failingStudents: number;
    };
    operational: {
        attendanceRate: string;
        teacherAttendance: string;
        enrollments: number;
        dropoutRate: string;
        teacherHours?: string;
    };
}

export function generateDashboardPDF(data: DashboardData) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text("RAPPORT DIRECTION - " + data.tenantName.toUpperCase(), margin, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Généré le: ${formatDate(new Date(), "dd MMMM yyyy", { locale: fr })}`, margin, 28);
    doc.text(`Période: ${data.period}`, pageWidth - margin, 28, { align: "right" });

    // --- Section Financière ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("1. Indicateurs Financiers", margin, 40);

    (doc as any).autoTable({
        startY: 45,
        head: [['Indicateur', 'Valeur']],
        body: [
            ['Revenus Totaux', data.financial.totalRevenue],
            ['Taux de Recouvrement', data.financial.collectionRate],
            ['Revenus Encaissés', data.financial.paidRevenue],
            ['Impayés', data.financial.pendingRevenue]
        ],
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] }
    });

    // --- Section Académique ---
    const academicY = (doc as any).lastAutoTable.finalY + 15;
    doc.text("2. Performance Académique", margin, academicY);

    (doc as any).autoTable({
        startY: academicY + 5,
        head: [['Indicateur', 'Valeur']],
        body: [
            ['Taux de Réussite Global', data.academic.successRate],
            ['Nombre d\'Élèves', data.academic.totalStudents.toString()],
            ['Moyenne Générale', data.academic.averageGrade],
            ['Élèves en Difficulté', data.academic.failingStudents.toString()]
        ],
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] }
    });

    // --- Section Opérationnelle ---
    const operationalY = (doc as any).lastAutoTable.finalY + 15;
    doc.text("3. Efficacité Opérationnelle", margin, operationalY);

    (doc as any).autoTable({
        startY: operationalY + 5,
        head: [['Indicateur', 'Valeur']],
        body: [
            ['Présence Élèves', data.operational.attendanceRate],
            ['Présence Enseignants', data.operational.teacherAttendance],
            ['Total Heures Profs', data.operational.teacherHours || "0h"],
            ['Total Inscriptions', data.operational.enrollments.toString()],
            ['Taux d\'Abandon', data.operational.dropoutRate]
        ],
        theme: 'striped',
        headStyles: { fillColor: [245, 158, 11] }
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
            `Page ${i} de ${pageCount} - SchoolFlow PRO`,
            pageWidth / 2,
            doc.internal.pageSize.height - 10,
            { align: "center" }
        );
    }

    doc.save(`Rapport_Direction_${formatDate(new Date(), "yyyyMMdd")}.pdf`);
}
