import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Calendar, 
  Plus, 
  Trash2, 
  CheckCircle, 
  Clock,
  AlertCircle,
  CalendarDays
} from "lucide-react";
import { format, addMonths, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

interface PaymentScheduleManagerProps {
  invoice: any;
  onUpdate?: () => void;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  PENDING: { label: "En attente", variant: "outline", icon: Clock },
  PAID: { label: "Payé", variant: "default", icon: CheckCircle },
  OVERDUE: { label: "En retard", variant: "destructive", icon: AlertCircle },
  CANCELLED: { label: "Annulé", variant: "outline", icon: AlertCircle },
};

export function PaymentScheduleManager({ invoice, onUpdate }: PaymentScheduleManagerProps) {
  const { tenant } = useTenant();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState(3);
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["payment-schedules", invoice.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_schedules")
        .select("*")
        .eq("invoice_id", invoice.id)
        .order("installment_number");
      
      if (error) throw error;
      return data;
    },
    enabled: !!invoice.id,
  });

  const totalAmount = Number(invoice.total_amount);
  const paidAmount = Number(invoice.paid_amount || 0);
  const remaining = totalAmount - paidAmount;

  const createSchedule = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No tenant");
      
      const amountPerInstallment = Math.floor(remaining / installmentsCount);
      const lastInstallmentAmount = remaining - (amountPerInstallment * (installmentsCount - 1));
      
      const schedulesToInsert = [];
      const start = parseISO(startDate);
      
      for (let i = 1; i <= installmentsCount; i++) {
        const dueDate = addMonths(start, i - 1);
        schedulesToInsert.push({
          tenant_id: tenant.id,
          invoice_id: invoice.id,
          installment_number: i,
          amount: i === installmentsCount ? lastInstallmentAmount : amountPerInstallment,
          due_date: format(dueDate, "yyyy-MM-dd"),
          status: "PENDING",
        });
      }

      // Delete existing schedules first
      await supabase
        .from("payment_schedules")
        .delete()
        .eq("invoice_id", invoice.id);

      // Insert new schedules
      const { error } = await supabase
        .from("payment_schedules")
        .insert(schedulesToInsert);

      if (error) throw error;

      // Update invoice to mark it has a payment plan
      await supabase
        .from("invoices")
        .update({ 
          has_payment_plan: true, 
          installments_count: installmentsCount 
        })
        .eq("id", invoice.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setDialogOpen(false);
      toast.success("Échéancier créé avec succès");
      onUpdate?.();
    },
    onError: () => toast.error("Erreur lors de la création de l'échéancier"),
  });

  const deleteSchedule = useMutation({
    mutationFn: async () => {
      await supabase
        .from("payment_schedules")
        .delete()
        .eq("invoice_id", invoice.id);

      await supabase
        .from("invoices")
        .update({ has_payment_plan: false, installments_count: 1 })
        .eq("id", invoice.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Échéancier supprimé");
      onUpdate?.();
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  const markAsPaid = useMutation({
    mutationFn: async (scheduleId: string) => {
      await supabase
        .from("payment_schedules")
        .update({ status: "PAID", paid_date: new Date().toISOString() })
        .eq("id", scheduleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-schedules"] });
      toast.success("Échéance marquée comme payée");
    },
    onError: () => toast.error("Erreur"),
  });

  const hasExistingSchedule = schedules && schedules.length > 0;
  const scheduledTotal = schedules?.reduce((sum, s) => sum + Number(s.amount), 0) || 0;
  const paidSchedules = schedules?.filter(s => s.status === "PAID").length || 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />
          Échéancier de paiement
        </CardTitle>
        <div className="flex gap-2">
          {hasExistingSchedule ? (
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => deleteSchedule.mutate()}
              disabled={deleteSchedule.isPending}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Supprimer
            </Button>
          ) : (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setDialogOpen(true)}
              disabled={remaining <= 0}
            >
              <Plus className="w-4 h-4 mr-1" />
              Créer échéancier
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">Chargement...</div>
        ) : hasExistingSchedule ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {paidSchedules}/{schedules.length} échéances payées
              </span>
              <span className="font-medium">
                Total: {formatCurrency(scheduledTotal)}
              </span>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Échéance</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Date limite</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => {
                  const config = statusConfig[schedule.status] || statusConfig.PENDING;
                  const Icon = config.icon;
                  const isOverdue = new Date(schedule.due_date) < new Date() && schedule.status === "PENDING";
                  
                  return (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        <Badge variant="outline">
                          #{schedule.installment_number}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(schedule.amount))}
                      </TableCell>
                      <TableCell>
                        <span className={isOverdue ? "text-destructive font-medium" : ""}>
                          {format(parseISO(schedule.due_date), "dd MMM yyyy", { locale: fr })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={isOverdue ? "destructive" : config.variant}
                          className="gap-1"
                        >
                          <Icon className="w-3 h-3" />
                          {isOverdue ? "En retard" : config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {schedule.status !== "PAID" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsPaid.mutate(schedule.id)}
                            disabled={markAsPaid.isPending}
                          >
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Aucun échéancier configuré</p>
            {remaining > 0 && (
              <p className="text-xs mt-1">
                Créez un échéancier pour étaler le paiement de {formatCurrency(remaining)}
              </p>
            )}
          </div>
        )}
      </CardContent>

      {/* Create Schedule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer un échéancier de paiement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Montant restant à échelonner</p>
              <p className="text-2xl font-bold">{formatCurrency(remaining)}</p>
            </div>

            <div>
              <Label>Nombre d'échéances</Label>
              <Input
                type="number"
                min={2}
                max={12}
                value={installmentsCount}
                onChange={(e) => setInstallmentsCount(parseInt(e.target.value) || 2)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                ≈ {formatCurrency(Math.floor(remaining / installmentsCount))} par échéance
              </p>
            </div>

            <div>
              <Label>Date de la première échéance</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-900">Aperçu des échéances</p>
              <ul className="mt-2 space-y-1 text-sm text-blue-800">
                {Array.from({ length: Math.min(installmentsCount, 4) }).map((_, i) => {
                  const date = addMonths(parseISO(startDate), i);
                  const amount = i === installmentsCount - 1 
                    ? remaining - (Math.floor(remaining / installmentsCount) * (installmentsCount - 1))
                    : Math.floor(remaining / installmentsCount);
                  return (
                    <li key={i}>
                      Échéance {i + 1}: {formatCurrency(amount)} - {format(date, "dd MMM yyyy", { locale: fr })}
                    </li>
                  );
                })}
                {installmentsCount > 4 && (
                  <li className="text-blue-600">... et {installmentsCount - 4} échéance(s) de plus</li>
                )}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button 
              onClick={() => createSchedule.mutate()}
              disabled={createSchedule.isPending}
            >
              {createSchedule.isPending ? "Création..." : "Créer l'échéancier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
