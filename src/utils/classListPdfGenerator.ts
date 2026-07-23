import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface Student {
    id: string;
    first_name: string;
    last_name: string;
    registration_number?: string | null;
    email?: string | null;
}

interface ClassroomData {
    name: string;
    capacity?: number | null;
    level?: { name: string } | null;
    campus?: { name: string } | null;
    students: Student[];
}

export function generateClassListPdf(classroom: ClassroomData, tenantName: string): void {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 14;

    // === HEADER ===
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(tenantName.toUpperCase(), margin, 20);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text("LISTE DE CLASSE", pageWidth - margin, 20, { align: "right" });

    // Classroom info box
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, 28, pageWidth - 2 * margin, 20, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, 28, pageWidth - 2 * margin, 20, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text(classroom.name, margin + 4, 37);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    const meta: string[] = [];
    if (classroom.level?.name) meta.push(`Niveau: ${classroom.level.name}`);
    if (classroom.campus?.name) meta.push(`Campus: ${classroom.campus.name}`);
    meta.push(`Effectif: ${classroom.students.length}${classroom.capacity ? ` / ${classroom.capacity}` : ""}`);
    doc.text(meta.join("   •   "), margin + 4, 44);

    // Date line
    const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(`Édité le ${today}`, pageWidth - margin, 44, { align: "right" });

    // === STUDENT TABLE ===
    const tableBody = classroom.students.map((student, index) => [
        (index + 1).toString(),
        student.registration_number || "—",
        student.last_name.toUpperCase(),
        student.first_name,
        student.email || "—",
        "", // Signature column
    ]);

    autoTable(doc, {
        startY: 56,
        head: [["N°", "N° Étudiant", "Nom", "Prénom", "Email", "Émargement"]],
        body: tableBody,
        theme: "grid",
        headStyles: {
            fillColor: [30, 41, 59],
            fontSize: 8,
            fontStyle: "bold",
            halign: "center",
            textColor: [255, 255, 255],
            cellPadding: 3,
        },
        columnStyles: {
            0: { cellWidth: 12, halign: "center" },
            1: { cellWidth: 28, halign: "center" },
            2: { cellWidth: 38 },
            3: { cellWidth: 35 },
            4: { cellWidth: "auto" },
            5: { cellWidth: 28 },
        },
        styles: {
            fontSize: 8,
            cellPadding: 3,
            lineWidth: 0.1,
            lineColor: [220, 220, 220],
        },
        alternateRowStyles: {
            fillColor: [252, 252, 252],
        },
        margin: { left: margin, right: margin },
    });

    // === FOOTER ===
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(180, 180, 180);
        doc.text(
            `Document généré par ${tenantName || "Mon Établissement"} - Logiciel de gestion scolaire cloud`,
            pageWidth / 2,
            pageHeight - 10,
            { align: "center" }
        );
        doc.text(`Page ${i} / ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
    }

    const fileName = `liste_classe_${classroom.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    doc.save(fileName);
}
