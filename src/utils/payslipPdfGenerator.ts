import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { formatPdfCurrency, formatNumber, safeFormatDate } from "./formatters";

/**
 * Valide les données d'une fiche de paie
 * @param payslip - Les données de la fiche de paie
 * @throws Error si des données obligatoires sont manquantes
 */
function validatePayslipData(payslip: PayslipData): void {
    if (!payslip.period_month || payslip.period_month < 1 || payslip.period_month > 12) {
        throw new Error("Le mois de la période doit être entre 1 et 12");
    }
    if (!payslip.period_year || payslip.period_year < 2000) {
        throw new Error("L'année de la période est invalide");
    }
    if (!payslip.gross_salary || payslip.gross_salary <= 0) {
        throw new Error("Le salaire brut doit être supérieur à 0");
    }
    if (!payslip.net_salary || payslip.net_salary <= 0) {
        throw new Error("Le salaire net doit être supérieur à 0");
    }
    if (payslip.net_salary > payslip.gross_salary) {
        throw new Error("Le salaire net ne peut pas être supérieur au salaire brut");
    }
}

interface PayslipData {
    period_month: number;
    period_year: number;
    gross_salary: number;
    net_salary: number;
    pay_date?: string | null;
    hours_worked?: number;
    hourly_rate?: number;
    income_tax_rate?: number;
    income_tax_amount?: number;
    employee?: {
        first_name: string;
        last_name: string;
        employee_number?: string;
        job_title?: string;
        social_security_number?: string;
    };
}

interface TenantData {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    settings?: {
        currency?: string;
        country?: string;
        siretNumber?: string;
        urssafNumber?: string;
        nafCode?: string;
        conventionCollective?: string;
    };
}

interface SocialContribution {
    label: string;
    base: number;
    employeeRate: number;
    employeeAmount: number;
    employerRate: number;
    employerAmount: number;
}

interface ContributionFamily {
    name: string;
    contributions: SocialContribution[];
}

/**
 * Configuration des cotisations sociales par pays
 */
const COUNTRY_CONFIGS: Record<string, any> = {
    FR: {
        name: "France",
        families: [
            {
                name: "SANTÉ",
                contributions: [
                    { label: "Sécurité sociale - Maladie", employeeRate: 0.0075, employerRate: 0.07 },
                    { label: "Complémentaire santé", employeeRate: 0.015, employerRate: 0.015 },
                ]
            },
            {
                name: "ACCIDENTS DU TRAVAIL",
                contributions: [
                    { label: "AT/MP", employeeRate: 0, employerRate: 0.005 },
                ]
            },
            {
                name: "RETRAITE",
                contributions: [
                    { label: "Retraite de base", employeeRate: 0.069, employerRate: 0.0855 },
                    { label: "Retraite complémentaire", employeeRate: 0.0315, employerRate: 0.0472 },
                ]
            },
            {
                name: "FAMILLE",
                contributions: [
                    { label: "Allocations familiales", employeeRate: 0, employerRate: 0.0345 },
                ]
            },
            {
                name: "ASSURANCE CHÔMAGE",
                contributions: [
                    { label: "Chômage", employeeRate: 0, employerRate: 0.0405 },
                ]
            }
        ],
        hasIncomeTax: true,
        taxLabel: "Prélèvement à la source",
        netBeforeTaxLabel: "Net à payer avant impôt",
        netPayLabel: "Net à payer au salarié",
        netSocialLabel: "Montant net social",
        netTaxableLabel: "Montant net imposable",
    },
    SN: {
        name: "Sénégal",
        families: [
            {
                name: "SÉCURITÉ SOCIALE",
                contributions: [
                    { label: "IPRES (Retraite)", employeeRate: 0.056, employerRate: 0.084 },
                    { label: "IPM (Maladie)", employeeRate: 0, employerRate: 0.07 },
                ]
            },
            {
                name: "PRESTATIONS FAMILIALES",
                contributions: [
                    { label: "Allocations familiales", employeeRate: 0, employerRate: 0.07 },
                ]
            },
            {
                name: "ACCIDENTS DU TRAVAIL",
                contributions: [
                    { label: "AT/MP", employeeRate: 0, employerRate: 0.01 },
                ]
            }
        ],
        hasIncomeTax: true,
        taxLabel: "Impôt sur le revenu (IRPP)",
        netBeforeTaxLabel: "Net avant impôt",
        netPayLabel: "Net à payer",
        netSocialLabel: "Net social",
        netTaxableLabel: "Net imposable",
    },
    CI: {
        name: "Côte d'Ivoire",
        families: [
            {
                name: "SÉCURITÉ SOCIALE",
                contributions: [
                    { label: "CNPS - Retraite", employeeRate: 0.068, employerRate: 0.077 },
                    { label: "CNPS - Prestations familiales", employeeRate: 0, employerRate: 0.055 },
                ]
            },
            {
                name: "ACCIDENTS DU TRAVAIL",
                contributions: [
                    { label: "AT/MP", employeeRate: 0, employerRate: 0.02 },
                ]
            }
        ],
        hasIncomeTax: true,
        taxLabel: "Impôt sur les traitements et salaires (ITS)",
        netBeforeTaxLabel: "Net avant impôt",
        netPayLabel: "Net à payer",
        netSocialLabel: "Net social",
        netTaxableLabel: "Net imposable",
    },
    DEFAULT: {
        name: "Standard",
        families: [
            {
                name: "COTISATIONS SOCIALES",
                contributions: [
                    { label: "Sécurité sociale", employeeRate: 0.05, employerRate: 0.10 },
                    { label: "Retraite", employeeRate: 0.05, employerRate: 0.08 },
                ]
            }
        ],
        hasIncomeTax: false,
        netPayLabel: "Net à payer",
    }
};

