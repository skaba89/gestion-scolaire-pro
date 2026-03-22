import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useBulkNotifications } from "@/hooks/useNotifications";
import { useCurrency } from "@/hooks/useCurrency";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, Loader2, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";

export const InvoiceReminders = () => {
  const { tenant } = useTenant();
  const { formatCurrency } = useCurrency();
  const { StudentLabel } = useStudentLabel();
  const bulkNotify = useBulkNotifications();
  const [open, setOpen] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);

  const { data: unpaidInvoices, isLoading, refetch } = useQuery({
    queryKey: ["unpaid-invoices-reminders", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          students (
            id,
            first_name,
            last_name,
            parent_students (
              parent_id,
              profiles:parent_id (
                id,
                first_name,
                last_name,
                email
              )
            )
          )
        `)
        .eq("tenant_id", tenant.id)
        .in("status", ["PENDING", "PARTIAL", "OVERDUE"])
        .order("due_date", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id && open,
  });

  const sendRemindersMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id || selectedInvoices.length === 0) {
        throw new Error("Aucune facture sélectionnée");
      }

      const invoicesToRemind = unpaidInvoices?.filter(inv =>
        selectedInvoices.includes(inv.id)
      ) || [];

      const notifications: any[] = [];
      const emailPromises: Promise<any>[] = [];

      for (const invoice of invoicesToRemind) {
        const student = invoice.students as any;
        const parentStudents = student?.parent_students || [];

        const daysOverdue = invoice.due_date
          ? differenceInDays(new Date(), new Date(invoice.due_date))
          : 0;

        const urgencyText = daysOverdue > 0
          ? `(${daysOverdue} jour(s) de retard)`
          : "";

        for (const ps of parentStudents) {
          const parent = ps.profiles;
          if (parent?.id) {
            // In-app notification
            notifications.push({
              user_id: parent.id,
              tenant_id: tenant.id,
              title: "Rappel de paiement",
              message: `Facture ${invoice.invoice_number} pour ${student?.first_name} ${student?.last_name}: ${formatCurrency(invoice.total_amount - (invoice.paid_amount || 0))} restants ${urgencyText}`,
              type: "invoice",
              link: tenant.slug ? `/${tenant.slug}/parent/invoices` : "/parent/invoices",
            });

            // Email notification
            if (parent.email) {
              emailPromises.push(
                supabase.functions.invoke("send-notification-email", {
                  body: {
                    type: "invoice_reminder",
                    recipientEmail: parent.email,
                    recipientName: `${parent.first_name || ""} ${parent.last_name || ""}`.trim(),
                    data: {
                      studentName: `${student?.first_name} ${student?.last_name}`,
                      invoiceNumber: invoice.invoice_number,
                      amount: invoice.total_amount - (invoice.paid_amount || 0),
                      dueDate: invoice.due_date
                        ? format(new Date(invoice.due_date), "dd MMMM yyyy", { locale: fr })
                        : "Non définie",
                    },
                  },
                })
              );
            }
          }
        }

        // Update invoice status to OVERDUE if past due date
        if (daysOverdue > 0 && invoice.status !== "OVERDUE") {
          await supabase
            .from("invoices")
            .update({ status: "OVERDUE" })
            .eq("id", invoice.id);
        }
      }

      if (notifications.length === 0) {
        throw new Error("Aucun parent à notifier");
      }

      // Send in-app notifications via sovereign API
      await bulkNotify.mutateAsync(notifications.map(n => ({
        userId: n.user_id,
        title: n.title,
        message: n.message,
        type: n.type as any,
        link: n.link
      })));

      // Send email notifications (don't block on failure)
      await Promise.allSettled(emailPromises);

      return { count: notifications.length, invoices: selectedInvoices.length };
    },
    onSuccess: (data) => {
      toast.success(`${data.count} notification(s) envoyée(s) pour ${data.invoices} facture(s)`);
      setSelectedInvoices([]);
      refetch();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const toggleInvoice = (invoiceId: string) => {
    setSelectedInvoices(prev =>
      prev.includes(invoiceId)
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const selectAll = () => {
    if (selectedInvoices.length === unpaidInvoices?.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(unpaidInvoices?.map(inv => inv.id) || []);
    }
  };

  const getStatusBadge = (status: string, dueDate: string | null) => {
    const isOverdue = dueDate && differenceInDays(new Date(), new Date(dueDate)) > 0;

    if (isOverdue || status === "OVERDUE") {
      return <Badge variant="destructive">En retard</Badge>;
    }
    if (status === "PARTIAL") {
      return <Badge className="bg-orange-100 text-orange-700">Partiel</Badge>;
    }
    return <Badge variant="outline">En attente</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Bell className="w-4 h-4 mr-2" />
          Envoyer des rappels
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Rappels de factures impayées
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Chargement des factures...
          </div>
        ) : unpaidInvoices && unpaidInvoices.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedInvoices.length === unpaidInvoices.length}
                  onCheckedChange={selectAll}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedInvoices.length} / {unpaidInvoices.length} sélectionnée(s)
                </span>
              </div>
              <Button
                onClick={() => sendRemindersMutation.mutate()}
                disabled={selectedInvoices.length === 0 || sendRemindersMutation.isPending}
              >
                {sendRemindersMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Envoyer les rappels
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>N° Facture</TableHead>
                  <TableHead>{StudentLabel}</TableHead>
                  <TableHead>Montant dû</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unpaidInvoices.map((invoice) => {
                  const student = invoice.students as any;
                  const remaining = invoice.total_amount - (invoice.paid_amount || 0);

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedInvoices.includes(invoice.id)}
                          onCheckedChange={() => toggleInvoice(invoice.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell>
                        {student?.first_name} {student?.last_name}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(remaining)}
                      </TableCell>
                      <TableCell>
                        {invoice.due_date
                          ? format(new Date(invoice.due_date), "dd MMM yyyy", { locale: fr })
                          : "-"
                        }
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(invoice.status || "", invoice.due_date)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Bell className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">Aucune facture impayée</p>
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};
