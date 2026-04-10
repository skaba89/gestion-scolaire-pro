import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { formatPdfCurrency, formatNumber, safeFormatDate } from "./formatters";

interface InvoiceItem {
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
}

interface InvoiceData {
    invoice_number: string;
    created_at: string;
    due_date?: string | null;
    status: string;
    total_amount: number;
    invoice_items: InvoiceItem[];
    has_payment_plan?: boolean;
    installments_count?: number;
    schedules?: any[];
    student?: {
        first_name: string;
        last_name: string;
        registration_number?: string;
        matricule?: string;
    };
}

interface TenantData {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    settings?: {
        currency?: string;
        bankName?: string;
        bankAccount?: string;
        bankIBAN?: string;
        invoiceFooter?: string;
    };
}

/**
 * Valide les données d'une facture
 * @param invoice - Les données de la facture
 * @throws Error si des données obligatoires sont manquantes
 */
function validateInvoiceData(invoice: InvoiceData): void {
    if (!invoice.invoice_number) {
        throw new Error("Le numéro de facture est obligatoire");
    }
    if (!invoice.created_at) {
        throw new Error("La date de facture est obligatoire");
    }
    if (invoice.total_amount === undefined || invoice.total_amount === null) {
        throw new Error("Le montant total est obligatoire");
    }
}

/**
 * Génère une facture professionnelle au format PDF
 */