/**
 * Calcule les cotisations sociales selon le pays
 */
function calculateContributions(
    grossSalary: number,
    countryCode: string
): { families: ContributionFamily[], totalEmployee: number, totalEmployer: number } {
    const config = COUNTRY_CONFIGS[countryCode] || COUNTRY_CONFIGS.DEFAULT;
    const families: ContributionFamily[] = [];
    let totalEmployee = 0;
    let totalEmployer = 0;

    for (const family of config.families) {
        const contributions: SocialContribution[] = [];

        for (const contrib of family.contributions) {
            const employeeAmount = grossSalary * contrib.employeeRate;
            const employerAmount = grossSalary * contrib.employerRate;

            contributions.push({
                label: contrib.label,
                base: grossSalary,
                employeeRate: contrib.employeeRate,
                employeeAmount,
                employerRate: contrib.employerRate,
                employerAmount,
            });

            totalEmployee += employeeAmount;
            totalEmployer += employerAmount;
        }

        families.push({
            name: family.name,
            contributions,
        });
    }

    return { families, totalEmployee, totalEmployer };
}

/**
 * Génère une fiche de paie professionnelle au format PDF
 */
export function generatePayslipPDF(payslip: PayslipData, tenant: TenantData): jsPDF {
    // Validation des données
    validatePayslipData(payslip);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 14;

    const currency = tenant.settings?.currency || "€";
    const countryCode = tenant.settings?.country || "FR";
    const config = COUNTRY_CONFIGS[countryCode] || COUNTRY_CONFIGS.DEFAULT;
    const employee = payslip.employee;

    const months = [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ];

    // === EN-TÊTE ===
    // Employeur (gauche)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85);
    doc.text("EMPLOYEUR", margin, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(tenant.name, margin, 21);

    if (tenant.address) {
        const addrLines = doc.splitTextToSize(tenant.address, 80);
        doc.text(addrLines, margin, 26);
    }

    let employerY = 26 + (tenant.address ? 8 : 0);
    if (tenant.settings?.siretNumber) {
        doc.text(`SIRET: ${tenant.settings.siretNumber}`, margin, employerY);
        employerY += 4;
    }
    if (tenant.settings?.nafCode) {
        doc.text(`NAF: ${tenant.settings.nafCode}`, margin, employerY);
    }

    // Salarié (droite)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85);
    doc.text("SALARIÉ", pageWidth - margin, 15, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    if (employee) {
        doc.text(`${employee.first_name} ${employee.last_name}`, pageWidth - margin, 21, { align: "right" });

        let employeeY = 26;
        if (employee.employee_number) {
            doc.text(`Matricule: ${employee.employee_number}`, pageWidth - margin, employeeY, { align: "right" });
            employeeY += 4;
        }
        if (employee.job_title) {
            doc.text(`Emploi: ${employee.job_title}`, pageWidth - margin, employeeY, { align: "right" });
            employeeY += 4;
        }
        if (employee.social_security_number) {
            doc.text(`N° SS: ${employee.social_security_number}`, pageWidth - margin, employeeY, { align: "right" });
        }
    }

    // === TITRE ===
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text("BULLETIN DE PAIE", pageWidth / 2, 50, { align: "center" });

    // Période
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Période: ${months[payslip.period_month - 1]} ${payslip.period_year}`, pageWidth / 2, 58, { align: "center" });

    // Convention collective
    if (tenant.settings?.conventionCollective) {
        doc.setFontSize(8);
        doc.text(`Convention collective: ${tenant.settings.conventionCollective}`, pageWidth / 2, 63, { align: "center" });
    }

    // === INFORMATIONS DE PAIE ===
    let startY = 68;
    if (payslip.hours_worked && payslip.hourly_rate) {
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(`Heures travaillées: ${payslip.hours_worked}h`, margin, startY);
        doc.text(`Taux horaire: ${formatPdfCurrency(payslip.hourly_rate, currency)}`, pageWidth / 2, startY);
        startY += 8;
    } else {
        startY += 2;
    }

    // === TABLEAU DES COTISATIONS ===
    const { families, totalEmployee, totalEmployer } = calculateContributions(
        payslip.gross_salary,
        countryCode
    );

    const tableData: any[] = [];

    // Salaire de base
    tableData.push([
        { content: 'Salaire de base', styles: { fontStyle: 'bold' } },
        formatNumber(payslip.gross_salary),
        '-',
        formatPdfCurrency(payslip.gross_salary, currency),
        '-',
        '-'
    ]);
    tableData.push(['', '', '', '', '', '']); // Ligne vide

    // Cotisations par famille
    for (const family of families) {
        // En-tête de famille
        tableData.push([
            { content: family.name, styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
            { content: '', styles: { fillColor: [248, 250, 252] } },
            { content: '', styles: { fillColor: [248, 250, 252] } },
            { content: '', styles: { fillColor: [248, 250, 252] } },
            { content: '', styles: { fillColor: [248, 250, 252] } },
            { content: '', styles: { fillColor: [248, 250, 252] } }
        ]);

        // Cotisations de la famille
        for (const contrib of family.contributions) {
            tableData.push([
                contrib.label,
                formatNumber(contrib.base),
                contrib.employeeRate > 0 ? `${(contrib.employeeRate * 100).toFixed(2)}%` : '-',
                contrib.employeeAmount > 0 ? formatPdfCurrency(contrib.employeeAmount, currency) : '-',
                contrib.employerRate > 0 ? `${(contrib.employerRate * 100).toFixed(2)}%` : '-',
                contrib.employerAmount > 0 ? formatPdfCurrency(contrib.employerAmount, currency) : '-',
            ]);
        }
    }

    // Ligne vide
    tableData.push(['', '', '', '', '', '']);

    // Totaux
    tableData.push([
        { content: 'TOTAL BRUT', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: '', styles: { fillColor: [240, 240, 240] } },
        { content: '', styles: { fillColor: [240, 240, 240] } },
        { content: formatPdfCurrency(payslip.gross_salary, currency), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: '', styles: { fillColor: [240, 240, 240] } },
        { content: formatPdfCurrency(totalEmployer, currency), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
    ]);

    tableData.push([
        { content: 'TOTAL COTISATIONS', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: '', styles: { fillColor: [240, 240, 240] } },
        { content: '', styles: { fillColor: [240, 240, 240] } },
        { content: formatPdfCurrency(totalEmployee, currency), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: '', styles: { fillColor: [240, 240, 240] } },
        { content: formatPdfCurrency(totalEmployer, currency), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
    ]);

    (doc as any).autoTable({
        startY: startY,
        head: [['LIBELLÉ', 'BASE', 'TAUX\nSAL.', 'MONTANT\nSALARIAL', 'TAUX\nPAT.', 'MONTANT\nPATRONAL']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [30, 41, 59],
            fontSize: 7,
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
            textColor: [255, 255, 255],
            cellPadding: 2,
            lineWidth: 0.1,
            lineColor: [200, 200, 200]
        },
        columnStyles: {
            0: { cellWidth: 55, fontStyle: 'normal', fontSize: 7, halign: 'left' },
            1: { cellWidth: 22, halign: 'right', fontSize: 7 },
            2: { cellWidth: 15, halign: 'center', fontSize: 7 },
            3: { cellWidth: 25, halign: 'right', fontSize: 7 },
            4: { cellWidth: 15, halign: 'center', fontSize: 7 },
            5: { cellWidth: 25, halign: 'right', fontSize: 7 }
        },
        styles: {
            fontSize: 7,
            cellPadding: 1.5,
            lineWidth: 0.1,
            lineColor: [220, 220, 220],
            textColor: [0, 0, 0]
        },
        alternateRowStyles: {
            fillColor: [252, 252, 252]
        },
        margin: { left: margin, right: margin }
    });

    // === CALCULS FINAUX ===
    const finalY = (doc as any).lastAutoTable?.finalY || 180;
    let calcY = finalY + 12;

    const netBeforeTax = payslip.gross_salary - totalEmployee;
    const incomeTax = payslip.income_tax_amount || 0;
    const netPay = payslip.net_salary;
    const netSocial = netPay;
    const netTaxable = netBeforeTax;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);

    // Net avant impôt
    if (config.hasIncomeTax && config.netBeforeTaxLabel) {
        doc.text(config.netBeforeTaxLabel, margin, calcY);
        doc.setFont("helvetica", "bold");
        doc.text(formatPdfCurrency(netBeforeTax, currency), pageWidth - margin, calcY, { align: 'right' });
        calcY += 6;

        // Prélèvement à la source
        doc.setFont("helvetica", "normal");
        if (incomeTax > 0) {
            const taxRate = payslip.income_tax_rate || 0;
            doc.text(`${config.taxLabel} (${(taxRate * 100).toFixed(1)}%)`, margin, calcY);
            doc.text(`- ${formatPdfCurrency(incomeTax, currency)}`, pageWidth - margin, calcY, { align: 'right' });
            calcY += 8;
        } else {
            calcY += 2;
        }
    }

    // Net à payer (encadré)
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, calcY - 4, pageWidth - 2 * margin, 11, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(config.netPayLabel.toUpperCase(), margin + 4, calcY + 3);
    doc.text(formatPdfCurrency(netPay, currency), pageWidth - margin - 4, calcY + 3, { align: 'right' });
    calcY += 14;

    // Net social et net imposable
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    if (config.netSocialLabel) {
        doc.text(config.netSocialLabel, margin, calcY);
        doc.text(formatPdfCurrency(netSocial, currency), pageWidth - margin, calcY, { align: 'right' });
        calcY += 5;
    }
    if (config.netTaxableLabel) {
        doc.text(config.netTaxableLabel, margin, calcY);
        doc.text(formatPdfCurrency(netTaxable, currency), pageWidth - margin, calcY, { align: 'right' });
        calcY += 5;
    }

    // Date de paiement
    if (payslip.pay_date) {
        calcY += 6;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(`Date de paiement: ${safeFormatDate(payslip.pay_date)}`, margin, calcY);
    }

    // === FOOTER ===
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text("Ce bulletin de paie est établi conformément à la législation en vigueur.", pageWidth / 2, pageHeight - 15, { align: "center" });
    doc.text(`Document généré par SchoolFlow PRO - ${config.name}`, pageWidth / 2, pageHeight - 10, { align: "center" });

    return doc;
}
