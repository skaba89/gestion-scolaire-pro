import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { formatPdfCurrency, formatNumber, safeFormatDate } from "./formatters";

/**
 * Valide les données d'un contrat
 * @param contract - Les données du contrat
 * @throws Error si des données obligatoires sont manquantes
 */
function validateContractData(contract: ContractData): void {
    if (!contract.contract_number) {
        throw new Error("Le numéro de contrat est obligatoire");
    }
    if (!contract.job_title) {
        throw new Error("Le poste est obligatoire");
    }
    if (!contract.start_date) {
        throw new Error("La date de début est obligatoire");
    }
    if (!contract.gross_monthly_salary || contract.gross_monthly_salary <= 0) {
        throw new Error("Le salaire brut mensuel doit être supérieur à 0");
    }
    if (!contract.weekly_hours || contract.weekly_hours <= 0) {
        throw new Error("Les heures hebdomadaires doivent être supérieures à 0");
    }
}

interface ContractData {
    contract_number: string;
    contract_type: string;
    job_title: string;
    start_date: string;
    end_date?: string | null;
    trial_period_end?: string | null;
    gross_monthly_salary: number;
    weekly_hours: number;
    notes?: string | null;
    employee?: {
        first_name: string;
        last_name: string;
        employee_number?: string;
        address?: string;
    };
}

interface TenantData {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    settings?: {
        currency?: string;
        urssafNumber?: string;
        conventionCollective?: string;
        bankName?: string;
        bankAccount?: string;
        bankIBAN?: string;
    };
}

/**
 * Génère un contrat de travail CDI professionnel au format PDF
 */
