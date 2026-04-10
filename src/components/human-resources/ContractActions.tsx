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
import { Contract } from "@/types/humanResources";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrency } from "@/hooks/useCurrency";

interface ContractActionsProps {
    contract: Contract;
    onEdit?: (contract: Contract) => void;
    onDelete?: (contract: Contract) => void;
}

export function ContractActions({ contract, onEdit, onDelete }: ContractActionsProps) {
    const { tenant } = useTenant();
    const [downloading, setDownloading] = useState(false);
    const { currencyCode } = useCurrency();

    const handleDownloadPDF = async (preview = false) => {
        setDownloading(true);
        try {
            const { generateCDIContract, generateCDDContract } = await import("@/utils/contractPdfGenerator");

            // Préparer les données du tenant
            const tenantData = {
                name: tenant?.name || "SchoolFlow PRO",
                address: tenant?.address,
                phone: tenant?.phone,
                email: tenant?.email,
                settings: {
                    currency: currencyCode,
                    urssafNumber: (tenant?.settings as any)?.urssafNumber,
                    conventionCollective: (tenant?.settings as any)?.conventionCollective,
                    bankName: (tenant?.settings as any)?.bankName,
                    bankAccount: (tenant?.settings as any)?.bankAccount,
                    bankIBAN: (tenant?.settings as any)?.bankIBAN,
                }
            };

            // Générer le PDF selon le type de contrat
            let doc;
            const contractData = {
                ...contract,
                weekly_hours: contract.weekly_hours || 35 // Fallback to 35h if missing
            };

            if (contract.contract_type === "CDD") {
                doc = generateCDDContract(contractData as any, tenantData);
            } else {
                doc = generateCDIContract(contractData as any, tenantData);
            }

            if (preview) {
                const blob = doc.output("blob");
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
            } else {
                doc.save(`contrat-${contract.contract_number}.pdf`);
                toast.success("Contrat téléchargé avec succès");
            }
        } catch (error: any) {
            console.error("PDF generation error:", error);

            // Messages d'erreur spécifiques
            if (error.message?.includes("numéro de contrat")) {
                toast.error("Erreur : Le numéro de contrat est manquant");
            } else if (error.message?.includes("poste")) {
                toast.error("Erreur : Le poste est manquant");
            } else if (error.message?.includes("date")) {
                toast.error("Erreur : Une date est invalide ou manquante");
            } else if (error.message?.includes("salaire")) {
                toast.error("Erreur : Le salaire doit être supérieur à 0");
            } else if (error.message?.includes("heures")) {
                toast.error("Erreur : Les heures hebdomadaires doivent être supérieures à 0");
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
                    <DropdownMenuItem onClick={() => onEdit(contract)}>
                        <Edit className="w-4 h-4 mr-2 text-amber-600" />
                        Modifier
                    </DropdownMenuItem>
                )}
                {onDelete && (
                    <DropdownMenuItem onClick={() => onDelete(contract)}>
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
