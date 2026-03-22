import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrency } from "@/hooks/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

// Modular components
import { AccountingHeader } from "@/components/admin/exports/AccountingHeader";
import { AccountingStats } from "@/components/admin/exports/AccountingStats";
import { AccountingPeriodSelector } from "@/components/admin/exports/AccountingPeriodSelector";
import { AccountingExportTabs } from "@/components/admin/exports/AccountingExportTabs";

type Invoice = {
  id: string;
  invoice_number: string;
  created_at: string;
  due_date: string | null;
  status: string;
  items: any;
  student: { first_name: string; last_name: string } | null;
};

type Payment = {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  invoice: { invoice_number: string } | null;
};

const AccountingExports = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [selectedPeriod, setSelectedPeriod] = useState("current_month");

  // Fetch invoices
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices_export", tenant?.id, selectedPeriod],
    queryFn: async () => {
      if (!tenant?.id) return [];

      let startDate: Date, endDate: Date;
      const now = new Date();

      switch (selectedPeriod) {
        case "current_month":
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
          break;
        case "last_month":
          startDate = startOfMonth(subMonths(now, 1));
          endDate = endOfMonth(subMonths(now, 1));
          break;
        case "last_quarter":
          startDate = startOfMonth(subMonths(now, 3));
          endDate = endOfMonth(now);
          break;
        case "current_year":
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear(), 11, 31);
          break;
        default:
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
      }

      const { data, error } = await supabase
        .from("invoices")
        .select("*, student:students(first_name, last_name)")
        .eq("tenant_id", tenant.id)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at");

      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!tenant?.id
  });

  // Fetch payments
  const { data: payments = [] } = useQuery({
    queryKey: ["payments_export", tenant?.id, selectedPeriod],
    queryFn: async () => {
      if (!tenant?.id) return [];

      let startDate: Date, endDate: Date;
      const now = new Date();

      switch (selectedPeriod) {
        case "current_month":
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
          break;
        case "last_month":
          startDate = startOfMonth(subMonths(now, 1));
          endDate = endOfMonth(subMonths(now, 1));
          break;
        case "last_quarter":
          startDate = startOfMonth(subMonths(now, 3));
          endDate = endOfMonth(now);
          break;
        case "current_year":
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear(), 11, 31);
          break;
        default:
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
      }

      const { data, error } = await supabase
        .from("payments")
        .select("*, invoice:invoices(invoice_number)")
        .eq("tenant_id", tenant.id)
        .gte("payment_date", startDate.toISOString())
        .lte("payment_date", endDate.toISOString())
        .order("payment_date");

      if (error) throw error;
      return data as Payment[];
    },
    enabled: !!tenant?.id
  });

  const calculateTotals = () => {
    const totalInvoiced = invoices.reduce((sum, inv) => {
      const items = inv.items as any[] || [];
      return sum + items.reduce((s, item) => s + (item.amount || 0) * (item.quantity || 1), 0);
    }, 0);

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    return { totalInvoiced, totalPaid, balance: totalInvoiced - totalPaid };
  };

  const totals = calculateTotals();

  // Export functions
  const exportToCSV = (type: "invoices" | "payments" | "journal") => {
    let csvContent = "";
    let filename = "";

    if (type === "invoices") {
      csvContent = "Numéro;Date;Échéance;Étudiant;Montant;Statut\n";
      invoices.forEach(inv => {
        const items = inv.items as any[] || [];
        const amount = items.reduce((s, item) => s + (item.amount || 0) * (item.quantity || 1), 0);
        csvContent += `${inv.invoice_number};${format(new Date(inv.created_at), "dd/MM/yyyy")};${inv.due_date ? format(new Date(inv.due_date), "dd/MM/yyyy") : ""};${inv.student?.first_name} ${inv.student?.last_name};${amount.toFixed(2)};${inv.status}\n`;
      });
      filename = `factures_${format(new Date(), "yyyy-MM-dd")}.csv`;
    } else if (type === "payments") {
      csvContent = "Date;Facture;Montant;Mode de paiement\n";
      payments.forEach(p => {
        csvContent += `${format(new Date(p.payment_date), "dd/MM/yyyy")};${p.invoice?.invoice_number || ""};${p.amount.toFixed(2)};${p.payment_method}\n`;
      });
      filename = `paiements_${format(new Date(), "yyyy-MM-dd")}.csv`;
    } else if (type === "journal") {
      csvContent = "JournalCode;JournalLib;EcritureNum;EcritureDate;CompteNum;CompteLib;CompAuxNum;CompAuxLib;PieceRef;PieceDate;EcritureLib;Debit;Credit;EcritureLet;DateLet;ValidDate;Montantdevise;Idevise\n";

      let ecritureNum = 1;
      invoices.forEach(inv => {
        const items = inv.items as any[] || [];
        const amount = items.reduce((s, item) => s + (item.amount || 0) * (item.quantity || 1), 0);
        const date = format(new Date(inv.created_at), "yyyyMMdd");

        csvContent += `VE;Ventes;${ecritureNum};${date};411000;Clients;;;"${inv.invoice_number}";${date};Facture ${inv.invoice_number};${amount.toFixed(2)};0;;;;;;;\n`;
        csvContent += `VE;Ventes;${ecritureNum};${date};706000;Prestations de services;;;"${inv.invoice_number}";${date};Facture ${inv.invoice_number};0;${amount.toFixed(2)};;;;;;;\n`;
        ecritureNum++;
      });

      payments.forEach(p => {
        const date = format(new Date(p.payment_date), "yyyyMMdd");
        csvContent += `BQ;Banque;${ecritureNum};${date};512000;Banque;;;"${p.invoice?.invoice_number || "PAIEMENT"}";${date};Encaissement;${p.amount.toFixed(2)};0;;;;;;;\n`;
        csvContent += `BQ;Banque;${ecritureNum};${date};411000;Clients;;;"${p.invoice?.invoice_number || "PAIEMENT"}";${date};Encaissement;0;${p.amount.toFixed(2)};;;;;;;\n`;
        ecritureNum++;
      });

      filename = `FEC_${format(new Date(), "yyyyMMdd")}.txt`;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

    toast({ title: "Export réussi", description: `Fichier ${filename} téléchargé` });
  };

  const exportToSage = () => {
    let content = "";
    invoices.forEach(inv => {
      const items = inv.items as any[] || [];
      const amount = items.reduce((s, item) => s + (item.amount || 0) * (item.quantity || 1), 0);
      const date = format(new Date(inv.created_at), "ddMMyyyy");
      content += `M;VTE;${date};${inv.invoice_number};411000;D;${amount.toFixed(2)};Facture ${inv.invoice_number}\n`;
      content += `M;VTE;${date};${inv.invoice_number};706000;C;${amount.toFixed(2)};Facture ${inv.invoice_number}\n`;
    });
    payments.forEach(p => {
      const date = format(new Date(p.payment_date), "ddMMyyyy");
      content += `M;BNQ;${date};${p.invoice?.invoice_number || "ENC"};512000;D;${p.amount.toFixed(2)};Encaissement\n`;
      content += `M;BNQ;${date};${p.invoice?.invoice_number || "ENC"};411000;C;${p.amount.toFixed(2)};Encaissement\n`;
    });
    const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sage_export_${format(new Date(), "yyyy-MM-dd")}.txt`;
    link.click();
    toast({ title: "Export Sage réussi" });
  };

  const exportToCiel = () => {
    let content = "CIEL COMPTA;Version 1.0\n";
    content += "Code journal;Date;N° pièce;Compte;Libellé;Débit;Crédit\n";
    invoices.forEach(inv => {
      const items = inv.items as any[] || [];
      const amount = items.reduce((s, item) => s + (item.amount || 0) * (item.quantity || 1), 0);
      const date = format(new Date(inv.created_at), "dd/MM/yyyy");
      content += `VTE;${date};${inv.invoice_number};411000;Facture ${inv.invoice_number};${amount.toFixed(2)};0\n`;
      content += `VTE;${date};${inv.invoice_number};706000;Facture ${inv.invoice_number};0;${amount.toFixed(2)}\n`;
    });
    payments.forEach(p => {
      const date = format(new Date(p.payment_date), "dd/MM/yyyy");
      content += `BNQ;${date};${p.invoice?.invoice_number || "ENC"};512000;Encaissement;${p.amount.toFixed(2)};0\n`;
      content += `BNQ;${date};${p.invoice?.invoice_number || "ENC"};411000;Encaissement;0;${p.amount.toFixed(2)}\n`;
    });
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ciel_export_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    toast({ title: "Export Ciel réussi" });
  };

  return (
    <div className="space-y-6">
      <AccountingHeader
        title="Exports Comptables"
        description="Exportez vos données vers des logiciels comptables"
      />

      <AccountingPeriodSelector
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
      />

      <AccountingStats
        totalInvoiced={totals.totalInvoiced}
        totalPaid={totals.totalPaid}
        balance={totals.balance}
        invoiceCount={invoices.length}
        paymentCount={payments.length}
        formatCurrency={formatCurrency}
      />

      <AccountingExportTabs
        invoiceCount={invoices.length}
        paymentCount={payments.length}
        onExportCSV={exportToCSV}
        onExportSage={exportToSage}
        onExportCiel={exportToCiel}
      />
    </div>
  );
};

export default AccountingExports;
