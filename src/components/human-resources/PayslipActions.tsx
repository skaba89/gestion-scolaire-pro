import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Download,
    MoreVertical,
    Loader2,
    Printer,
    Edit,
    Trash2
} from "lucide-react";
import { toast } from "sonner";
import { Payslip } from "@/types/humanResources";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrency } from "@/hooks/useCurrency";

interface PayslipActionsProps {
    payslip: Payslip;
    onEdit?: (payslip: Payslip) => void;
    onDelete?: (payslip: Payslip) => void;
}

export function PayslipActions({ payslip, onEdit, onDelete }: PayslipActionsProps) {
    const { tenant } = useTenant();
    const [downloading, setDownloading] = useState(false);
    const { currencyCode } = useCurrency();

    const months = [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ];

    const handleDownloadPDF = async (preview = false) => {
        setDownloading(true);
        try {
            const { generatePayslipPDF } = await import("@/utils/payslipPdfGenerator");

            // Préparer les données du tenant
            const tenantData = {
                name: tenant?.name || "Mon Établissement",
                address: tenant?.address,
                phone: tenant?.phone,
                email: tenant?.email,
                settings: {
                    currency: currencyCode,
                    country: (tenant?.settings as any)?.country || "FR",
                    siretNumber: (tenant?.settings as any)?.siretNumber,
                    urssafNumber: (tenant?.settings as any)?.urssafNumber,
                    nafCode: (tenant?.settings as any)?.nafCode,
                    conventionCollective: (tenant?.settings as any)?.conventionCollective,
                }
            };

            // Générer le PDF
            const doc = generatePayslipPDF(payslip, tenantData);

            if (preview) {
                const blob = doc.output("blob");
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
            } else {
                doc.save(`bulletin-paie-${months[payslip.period_month - 1]}-${payslip.period_year}.pdf`);
                toast.success("Fiche de paie téléchargée avec succès");
            }
        } catch (error: any) {
            console.error("PDF generation error:", error);

            // Messages d'erreur spécifiques
            if (error.message?.includes("mois")) {
                toast.error("Erreur : Le mois de la période est invalide");
            } else if (error.message?.includes("année")) {
                toast.error("Erreur : L'année de la période est invalide");
            } else if (error.message?.includes("salaire brut")) {
                toast.error("Erreur : Le salaire brut doit être supérieur à 0");
            } else if (error.message?.includes("salaire net")) {
                toast.error("Erreur : Le salaire net est invalide");
            } else if (error.message?.includes("date")) {
                toast.error("Erreur : Une date est invalide");
            } else {
                toast.error(`Erreur lors de la génération du PDF : ${error.message || "Erreur inconnue"}`);
            }
        } finally {
            setDownloading(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(payslip)}>
                        <Edit className="w-4 h-4 mr-2 text-amber-600" />
                        Modifier
                    </DropdownMenuItem>
                )}
                {onDelete && (
                    <DropdownMenuItem onClick={() => onDelete(payslip)}>
                        <Trash2 className="w-4 h-4 mr-2 text-red-600" />
                        Supprimer
                    </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleDownloadPDF(false)} disabled={downloading}>
                    {downloading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Download className="w-4 h-4 mr-2" />
                    )}
                    Télécharger PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownloadPDF(true)} disabled={downloading}>
                    <Printer className="w-4 h-4 mr-2" />
                    Imprimer / Prévisualiser
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
