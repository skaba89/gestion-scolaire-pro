import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { adminQueries } from "@/queries/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ShoppingBag, Eye, Printer, Trash2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useCurrency } from "@/hooks/useCurrency";
import { OrderReceipt } from "@/components/admin/orders/OrderReceipt";

export const OrderHistory = () => {
    const { tenant } = useTenant();
    const { formatCurrency } = useCurrency();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [showReceipt, setShowReceipt] = useState(false);
    const [orderItems, setOrderItems] = useState<any[]>([]);

    const { data: orders = [], isLoading } = useQuery(adminQueries.orders(tenant?.id || ""));

    const filteredOrders = orders.filter((order: any) =>
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        `${order.student?.first_name} ${order.student?.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.student?.registration_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleViewReceipt = async (order: any) => {
        const items = await adminQueries.orderItems(order.id).queryFn();
        setOrderItems(items || []);
        setSelectedOrder(order);
        setShowReceipt(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">Historique des Commandes</h1>
                    <p className="text-muted-foreground">Consultez et gérez les ventes d'articles passées.</p>
                </div>
            </div>

            <Card className="border-primary/10 shadow-sm bg-card/50 backdrop-blur-sm">
                <CardHeader className="pb-4">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Rechercher une commande, un étudiant..."
                            className="pl-9 bg-background/50 border-primary/10 focus:border-primary/30 rounded-xl"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow>
                                <TableHead className="pl-6">Date</TableHead>
                                <TableHead>Commande #</TableHead>
                                <TableHead>Étudiant</TableHead>
                                <TableHead>Mode de règlement</TableHead>
                                <TableHead className="text-right">Montant</TableHead>
                                <TableHead className="text-right pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                        Chargement des commandes...
                                    </TableCell>
                                </TableRow>
                            ) : filteredOrders.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                                        <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-10" />
                                        <p className="font-medium">Aucune commande trouvée</p>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredOrders.map((order: any) => (
                                    <TableRow key={order.id} className="hover:bg-primary/5 transition-colors group">
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-sm font-medium">
                                                    {format(new Date(order.created_at), 'dd MMM yyyy', { locale: fr })}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="font-mono text-[10px] uppercase">
                                                {order.id.slice(0, 8)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {order.student ? (
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm">{order.student.last_name} {order.student.first_name}</span>
                                                    <span className="text-[10px] text-muted-foreground font-mono">{order.student.registration_number}</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground italic">Client anonyme</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="text-[10px] h-5">
                                                {order.payment_method === 'CASH' ? 'Espèces' :
                                                    order.payment_method === 'CARD' ? 'CB' :
                                                        order.payment_method === 'TRANSFER' ? 'Virement' : 'Autre'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-primary">
                                            {formatCurrency(order.total_amount)}
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 rounded-lg hover:bg-primary/10 text-primary"
                                                    onClick={() => handleViewReceipt(order)}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <OrderReceipt
                isOpen={showReceipt}
                onClose={() => setShowReceipt(false)}
                order={selectedOrder}
                student={selectedOrder?.student}
                items={orderItems}
            />
        </div>
    );
};

export default OrderHistory;
