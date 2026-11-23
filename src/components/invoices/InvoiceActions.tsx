import { useState } from "react";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Download,
  MoreVertical,
  Loader2,
  Printer,
  MessageCircle,
  MessageSquare
} from "lucide-react";

interface InvoiceActionsProps {
  invoice: any;
  compact?: boolean;
}

export function InvoiceActions({ invoice, compact = false }: InvoiceActionsProps) {
  const { tenant } = useTenant();
  const [downloading, setDownloading] = useState(false);

  const settings = tenant?.settings as any || {};

  const handleDownloadPDF = async (preview = false) => {
    setDownloading(true);
    try {
      const { generateInvoicePDF } = await import("@/utils/invoicePdfGenerator");

      // Fetch payment schedules if necessary
      let schedules: any[] = [];
      if (invoice.has_payment_plan) {
        try {
          const { data } = await apiClient.get("/payment-schedules/", {
            params: { invoice_id: invoice.id, ordering: "installment_number" },
          });
          if (data) {
            schedules = data;
          }
        } catch {
          // Ignore errors - schedules are optional
        }
      }

      // Préparer les données du tenant
      const tenantData = {
        name: tenant?.name || "Mon Établissement",
        address: tenant?.address,
        phone: tenant?.phone,
        email: tenant?.email,
        settings: {
          currency: settings.currency,
          bankName: settings.bankName,
          bankAccount: settings.bankAccount,
          bankIBAN: settings.bankIBAN,
          invoiceFooter: settings.invoiceFooter,
        }
      };

      // Inclure les échéanciers dans les données de la facture
      const invoiceWithSchedules = {
        ...invoice,
        student: invoice.students, // Mapping plural to singular for generator
        schedules,
        invoice_items: invoice.items || []
      };

      // Générer le PDF
      const doc = generateInvoicePDF(invoiceWithSchedules, tenantData);

      if (preview) {
        const blob = doc.output("blob");
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      } else {
        doc.save(`facture-${invoice.invoice_number || 'download'}.pdf`);
        toast.success("Facture téléchargée avec succès");
      }
    } catch (error: any) {
      console.error("PDF generation error:", error);
      toast.error(error.message || "Erreur lors de la génération du PDF");
    } finally {
      setDownloading(false);
    }
  };

  const handleWhatsApp = () => {
    const phone = invoice.students?.phone;
    if (!phone) {
      toast.error("Aucun numéro de téléphone disponible pour cet étudiant");
      return;
    }
    const message = `Bonjour, voici la facture N°${invoice.invoice_number} d'un montant de ${invoice.total_amount} ${settings.currency || '€'}.`;
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleSMS = () => {
    const phone = invoice.students?.phone;
    if (!phone) {
      toast.error("Aucun numéro de téléphone disponible pour cet étudiant");
      return;
    }
    const message = `Facture ${invoice.invoice_number} : ${invoice.total_amount} ${settings.currency || '€'}.`;
    window.open(`sms:${phone.replace(/[^0-9]/g, '')}?body=${encodeURIComponent(message)}`, '_blank');
  };

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleDownloadPDF(false)} disabled={downloading}>
            {downloading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Télécharger PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleWhatsApp}>
            <MessageCircle className="w-4 h-4 mr-2" />
            WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSMS}>
            <MessageSquare className="w-4 h-4 mr-2" />
            SMS
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleDownloadPDF(true)} disabled={downloading}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimer / Prévisualiser
          </DropdownMenuItem>
        </DropdownMenuContent >
      </DropdownMenu >
    );
  }

  // Pas d'envoi par e-mail : aucun envoi de facture n'est branché côté serveur (FIN-EMAIL-01,
  // la route répond 501). Le PDF, WhatsApp et le SMS restent disponibles.
  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleDownloadPDF(false)}
          disabled={downloading}
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleWhatsApp}
          title="WhatsApp"
        >
          <MessageCircle className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSMS}
          title="SMS"
        >
          <MessageSquare className="w-4 h-4" />
        </Button>
      </div>
    </>
  );
}
