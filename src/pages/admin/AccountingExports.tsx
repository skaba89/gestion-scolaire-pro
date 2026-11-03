import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrency } from "@/hooks/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  cielExport,
  fecJournal,
  invoicesCsv,
  loadAccountingData,
  paymentsCsv,
  sageExport,
  totals as computeTotals,
} from "@/features/finance/utils/accountingExport";

// Modular components
import { AccountingHeader } from "@/components/admin/exports/AccountingHeader";
import { AccountingStats } from "@/components/admin/exports/AccountingStats";
import { AccountingPeriodSelector } from "@/components/admin/exports/AccountingPeriodSelector";
import { AccountingExportTabs } from "@/components/admin/exports/AccountingExportTabs";

const download = (content: string, filename: string, type: string, excelBom = false) => {
  // BOM uniquement pour les CSV lus dans Excel (accents des noms) ; les
  // fichiers d'import FEC / Sage / Ciel restent sans BOM, comme avant.
  const blob = new Blob([excelBom ? "\uFEFF" + content : content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

const AccountingExports = () => {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [selectedPeriod, setSelectedPeriod] = useState("current_month");

  // Factures émises et paiements encaissés de la période — toutes les pages.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["accounting_export", tenant?.id, selectedPeriod],
    queryFn: () => loadAccountingData(selectedPeriod),
    enabled: !!tenant?.id,
  });
  const invoices = data?.invoices ?? [];
  const payments = data?.payments ?? [];
  const totals = computeTotals(invoices, payments);
  // Pas d'export tant que les données ne sont pas complètes : un journal
  // vide ou partiel serait importé comme s'il était juste.
  const ready = !!data && !isError;

  const exportToCSV = (type: "invoices" | "payments" | "journal") => {
    if (!ready) return;
    let filename: string;
    if (type === "invoices") {
      filename = `factures_${format(new Date(), "yyyy-MM-dd")}.csv`;
      download(invoicesCsv(invoices), filename, "text/csv;charset=utf-8;", true);
    } else if (type === "payments") {
      filename = `paiements_${format(new Date(), "yyyy-MM-dd")}.csv`;
      download(paymentsCsv(payments), filename, "text/csv;charset=utf-8;", true);
    } else {
      filename = `FEC_${format(new Date(), "yyyyMMdd")}.txt`;
      download(fecJournal(invoices, payments), filename, "text/plain;charset=utf-8;");
    }
    toast({ title: t("accountingExports.exportSuccess"), description: t("accountingExports.fileDownloaded", { filename }) });
  };

  const exportToSage = () => {
    if (!ready) return;
    download(sageExport(invoices, payments), `sage_export_${format(new Date(), "yyyy-MM-dd")}.txt`, "text/plain;charset=utf-8;");
    toast({ title: t("accountingExports.exportSageSuccess") });
  };

  const exportToCiel = () => {
    if (!ready) return;
    download(cielExport(invoices, payments), `ciel_export_${format(new Date(), "yyyy-MM-dd")}.csv`, "text/csv;charset=utf-8;");
    toast({ title: t("accountingExports.exportCielSuccess") });
  };

  return (
    <div className="space-y-6">
      <AccountingHeader
        title={t("accountingExports.pageTitle")}
        description={t("accountingExports.pageSubtitle")}
      />

      <AccountingPeriodSelector
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
      />

      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("accountingExports.loadErrorTitle")}</AlertTitle>
          <AlertDescription>
            {t("accountingExports.loadErrorDescription")}
            {error instanceof Error && error.message ? ` (${error.message})` : ""}
          </AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground" role="status">{t("accountingExports.loading")}</p>
      )}

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
