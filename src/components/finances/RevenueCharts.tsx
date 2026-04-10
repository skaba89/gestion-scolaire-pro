import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, DollarSign, AlertCircle, CheckCircle } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { useCurrency } from "@/hooks/useCurrency";

interface Payment {
  id: string;
  amount: number;
  payment_date: string | null;
}

interface Invoice {
  id: string;
  total_amount: number;
  paid_amount: number | null;
  status: string | null;
  created_at: string | null;
}

interface RevenueChartsProps {
  payments: Payment[];
  invoices: Invoice[];
}

export function RevenueCharts({ payments, invoices }: RevenueChartsProps) {
  const { formatCurrency, formatCurrencyCompact } = useCurrency();
  
  // Calculer les revenus par mois sur les 12 derniers mois
  const now = new Date();
  const twelveMonthsAgo = subMonths(now, 11);
  const months = eachMonthOfInterval({ start: twelveMonthsAgo, end: now });

  const monthlyRevenue = months.map((month) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    const monthPayments = payments.filter((p) => {
      if (!p.payment_date) return false;
      const paymentDate = parseISO(p.payment_date);
      return paymentDate >= monthStart && paymentDate <= monthEnd;
    });

    const total = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      month: format(month, "MMM yyyy", { locale: fr }),
      montant: total,
    };
  });

  // Statistiques globales
  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.total_amount), 0);
  const totalPaid = invoices.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
  const totalPending = totalInvoiced - totalPaid;

  // Répartition par statut
  const statusData = [
    { name: "Payé", value: invoices.filter((i) => i.status === "PAID").length, color: "hsl(var(--success))" },
    { name: "Partiel", value: invoices.filter((i) => i.status === "PARTIAL").length, color: "hsl(var(--warning))" },
    { name: "En attente", value: invoices.filter((i) => i.status === "PENDING").length, color: "hsl(var(--muted-foreground))" },
    { name: "En retard", value: invoices.filter((i) => i.status === "OVERDUE").length, color: "hsl(var(--destructive))" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total encaissé</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total facturé</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalInvoiced)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">En attente</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalPending)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Taux de recouvrement</p>
                <p className="text-2xl font-bold text-foreground">
                  {totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0}%
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Revenus mensuels */}
        <Card>
          <CardHeader>
            <CardTitle>Revenus mensuels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(value) => formatCurrencyCompact(value)}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="montant" name="Montant" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Répartition par statut */}
        <Card>
          <CardHeader>
            <CardTitle>Répartition des factures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip
                      formatter={(value: number) => `${value} facture(s)`}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Aucune facture à afficher
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
