import { Trash2, Plus, Minus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/hooks/useCurrency";

interface CartItem {
    id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface OrderCartProps {
    items: CartItem[];
    onUpdateQuantity: (id: string, delta: number) => void;
    onRemove: (id: string) => void;
}

export const OrderCart = ({ items, onUpdateQuantity, onRemove }: OrderCartProps) => {
    const { formatCurrency } = useCurrency();

    return (
        <Card className="lg:col-span-2 border-primary/10 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardHeader className="border-b border-primary/5 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-primary" />
                    Articles sélectionnés
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader className="bg-muted/30">
                        <TableRow>
                            <TableHead className="pl-6">Article</TableHead>
                            <TableHead className="text-center w-32">Prix Unitaire</TableHead>
                            <TableHead className="text-center w-40">Quantité</TableHead>
                            <TableHead className="text-right pr-6 w-32">Total</TableHead>
                            <TableHead className="w-16"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                                    <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-10" />
                                    <p className="text-sm font-medium">Votre panier est vide</p>
                                    <p className="text-xs opacity-60">Ajoutez des articles ci-dessus pour commencer</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((item) => (
                                <TableRow key={item.id} className="hover:bg-primary/5 transition-colors group">
                                    <TableCell className="font-semibold pl-6">{item.item_name}</TableCell>
                                    <TableCell className="text-center font-medium text-muted-foreground">{formatCurrency(item.unit_price)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center justify-center gap-3">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8 rounded-lg border-primary/10 hover:bg-primary/5 active:scale-95 transition-all"
                                                onClick={() => onUpdateQuantity(item.id, -1)}
                                                disabled={item.quantity <= 1}
                                            >
                                                <Minus className="h-3 w-3" />
                                            </Button>
                                            <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8 rounded-lg border-primary/10 hover:bg-primary/5 active:scale-95 transition-all"
                                                onClick={() => onUpdateQuantity(item.id, 1)}
                                            >
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-primary pr-6">{formatCurrency(item.total_price)}</TableCell>
                                    <TableCell className="pr-6">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                                            onClick={() => onRemove(item.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};