export function generateCDIContract(contract: ContractData, tenant: TenantData): jsPDF {
    // Validation des données
    validateContractData(contract);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 14;
    const lineHeight = 6;
    let y = 20;

    const currency = tenant.settings?.currency || "XOF";
    const employee = contract.employee;

    // === EN-TÊTE ===
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(51, 65, 85);
    doc.text(tenant.name.toUpperCase(), margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    if (tenant.address) {
        const addressLines = doc.splitTextToSize(tenant.address, pageWidth - 2 * margin);
        doc.text(addressLines, margin, y);
        y += addressLines.length * 4;
    }
    if (tenant.settings?.urssafNumber) {
        doc.text(`N° URSSAF: ${tenant.settings.urssafNumber}`, margin, y);
        y += 4;
    }
    y += 5;

    // === TITRE ===
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("CONTRAT DE TRAVAIL", pageWidth / 2, y, { align: "center" });
    y += 6;
    doc.text("À DURÉE INDÉTERMINÉE", pageWidth / 2, y, { align: "center" });
    y += 10;

    // === PARTIES CONTRACTANTES ===
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    // Employeur
    const employerText = `Entre la société « ${tenant.name}, ${tenant.address || ''} »${tenant.settings?.urssafNumber ? ` immatriculée à l'Urssaf sous le numéro « ${tenant.settings.urssafNumber} »` : ''
        }, ci-après dénommée « l'entreprise »,`;
    const employerLines = doc.splitTextToSize(employerText, pageWidth - 2 * margin);
    doc.text(employerLines, margin, y);
    y += employerLines.length * lineHeight;
    y += 3;

    doc.setFont("helvetica", "italic");
    doc.text("d'une part,", margin, y);
    y += 8;

    // Salarié
    doc.setFont("helvetica", "normal");
    const employeeText = `et ${employee?.first_name || ''} ${employee?.last_name || ''}${employee?.address ? `, ${employee.address}` : ''
        }, ci-après dénommé « le salarié » :`;
    const employeeLines = doc.splitTextToSize(employeeText, pageWidth - 2 * margin);
    doc.text(employeeLines, margin, y);
    y += employeeLines.length * lineHeight;
    y += 3;

    doc.setFont("helvetica", "italic");
    doc.text("d'autre part,", margin, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.text("Il est convenu ce qui suit :", margin, y);
    y += 10;

    // === ARTICLE 1 : OBJET DU CONTRAT ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 1 : Objet du contrat",
        `Le salarié est recruté par l'entreprise en qualité de « ${contract.job_title} ».${tenant.settings?.conventionCollective
            ? ` Le présent contrat est soumis à la convention collective « ${tenant.settings.conventionCollective} ».`
            : ''
        }`
    );

    // === ARTICLE 2 : LIEU DE TRAVAIL ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 2 : Lieu de travail",
        `Le salarié exercera ses fonctions dans l'établissement situé au ${tenant.address || '[adresse]'}.`
    );

    // === ARTICLE 3 : DATE D'EMBAUCHE ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 3 : Date d'embauche",
        `Le présent contrat prend effet le ${safeFormatDate(contract.start_date)} et est conclu pour une durée indéterminée.`
    );

    // === ARTICLE 4 : PÉRIODE D'ESSAI ===
    const trialText = contract.trial_period_end
        ? `Le présent contrat prévoit une période d'essai jusqu'au ${safeFormatDate(contract.trial_period_end)}. Il peut être mis fin à cette période d'essai à l'initiative de l'employeur ou du salarié en respectant un délai de prévenance conformément aux dispositions légales et conventionnelles en vigueur.`
        : `Le présent contrat ne prévoit pas de période d'essai.`;

    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 4 : Période d'essai",
        trialText
    );

    // Nouvelle page si nécessaire
    if (y > pageHeight - 40) {
        doc.addPage();
        y = 20;
    }

    // === ARTICLE 5 : DURÉE DU TRAVAIL ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 5 : Durée du travail",
        `Le salarié exercera ses fonctions dans le cadre d'un contrat de travail à temps complet. La durée hebdomadaire de travail sera de ${contract.weekly_hours} heures. Le salarié est assujetti à l'horaire collectif applicable au sein de l'entreprise.`
    );

    // === ARTICLE 6 : RÉMUNÉRATION ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 6 : Rémunération",
        `En contrepartie de son travail, le salarié percevra une rémunération mensuelle brute de ${formatPdfCurrency(contract.gross_monthly_salary, currency)}.`
    );

    // === ARTICLE 7 : CONGÉS PAYÉS ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 7 : Congés payés",
        `Le salarié bénéficiera de congés payés selon les conditions fixées par les dispositions légales et conventionnelles applicables. À l'issue du présent contrat, les congés payés non pris donneront lieu au versement d'une indemnité compensatrice de congés payés.`
    );

    // === ARTICLE 8 : SÉCURITÉ SOCIALE, RETRAITE ET PRÉVOYANCE ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 8 : Sécurité sociale, retraite et prévoyance",
        `Le salarié bénéficiera du régime de sécurité sociale, de retraite complémentaire et de prévoyance applicable au sein de l'entreprise conformément aux dispositions légales et conventionnelles en vigueur.`
    );

    // === ARTICLE 9 : CONVENTION COLLECTIVE ===
    const conventionText = tenant.settings?.conventionCollective
        ? `La convention collective applicable au salarié est la suivante : ${tenant.settings.conventionCollective}.`
        : `Le salarié bénéficie des dispositions de la convention collective applicable au sein de l'entreprise.`;

    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 9 : Convention collective",
        conventionText
    );

    // Nouvelle page si nécessaire pour les signatures
    if (y > pageHeight - 60) {
        doc.addPage();
        y = 20;
    }

    // === NOTES ADDITIONNELLES ===
    if (contract.notes) {
        y += 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Notes additionnelles :", margin, y);
        y += 6;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const notesLines = doc.splitTextToSize(contract.notes, pageWidth - 2 * margin);
        doc.text(notesLines, margin, y);
        y += notesLines.length * 4 + 5;
    }

    // === LIEU, DATE ET SIGNATURES ===
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Fait à _____________, le ${safeFormatDate(new Date().toISOString())},`, margin, y);
    y += 6;
    doc.text("en deux exemplaires dont un est remis au salarié et l'autre à l'entreprise.", margin, y);
    y += 15;

    // Signatures
    const col1X = margin;
    const col2X = pageWidth / 2 + 10;

    doc.setFont("helvetica", "bold");
    doc.text("L'Entreprise", col1X, y);
    doc.text("Le Salarié", col2X, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(tenant.name, col1X, y);
    if (employee) {
        doc.text(`${employee.first_name} ${employee.last_name}`, col2X, y);
    }
    y += 15;

    doc.text("Signature :", col1X, y);
    doc.text("Signature :", col2X, y);

    // === FOOTER ===
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Document généré par SchoolFlow PRO - Logiciel de gestion scolaire", pageWidth / 2, pageHeight - 10, { align: "center" });
    doc.text(`Contrat N° ${contract.contract_number}`, pageWidth / 2, pageHeight - 6, { align: "center" });

    return doc;
}

/**
 * Génère un contrat de travail CDD professionnel au format PDF
 */
export function generateCDDContract(contract: ContractData, tenant: TenantData): jsPDF {
    // Validation des données
    validateContractData(contract);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 14;
    const lineHeight = 6;
    let y = 20;

    const currency = tenant.settings?.currency || "XOF";
    const employee = contract.employee;

    // === EN-TÊTE ===
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(51, 65, 85);
    doc.text(tenant.name.toUpperCase(), margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    if (tenant.address) {
        const addressLines = doc.splitTextToSize(tenant.address, pageWidth - 2 * margin);
        doc.text(addressLines, margin, y);
        y += addressLines.length * 4;
    }
    if (tenant.settings?.urssafNumber) {
        doc.text(`N° URSSAF: ${tenant.settings.urssafNumber}`, margin, y);
        y += 4;
    }
    y += 5;

    // === TITRE ===
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("CONTRAT DE TRAVAIL", pageWidth / 2, y, { align: "center" });
    y += 6;
    doc.text("À DURÉE DÉTERMINÉE", pageWidth / 2, y, { align: "center" });
    y += 10;

    // === PARTIES CONTRACTANTES ===
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    // Employeur
    const employerText = `Entre la société « ${tenant.name}, ${tenant.address || ''} »${tenant.settings?.urssafNumber ? ` immatriculée à l'Urssaf sous le numéro « ${tenant.settings.urssafNumber} »` : ''
        }, ci-après dénommée « l'entreprise »,`;
    const employerLines = doc.splitTextToSize(employerText, pageWidth - 2 * margin);
    doc.text(employerLines, margin, y);
    y += employerLines.length * lineHeight;
    y += 3;

    doc.setFont("helvetica", "italic");
    doc.text("d'une part,", margin, y);
    y += 8;

    // Salarié
    doc.setFont("helvetica", "normal");
    const employeeText = `et ${employee?.first_name || ''} ${employee?.last_name || ''}${employee?.address ? `, ${employee.address}` : ''
        }, ci-après dénommé « le salarié » :`;
    const employeeLines = doc.splitTextToSize(employeeText, pageWidth - 2 * margin);
    doc.text(employeeLines, margin, y);
    y += employeeLines.length * lineHeight;
    y += 3;

    doc.setFont("helvetica", "italic");
    doc.text("d'autre part,", margin, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.text("Il est convenu ce qui suit :", margin, y);
    y += 10;

    // === ARTICLE 1 : OBJET DU CONTRAT ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 1 : Objet du contrat",
        `Le salarié est recruté par l'entreprise en qualité de « ${contract.job_title} ».${tenant.settings?.conventionCollective
            ? ` Le présent contrat est soumis à la convention collective « ${tenant.settings.conventionCollective} ».`
            : ''
        }`
    );

    // === ARTICLE 2 : LIEU DE TRAVAIL ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 2 : Lieu de travail",
        `Le salarié exercera ses fonctions dans l'établissement situé au ${tenant.address || '[adresse]'}.`
    );

    // === ARTICLE 3 : DURÉE DU CONTRAT ===
    const endDateText = contract.end_date
        ? safeFormatDate(contract.end_date, '[date de fin]')
        : '[date de fin]';

    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 3 : Durée du contrat",
        `Le présent contrat prend effet le ${safeFormatDate(contract.start_date)} et est conclu pour une durée déterminée jusqu'au ${endDateText}.`
    );

    // === ARTICLE 4 : PÉRIODE D'ESSAI ===
    const trialText = contract.trial_period_end
        ? `Le présent contrat prévoit une période d'essai jusqu'au ${format(new Date(contract.trial_period_end), "dd MMMM yyyy", { locale: fr })}. Il peut être mis fin à cette période d'essai à l'initiative de l'employeur ou du salarié en respectant un délai de prévenance conformément aux dispositions légales et conventionnelles en vigueur.`
        : `Le présent contrat ne prévoit pas de période d'essai.`;

    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 4 : Période d'essai",
        trialText
    );

    // Nouvelle page si nécessaire
    if (y > pageHeight - 40) {
        doc.addPage();
        y = 20;
    }

    // === ARTICLE 5 : DURÉE DU TRAVAIL ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 5 : Durée du travail",
        `Le salarié exercera ses fonctions dans le cadre d'un contrat de travail à temps complet. La durée hebdomadaire de travail sera de ${contract.weekly_hours} heures. Le salarié est assujetti à l'horaire collectif applicable au sein de l'entreprise.`
    );

    // === ARTICLE 6 : RÉMUNÉRATION ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 6 : Rémunération",
        `En contrepartie de son travail, le salarié percevra une rémunération mensuelle brute de ${formatPdfCurrency(contract.gross_monthly_salary, currency)}.`
    );

    // === ARTICLE 7 : CONGÉS PAYÉS ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 7 : Congés payés",
        `Le salarié bénéficiera de congés payés selon les conditions fixées par les dispositions légales et conventionnelles applicables. À l'issue du présent contrat, les congés payés non pris donneront lieu au versement d'une indemnité compensatrice de congés payés.`
    );

    // === ARTICLE 8 : SÉCURITÉ SOCIALE, RETRAITE ET PRÉVOYANCE ===
    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 8 : Sécurité sociale, retraite et prévoyance",
        `Le salarié bénéficiera du régime de sécurité sociale, de retraite complémentaire et de prévoyance applicable au sein de l'entreprise conformément aux dispositions légales et conventionnelles en vigueur.`
    );

    // === ARTICLE 9 : CONVENTION COLLECTIVE ===
    const conventionText = tenant.settings?.conventionCollective
        ? `La convention collective applicable au salarié est la suivante : ${tenant.settings.conventionCollective}.`
        : `Le salarié bénéficie des dispositions de la convention collective applicable au sein de l'entreprise.`;

    y = addArticle(doc, y, pageWidth, margin, lineHeight,
        "Article 9 : Convention collective",
        conventionText
    );

    // Nouvelle page si nécessaire pour les signatures
    if (y > pageHeight - 60) {
        doc.addPage();
        y = 20;
    }

    // === NOTES ADDITIONNELLES ===
    if (contract.notes) {
        y += 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Notes additionnelles :", margin, y);
        y += 6;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const notesLines = doc.splitTextToSize(contract.notes, pageWidth - 2 * margin);
        doc.text(notesLines, margin, y);
        y += notesLines.length * 4 + 5;
    }

    // === LIEU, DATE ET SIGNATURES ===
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Fait à _____________, le ${format(new Date(), "dd MMMM yyyy", { locale: fr })},`, margin, y);
    y += 6;
    doc.text("en deux exemplaires dont un est remis au salarié et l'autre à l'entreprise.", margin, y);
    y += 15;

    // Signatures
    const col1X = margin;
    const col2X = pageWidth / 2 + 10;

    doc.setFont("helvetica", "bold");
    doc.text("L'Entreprise", col1X, y);
    doc.text("Le Salarié", col2X, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(tenant.name, col1X, y);
    if (employee) {
        doc.text(`${employee.first_name} ${employee.last_name}`, col2X, y);
    }
    y += 15;

    doc.text("Signature :", col1X, y);
    doc.text("Signature :", col2X, y);

    // === FOOTER ===
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Document généré par SchoolFlow PRO - Logiciel de gestion scolaire", pageWidth / 2, pageHeight - 10, { align: "center" });
    doc.text(`Contrat N° ${contract.contract_number}`, pageWidth / 2, pageHeight - 6, { align: "center" });

    return doc;
}

/**
 * Fonction utilitaire pour ajouter un article au PDF
 */
function addArticle(
    doc: jsPDF,
    startY: number,
    pageWidth: number,
    margin: number,
    lineHeight: number,
    title: string,
    content: string
): number {
    let y = startY;
    const pageHeight = doc.internal.pageSize.height;

    // Vérifier si on a besoin d'une nouvelle page
    if (y > pageHeight - 50) {
        doc.addPage();
        y = 20;
    }

    // Titre de l'article
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(title, margin, y);
    y += lineHeight + 1;

    // Contenu de l'article
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const contentLines = doc.splitTextToSize(content, pageWidth - 2 * margin);
    doc.text(contentLines, margin, y);
    y += contentLines.length * 4.5 + 6;

    return y;
}
