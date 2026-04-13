import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CreditCard,
  Download,
  Users,
  Loader2,
  ExternalLink,
  CalendarDays,
  Eye,
  AlertCircle,
  Smartphone
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { TableSkeleton } from "@/components/ui/TableSkeleton";

import { ParentInvoiceStats } from "@/components/parent/ParentInvoiceStats";

type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";

import { useParentData } from "@/features/parents/hooks/useParentData";
import { parentsService } from "@/features/parents/services/parentsService";

const statusConfig: Record<PaymentStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline", color?: string }> = {
  PENDING: { label: "En attente", variant: "outline", color: "text-orange-600 bg-orange-50 border-orange-200" },
  PARTIAL: { label: "Partiel", variant: "secondary", color: "text-blue-600 bg-blue-50 border-blue-200" },
  PAID: { label: "Payé", variant: "default", color: "text-green-600 bg-green-50 border-green-200" },
  OVERDUE: { label: "En retard", variant: "destructive", color: "text-red-600 bg-red-50 border-red-200" },
  CANCELLED: { label: "Annulé", variant: "outline", color: "text-muted-foreground bg-muted/20" },
};

const Invoices = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { StudentLabel } = useStudentLabel();
  const { formatCurrency } = useCurrency();
  const [selectedChild, setSelectedChild] = useState<string>("all");
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<any>(null);
  const [paymentMethodDialog, setPaymentMethodDialog] = useState<{ open: boolean; invoice: any }>({ open: false, invoice: null });
  const [searchParams] = useSearchParams();

  const { children, studentIds, isLoading: childrenLoading } = useParentData();

  const { data: invoices, isLoading, refetch } = useQuery({
    queryKey: ["parent-invoices", studentIds, selectedChild],
    queryFn: () => parentsService.getInvoices(studentIds, selectedChild),
    enabled: studentIds.length > 0,
  });

  const onlinePaymentsEnabled = (tenant?.settings as Record<string, any>)?.enableOnlinePayments ?? false;
  const mobileMoneyEnabled = (tenant?.settings as Record<string, any>)?.enableMobileMoney ?? false;

  const handleOnlinePayment = async (invoice: any, method: 'stripe' | 'paytech' = 'stripe') => {
    if (!invoice || !user) return;
    const remaining = Number(invoice.total_amount) - Number(invoice.paid_amount || 0);
    if (remaining <= 0) {
      toast.info("Cette facture est déjà entièrement payée");
      return;
    }

    if (!paymentMethodDialog.open && onlinePaymentsEnabled && mobileMoneyEnabled) {
      setPaymentMethodDialog({ open: true, invoice });
      return;
    }

    setPayingInvoiceId(invoice.id);
    setPaymentMethodDialog({ open: false, invoice: null });

    try {
      const student = invoice.students as any;

      const { data } = await apiClient.post('/parents/payments/create/', {
        invoiceId: invoice.id,
        amount: remaining,
        invoiceNumber: invoice.invoice_number,
        studentName: `${student?.first_name} ${student?.last_name}`,
        tenantName: tenant?.name,
        method,
      });

      if (data?.url && /^https?:\/\//.test(data.url)) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("URL de paiement non reçue");
      }
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'initiation du paiement");
    } finally {
      setPayingInvoiceId(null);
    }
  };

  const handleDownloadPDF = async (invoice: any) => {
    setDownloadingId(invoice.id);
    try {
      const { data } = await apiClient.post('/parents/invoices/pdf/', { invoiceId: invoice.id });
      if (data?.html) {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(data.html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => printWindow.print(), 500);
        }
        toast.success("Facture prête à imprimer");
      }
    } catch (error: any) {
      toast.error(error.message || "Erreur lors du téléchargement");
    } finally {
      setDownloadingId(null);
    }
  };

  // Fetch payment schedules for detail view
  const { data: schedules } = useQuery({
    queryKey: ["invoice-schedules", detailInvoice?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/parents/payment-schedules/', {
        params: { invoice_id: detailInvoice.id },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!detailInvoice?.id,
  });

  const totalDue = invoices?.reduce((sum, inv) =>
    inv.status !== "PAID" && inv.status !== "CANCELLED"
      ? sum + (Number(inv.total_amount) - Number(inv.paid_amount || 0))
      : sum
  , 0) || 0;

  const totalPaid = invoices?.reduce((sum, inv) =>
    sum + Number(inv.paid_amount || 0)
  , 0) || 0;

  if (isLoading || childrenLoading) {
    return <TableSkeleton columns={6} rows={10} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Mes Factures</h1>
          <p className="text-muted-foreground">Consultez et gérez les frais de scolarité</p>
        </div>
        {(onlinePaymentsEnabled || mobileMoneyEnabled) && (
          <Badge className="w-fit gap-2 bg-green-500/10 text-green-700 border-green-500/30 font-bold uppercase tracking-widest text-[10px] py-1.5 shadow-sm">
            <CreditCard className="w-3.5 h-3.5" />
            Paiement {onlinePaymentsEnabled && mobileMoneyEnabled ? "SÉCURISÉ" : onlinePaymentsEnabled ? "CARTE" : "MOBILE"} activé
          </Badge>
        )}
      </div>

      <ParentInvoiceStats totalDue={formatCurrency(totalDue)} totalPaid={formatCurrency(totalPaid)} count={invoices?.length || 0} overdueCount={invoices?.filter(i => i.status === "OVERDUE").length || 0} />

      {children && children.length > 1 && (
        <Card className="border-primary/5 bg-muted/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Users className="w-5 h-5 text-primary/60" />
              <div className="flex-1">
                <Select value={selectedChild} onValueChange={setSelectedChild}>
                  <SelectTrigger className="w-full sm:w-72 bg-card border-primary/20 font-medium"><SelectValue placeholder="Tous les enfants" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les enfants</SelectItem>
                    {children?.map((relation) => (
                      <SelectItem key={relation.student_id} value={relation.student_id}>{relation.student.first_name} {relation.student.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/5 shadow-md overflow-hidden">
        <CardHeader className="bg-muted/30 border-b py-4">
          <CardTitle className="flex items-center gap-2 text-base font-display"><CreditCard className="w-5 h-5 text-primary" />Historique des Factures</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!invoices || invoices.length === 0 ? (
            <div className="text-center py-16"><CreditCard className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground font-medium">Aucune facture trouvée</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/10">
                    <TableHead className="font-bold py-4">N° Facture</TableHead>
                    <TableHead className="font-bold py-4">Enfant</TableHead>
                    <TableHead className="font-bold py-4">Montant</TableHead>
                    <TableHead className="font-bold py-4">Reste</TableHead>
                    <TableHead className="font-bold py-4">Échéance</TableHead>
                    <TableHead className="font-bold py-4">Statut</TableHead>
                    <TableHead className="text-right font-bold py-4 px-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => {
                    const student = invoice.students as any;
                    const remaining = Number(invoice.total_amount) - Number(invoice.paid_amount || 0);
                    const canPay = remaining > 0 && invoice.status !== "CANCELLED" && invoice.status !== "PAID";
                    const status = statusConfig[invoice.status as PaymentStatus];
                    return (
                      <TableRow key={invoice.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="font-mono bg-background w-fit">{invoice.invoice_number}</Badge>
                            {invoice.has_payment_plan && <Badge variant="secondary" className="text-[9px] w-fit bg-primary/10 text-primary border-primary/20"><CalendarDays className="w-3 h-3 mr-1" />{invoice.installments_count} échéances</Badge>}
                          </div>
                        </TableCell>
                        <TableCell><p className="font-bold text-sm">{student?.first_name} {student?.last_name}</p></TableCell>
                        <TableCell className="font-bold text-sm">{formatCurrency(Number(invoice.total_amount))}</TableCell>
                        <TableCell className={`font-bold text-sm ${remaining > 0 ? "text-orange-600" : "text-green-600"}`}>{remaining > 0 ? formatCurrency(remaining) : "Soldé"}</TableCell>
                        <TableCell className="text-xs font-medium text-muted-foreground">{invoice.due_date ? format(new Date(invoice.due_date), "dd MMM yyyy", { locale: fr }) : "-"}</TableCell>
                        <TableCell><Badge className={`${status?.color || ""} border-none shadow-none text-[10px] uppercase font-bold`}>{status?.label || invoice.status}</Badge></TableCell>
                        <TableCell className="text-right px-6">
                          <div className="flex items-center justify-end gap-2">
                            {(onlinePaymentsEnabled || mobileMoneyEnabled) && canPay && (
                              <Button variant="default" size="sm" onClick={() => handleOnlinePayment(invoice)} disabled={payingInvoiceId === invoice.id} className="h-8 gap-1.5 shadow-sm bg-primary hover:bg-primary/90">
                                {payingInvoiceId === invoice.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CreditCard className="w-3.5 h-3.5" /><span className="hidden sm:inline">Payer</span></>}
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full" onClick={() => setDetailInvoice(invoice)}><Eye className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-muted rounded-full" onClick={() => handleDownloadPDF(invoice)} disabled={downloadingId === invoice.id}>
                              {downloadingId === invoice.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailInvoice} onOpenChange={() => setDetailInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl border-primary/10 p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="p-6 bg-muted/30 border-b"><DialogTitle className="flex items-center gap-3 font-display text-xl"><CreditCard className="w-6 h-6 text-primary" />Facture {detailInvoice?.invoice_number}</DialogTitle></DialogHeader>
          {detailInvoice && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted/40 rounded-xl border border-primary/5"><p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">{StudentLabel}</p><p className="font-bold text-sm">{(detailInvoice.students as any)?.first_name} {(detailInvoice.students as any)?.last_name}</p></div>
                <div className="p-4 bg-muted/40 rounded-xl border border-primary/5"><p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Statut</p><Badge className={`${statusConfig[detailInvoice.status as PaymentStatus]?.color || ""} border-none shadow-none text-[10px] font-bold`}>{statusConfig[detailInvoice.status as PaymentStatus]?.label || detailInvoice.status}</Badge></div>
              </div>
              <div className="bg-muted/20 border-2 border-primary/5 rounded-2xl p-6 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground font-medium">Montant Total</span><span className="font-bold">{formatCurrency(Number(detailInvoice.total_amount))}</span></div>
                <div className="flex justify-between text-sm text-green-600"><span className="font-medium">Montant Payé</span><span className="font-bold">{formatCurrency(Number(detailInvoice.paid_amount || 0))}</span></div>
                <div className="flex justify-between text-lg font-bold pt-3 border-t-2 border-dashed border-primary/10">{(() => { const detailRemaining = Number(detailInvoice.total_amount) - Number(detailInvoice.paid_amount || 0); return (<><span className={detailRemaining > 0 ? "text-orange-600 font-display" : "text-green-600 font-display"}>Reste à payer</span><span className={detailRemaining > 0 ? "text-orange-600 font-display" : "text-green-600 font-display"}>{formatCurrency(detailRemaining)}</span></>); })()}</div>
              </div>
              {Array.isArray(detailInvoice.items) && detailInvoice.items.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase font-bold text-primary tracking-widest px-1">Détail des frais</p>
                  <div className="border border-primary/5 rounded-xl overflow-hidden shadow-sm"><Table><TableHeader className="bg-muted/50"><TableRow><TableHead className="text-xs h-9">Description</TableHead><TableHead className="text-center text-xs h-9">Qté</TableHead><TableHead className="text-right text-xs h-9">Total</TableHead></TableRow></TableHeader><TableBody>{detailInvoice.items.map((item: any, idx: number) => { const isPenalty = item.isPenalty || item.name?.toLowerCase().includes("pénalité"); return (<TableRow key={idx} className={cn("hover:bg-transparent", isPenalty && "bg-red-50 text-red-900")}><TableCell className="py-3 text-sm font-medium flex items-center gap-2">{isPenalty && <AlertCircle className="w-3.5 h-3.5 text-red-600" />}{item.name}</TableCell><TableCell className="py-3 text-center text-sm">{item.quantity}</TableCell><TableCell className="py-3 text-right text-sm font-bold">{formatCurrency(Number(item.total))}</TableCell></TableRow>); })}</TableBody></Table></div>
                </div>
              )}
              {schedules && schedules.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase font-bold text-primary tracking-widest px-1">Échéancier de paiement</p>
                  <div className="border border-primary/5 rounded-xl overflow-hidden shadow-sm"><Table><TableHeader className="bg-muted/50"><TableRow><TableHead className="text-xs h-9">N°</TableHead><TableHead className="text-right text-xs h-9">Montant</TableHead><TableHead className="text-xs h-9">Date limite</TableHead><TableHead className="text-xs h-9">Statut</TableHead></TableRow></TableHeader><TableBody>{schedules.map((schedule) => (<TableRow key={schedule.id}><TableCell className="py-3"><span className="font-mono text-xs font-bold bg-muted p-1 rounded">#{schedule.installment_number}</span></TableCell><TableCell className="py-3 text-right font-bold text-sm">{formatCurrency(Number(schedule.amount))}</TableCell><TableCell className="py-3 text-xs font-medium">{format(new Date(schedule.due_date), "dd/MM/yyyy")}</TableCell><TableCell className="py-3"><Badge className={`text-[9px] font-bold uppercase shadow-none border-none ${schedule.status === "PAID" ? "bg-green-100 text-green-700" : schedule.status === "OVERDUE" || new Date(schedule.due_date) < new Date() ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>{schedule.status === "PAID" ? "Payé" : schedule.status === "OVERDUE" || new Date(schedule.due_date) < new Date() ? "En retard" : "À venir"}</Badge></TableCell></TableRow>))}</TableBody></Table></div>
                </div>
              )}
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
                <Button variant="outline" className="font-bold text-sm h-11 px-6 rounded-xl shadow-sm" onClick={() => handleDownloadPDF(detailInvoice)} disabled={downloadingId === detailInvoice.id}>{downloadingId === detailInvoice.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}Télécharger PDF</Button>
                {onlinePaymentsEnabled && (Number(detailInvoice.total_amount) - Number(detailInvoice.paid_amount || 0)) > 0 && <Button className="font-bold text-sm h-11 px-6 rounded-xl shadow-md bg-primary hover:bg-primary/90" onClick={() => handleOnlinePayment(detailInvoice)} disabled={payingInvoiceId === detailInvoice.id}>{payingInvoiceId === detailInvoice.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}Payer maintenant</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={paymentMethodDialog.open} onOpenChange={(open) => setPaymentMethodDialog({ ...paymentMethodDialog, open })}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle className="text-center font-display">Choisir le mode de paiement</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-4">
            {onlinePaymentsEnabled && <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-2 border-2 hover:border-primary hover:bg-primary/5 group transition-all" onClick={() => handleOnlinePayment(paymentMethodDialog.invoice, 'stripe')}><div className="flex items-center gap-2"><CreditCard className="w-6 h-6 text-primary" /><span className="font-bold">Carte Bancaire</span></div><span className="text-[10px] text-muted-foreground uppercase tracking-widest">Visa, Mastercard</span></Button>}
            {mobileMoneyEnabled && <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-2 border-2 hover:border-primary hover:bg-primary/5 group transition-all" onClick={() => handleOnlinePayment(paymentMethodDialog.invoice, 'paytech')}><div className="flex items-center gap-2"><Smartphone className="w-6 h-6 text-primary" /><span className="font-bold">Mobile Money</span></div><span className="text-[10px] text-muted-foreground uppercase tracking-widest">Wave, Orange, MTN</span></Button>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Invoices;
