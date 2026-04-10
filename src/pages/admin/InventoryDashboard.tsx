import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { adminQueries } from "@/queries/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { Package, TrendingUp, AlertTriangle, DollarSign, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { useCurrency } from "@/hooks/useCurrency";

export const InventoryDashboard = () => {
    const { tenant } = useTenant();
    const navigate = useNavigate();
    const { getTenantUrl } = useTenantUrl();
    const { formatCurrency } = useCurrency();

    const { data: items, isLoading: itemsLoading } = useQuery({
        queryKey: ["admin-inventory-items", tenant?.id],
        queryFn: () => adminQueries.inventoryItems(tenant!.id).queryFn(),
        enabled: !!tenant?.id
    });

    const { data: transactions, isLoading: transLoading } = useQuery({
        queryKey: ["admin-inventory-transactions", tenant?.id],
        queryFn: () => adminQueries.inventoryTransactions(tenant!.id).queryFn(),
        enabled: !!tenant?.id
    });

    const { data: categories } = useQuery({
        queryKey: ["admin-inventory-categories", tenant?.id],
        queryFn: () => adminQueries.inventoryCategories(tenant!.id).queryFn(),
        enabled: !!tenant?.id
    });

    if (itemsLoading || transLoading) {
        return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement des analyses...</div>;
    }

    // Process data for charts
    const itemsArr = Array.isArray(items) ? items : [];
    const categoriesArr = Array.isArray(categories) ? categories : [];
    const transactionsArr = Array.isArray(transactions) ? transactions : [];

    const stockByCategory = categoriesArr.map(cat => ({
        name: cat.name,
        value: itemsArr.filter(item => item.category_id === cat.id).reduce((acc, item) => acc + item.stock_quantity, 0) || 0
    })).filter(cat => cat.value > 0) || [];

    const valueByCategory = categoriesArr.map(cat => ({
        name: cat.name,
        value: itemsArr.filter(item => item.category_id === cat.id).reduce((acc, item) => acc + (item.stock_quantity * item.unit_price), 0) || 0
    })).filter(cat => cat.value > 0) || [];

    // Last 7 days transactions summary
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
    }).reverse();

    const movementData = last7Days.map(date => {
        const dayTrans = transactionsArr.filter(t => t.created_at.startsWith(date)) || [];
        return {
            date: new Date(date).toLocaleDateString('fr-FR', { weekday: 'short' }),
            in: dayTrans.filter(t => t.transaction_type === 'IN').reduce((acc, t) => acc + t.quantity, 0),
            out: Math.abs(dayTrans.filter(t => t.transaction_type === 'OUT').reduce((acc, t) => acc + t.quantity, 0))
        };
    });

    const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(getTenantUrl('/admin/inventory'))}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">Analytique de l'Inventaire</h1>
                        <p className="text-muted-foreground">Vision stratégique des stocks et flux.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <DollarSign className="w-4 h-4" /> Valeur Totale du Stock
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatCurrency(itemsArr.reduce((acc, item) => acc + (item.stock_quantity * item.unit_price), 0) || 0)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Package className="w-4 h-4" /> Articles Distincts
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{itemsArr.length || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-500" /> Entrées (7j)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {transactionsArr.filter(t => t.transaction_type === 'IN' && new Date(t.created_at) > new Date(Date.now() - 7 * 86400000)).reduce((acc, t) => acc + t.quantity, 0) || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-500" /> Sorties (7j)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {Math.abs(transactionsArr.filter(t => t.transaction_type === 'OUT' && new Date(t.created_at) > new Date(Date.now() - 7 * 86400000)).reduce((acc, t) => acc + t.quantity, 0) || 0)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Flux de Stock (7 jours)</CardTitle>
                        <CardDescription>Comparaison des entrées et sorties quotidiennes.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={movementData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="in" name="Entrées" fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="out" name="Sorties" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Répartition de la Valeur</CardTitle>
                        <CardDescription>Valeur financière par catégorie d'articles.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={valueByCategory}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {valueByCategory.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Historique de Valeur d'Inventaire</CardTitle>
                    <CardDescription>Tendance de la valeur totale du stock (simulation basée sur transactions).</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={movementData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Line type="monotone" dataKey="in" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                            <Line type="monotone" dataKey="out" stroke="#f43f5e" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
};

export default InventoryDashboard;