export function generateInvoicePDF(invoice: InvoiceData, tenant: TenantData): jsPDF {
    // Validation des données
    validateInvoiceData(invoice);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 14;

    const currency = tenant.settings?.currency || "XOF";
    const student = invoice.student;

    // === EN-TÊTE ===
    // Émetteur (gauche)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(51, 65, 85);
    doc.text(tenant.name.toUpperCase(), margin, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);

    let issuerY = 26;
    if (tenant.address) {
        const addrLines = doc.splitTextToSize(tenant.address, 80);
        doc.text(addrLines, margin, issuerY);
        issuerY += addrLines.length * 4.5;
    }
    if (tenant.phone) {
        doc.text(`Tél: ${tenant.phone}`, margin, issuerY);
        issuerY += 4.5;
    }
    if (tenant.email) {
        doc.text(`Email: ${tenant.email}`, margin, issuerY);
    }

    // Facture Info (droite)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text("FACTURE", pageWidth - margin, 20, { align: "right" });

    // Status Badge
    const status = invoice.status || 'PENDING';
    let statusText = 'IMPAYÉ';
    let statusColor: [number, number, number] = [220, 38, 38]; // Red

    if (status === 'PAID') {
        statusText = 'PAYÉ';
        statusColor = [34, 197, 94]; // Green
    } else if (status === 'PARTIAL') {
        statusText = 'PARTIEL';
        statusColor = [234, 179, 8]; // Yellow
    } else if (status === 'OVERDUE') {
        statusText = 'EN RETARD';
        statusColor = [239, 68, 68]; // Red
    }

    doc.setFillColor(...statusColor);
    doc.roundedRect(pageWidth - margin - 36, 25, 36, 8, 1, 1, 'F');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(statusText, pageWidth - margin - 18, 30.5, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(`N°: ${invoice.invoice_number}`, pageWidth - margin, 40, { align: "right" });
    doc.text(`Date: ${safeFormatDate(invoice.created_at)}`, pageWidth - margin, 46, { align: "right" });
    if (invoice.due_date) {
        doc.text(`Échéance: ${safeFormatDate(invoice.due_date)}`, pageWidth - margin, 52, { align: "right" });
    }

    // === DESTINATAIRE ===
    let startY = 65;
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, startY, 90, 25, "F");

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("DESTINATAIRE :", margin + 4, startY + 6);

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");

    let recipientName = "Client";
    if (student) {
        recipientName = `${student.first_name || ''} ${student.last_name || ''}`;
    }
    doc.text(recipientName, margin + 4, startY + 13);

    if (student?.registration_number || student?.matricule) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(`N° Étudiant: ${student.registration_number || student.matricule || ""}`, margin + 4, startY + 18);
    }

    // === TABLEAU DES ARTICLES ===
    startY += 35;
    const items = invoice.invoice_items || [];
    const tableBody = items.map((item: any) => [
        item.description || "Article",
        item.quantity || 1,
        formatPdfCurrency(item.unit_price || 0, currency),
        formatPdfCurrency(item.amount || 0, currency)
    ]);

    if (items.length === 0 && invoice.total_amount) {
        tableBody.push([
            "Frais de scolarité (Global)",
            1,
            formatPdfCurrency(invoice.total_amount, currency),
            formatPdfCurrency(invoice.total_amount, currency)
        ]);
    }

    (doc as any).autoTable({
        startY: startY,
        head: [['DESCRIPTION', 'QTÉ', 'PRIX UNITAIRE', 'TOTAL']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
            fillColor: [30, 41, 59],
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center',
            textColor: [255, 255, 255],
            cellPadding: 3
        },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 20, halign: 'center' },
            2: { cellWidth: 40, halign: 'right' },
            3: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
        },
        styles: {
            fontSize: 9,
            cellPadding: 3,
            lineWidth: 0.1,
            lineColor: [220, 220, 220],
        },
        alternateRowStyles: {
            fillColor: [252, 252, 252]
        },
        margin: { left: margin, right: margin }
    });

    // === ÉCHÉANCIER DE PAIEMENT ===
    let finalTableY = (doc as any).lastAutoTable?.finalY || startY + 20;

    if (invoice.has_payment_plan && invoice.schedules && invoice.schedules.length > 0) {
        finalTableY += 15;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.text("ÉCHÉANCIER DE PAIEMENT", margin, finalTableY);

        const scheduleBody = invoice.schedules.map((s: any) => [
            `Échéance n°${s.installment_number}`,
            safeFormatDate(s.due_date),
            formatPdfCurrency(s.amount, currency),
            s.status === 'PAID' ? 'PAYÉ' : 'EN ATTENTE'
        ]);

        (doc as any).autoTable({
            startY: finalTableY + 5,
            head: [['N°', 'DATE LIMITE', 'MONTANT', 'STATUT']],
            body: scheduleBody,
            theme: 'striped',
            headStyles: {
                fillColor: [71, 85, 105],
                fontSize: 8,
                halign: 'center'
            },
            styles: { fontSize: 8 },
            columnStyles: {
                1: { halign: 'center' },
                2: { halign: 'right', fontStyle: 'bold' },
                3: { halign: 'center' }
            },
            margin: { left: margin, right: margin }
        });

        finalTableY = (doc as any).lastAutoTable.finalY;
    }

    // === TOTAUX ===
    const totalsX = pageWidth - margin - 80;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("TOTAL HT:", totalsX, finalTableY + 12);
    doc.setTextColor(0, 0, 0);
    doc.text(formatPdfCurrency(invoice.total_amount || 0, currency), pageWidth - margin, finalTableY + 12, { align: 'right' });

    doc.setDrawColor(226, 232, 240);
    doc.line(totalsX, finalTableY + 16, pageWidth - margin, finalTableY + 16);

    // Total TTC (encadré)
    doc.setFillColor(30, 41, 59);
    doc.rect(totalsX, finalTableY + 20, 80, 12, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text("TOTAL TTC", totalsX + 4, finalTableY + 28);
    doc.text(formatPdfCurrency(invoice.total_amount || 0, currency), pageWidth - margin - 4, finalTableY + 28, { align: 'right' });

    // === COORDONNÉES BANCAIRES ===
    if (tenant.settings?.bankName || tenant.settings?.bankAccount) {
        let bankY = finalTableY + 45;
        // Adjust if it goes off page
        if (bankY + 20 > pageHeight) {
            doc.addPage();
            bankY = 20;
        }

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.setFont("helvetica", "bold");
        doc.text("COORDONNÉES BANCAIRES :", margin, bankY);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        bankY += 6;
        let bankInfo = `Banque: ${tenant.settings.bankName || 'N/A'}`;
        if (tenant.settings.bankAccount) bankInfo += ` | Compte: ${tenant.settings.bankAccount}`;
        doc.text(bankInfo, margin, bankY);
        if (tenant.settings.bankIBAN) {
            bankY += 5;
            doc.text(`IBAN: ${tenant.settings.bankIBAN}`, margin, bankY);
        }
    }

    // === FOOTER ===
    const footerY = pageHeight - 30;
    if (tenant.settings?.invoiceFooter) {
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        const splitFooter = doc.splitTextToSize(tenant.settings.invoiceFooter, pageWidth - 2 * margin);
        doc.text(splitFooter, margin, footerY);
    }

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text("Document généré par SchoolFlow PRO - Logiciel de gestion scolaire cloud", pageWidth / 2, pageHeight - 10, { align: "center" });

    return doc;
}
