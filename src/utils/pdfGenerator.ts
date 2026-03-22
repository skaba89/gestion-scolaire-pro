import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const generateReportCard = (
    student: any,
    classroom: any,
    term: any,
    assessments: any[],
    tenant: any
) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(50, 50, 50);
    doc.text(tenant?.name || 'Établissement Scolaire', 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Bulletin de Notes : ${term?.name || 'Trimestre'}`, 14, 30);
    doc.text(`Élève : ${student?.first_name} ${student?.last_name}`, 14, 38);
    doc.text(`Classe : ${classroom?.name}`, 14, 46);
    doc.text(`Date d'édition : ${format(new Date(), 'dd MMMM yyyy', { locale: fr })}`, 14, 54);

    // Table Data
    const tableData = assessments.map(a => [
        a.subjects?.name || 'N/A',
        a.type || 'N/A',
        a.weight || 1,
        `${a.score || 0} / ${a.max_score || 20}`,
        a.description || ''
    ]);

    (doc as any).autoTable({
        startY: 65,
        head: [['Matière', 'Type', 'Coef.', 'Note', 'Appréciation']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        styles: { font: 'helvetica', fontSize: 10 },
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY || 65;
    doc.setFontSize(10);
    doc.text('Le Directeur', 14, finalY + 20);
    doc.text('Signature et Cachet', 14, finalY + 30);

    // Save the PDF
    doc.save(`Bulletin_${student?.first_name}_${student?.last_name}_${term?.name || 'T1'}.pdf`);
};
