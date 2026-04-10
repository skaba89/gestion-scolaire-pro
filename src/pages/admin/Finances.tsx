import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Receipt, FileText, CreditCard } from "lucide-react";
import { financeQueries } from "@/queries/finance";

// New feature imports
import { useFinances } from "@/features/finance/hooks/useFinances";
import { useFees } from "@/features/finance/hooks/useFees";
import { FinanceDashboard } from "@/features/finance/components/FinanceDashboard";
import { InvoiceList } from "@/features/finance/components/InvoiceList";
import { FeeList } from "@/features/finance/components/FeeList";
import { PaymentHistory } from "@/features/finance/components/PaymentHistory";
import { InvoiceDialog } from "@/features/finance/components/InvoiceDialog";
import { PaymentDialog } from "@/features/finance/components/PaymentDialog";
import { FeeDialog } from "@/features/finance/components/FeeDialog";
import { Invoice, Fee } from "@/features/finance/types";

// Modular Components
import { FinanceHeader } from "@/components/finance/FinanceHeader";

const Finances = () => {
  const { tenant } = useTenant();

  // Pagination state
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(10);

  // Data Hooks
  // Consolidated useFinances manages invoices and payments
  const {
    invoices,
    invoicesTotalCount: totalInvoices,
    isLoading: isLoadingFinances,
    saveInvoice,
    isSavingInvoice,
    deleteInvoice,
    generateInvoiceNumber,
    payments,
    registerPayment,
    isRegisteringPayment,
    generatePaymentReference
  } = useFinances({ page: invoicePage, pageSize: invoicePageSize });

  const { fees, isLoading: isLoadingFees, saveFee, isSaving: isSavingFee, deleteFee } = useFees(tenant?.id);

  // UI State
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState("");

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [invoiceForPayment, setInvoiceForPayment] = useState<Invoice | null>(null);
  const [nextPaymentRef, setNextPaymentRef] = useState("");

  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [selectedFee, setSelectedFee] = useState<Fee | null>(null);

  // Centralized student query
  const { data: students } = useQuery({
    ...financeQueries.students(tenant?.id || ""),
    enabled: !!tenant?.id,
    select: (data: any) => Array.isArray(data) ? data : [],
  });

  // Handlers
  const handleOpenInvoice = async (invoice: Invoice | null = null) => {
    setSelectedInvoice(invoice);
    if (!invoice) {
      try {
        const num = await generateInvoiceNumber();
        setNextInvoiceNumber(num);
      } catch (err) {
        console.error('[SchoolFlow] Error generating invoice number:', err);
        setNextInvoiceNumber('');
      }
    }
    setInvoiceDialogOpen(true);
  };

  const handleOpenPayment = async (invoice: Invoice) => {
    setInvoiceForPayment(invoice);
    try {
      const ref = await generatePaymentReference();
      setNextPaymentRef(ref);
    } catch (err) {
      console.error('[SchoolFlow] Error generating payment reference:', err);
      setNextPaymentRef('');
    }
    setPaymentDialogOpen(true);
  };

  const handleOpenFee = (fee: Fee | null = null) => {
    setSelectedFee(fee);
    setFeeDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <FinanceHeader />

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto overflow-y-hidden md:grid md:grid-cols-4 h-auto p-1 bg-muted/50">
          <TabsTrigger value="dashboard" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-2">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Factures</span>
          </TabsTrigger>
          <TabsTrigger value="fees" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Frais</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Paiements</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <FinanceDashboard invoices={invoices} payments={payments} />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoiceList
            invoices={invoices}
            totalCount={totalInvoices}
            isLoading={isLoadingFinances}
            currentPage={invoicePage}
            pageSize={invoicePageSize}
            onPageChange={setInvoicePage}
            onPageSizeChange={setInvoicePageSize}
            onNewInvoice={() => handleOpenInvoice()}
            onEditInvoice={handleOpenInvoice}
            onDeleteInvoice={deleteInvoice}
            onRegisterPayment={handleOpenPayment}
          />
        </TabsContent>

        <TabsContent value="fees">
          <FeeList
            fees={fees}
            isLoading={isLoadingFees}
            onNewFee={() => handleOpenFee()}
            onEditFee={handleOpenFee}
            onDeleteFee={deleteFee}
          />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentHistory
            payments={payments}
            isLoading={isLoadingFinances}
          />
        </TabsContent>
      </Tabs>

      <InvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        invoice={selectedInvoice}
        students={students || []}
        fees={fees || []}
        nextInvoiceNumber={nextInvoiceNumber}
        isSaving={isSavingInvoice}
        onSave={async (id, data, items) => {
          await saveInvoice({ id, data, items });
          setInvoiceDialogOpen(false);
        }}
      />

      <PaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        invoice={invoiceForPayment}
        nextReference={nextPaymentRef}
        isSaving={isRegisteringPayment}
        onSave={async (params) => {
          await registerPayment(params);
          setPaymentDialogOpen(false);
        }}
      />

      <FeeDialog
        open={feeDialogOpen}
        onOpenChange={setFeeDialogOpen}
        fee={selectedFee}
        isSaving={isSavingFee}
        onSave={async (data) => {
          await saveFee(data);
          setFeeDialogOpen(false);
        }}
      />
    </div>
  );
};

export default Finances;
