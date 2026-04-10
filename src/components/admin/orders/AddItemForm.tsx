import { useState } from "react";
import { Plus, ShoppingCart, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { adminQueries } from "@/queries/admin";
import { useTenant } from "@/contexts/TenantContext";

interface AddItemFormProps {
    onAdd: (item: { name: string; price: number; quantity: number; item_id?: string }) => void;
}

export const AddItemForm = ({ onAdd }: AddItemFormProps) => {
    const { tenant } = useTenant();
    const [selectedItemId, setSelectedItemId] = useState<string>("manual");
    const [name, setName] = useState("");
    const [price, setPrice] = useState("");
    const [quantity, setQuantity] = useState("1");

    const { data: inventoryItems } = useQuery({
        queryKey: ["admin-inventory-items", tenant?.id],
        queryFn: () => adminQueries.inventoryItems(tenant!.id).queryFn(),
        enabled: !!tenant?.id
    });

    const handleItemChange = (itemId: string) => {
        setSelectedItemId(itemId);
        if (itemId === "manual") {
            setName("");
            setPrice("");
        } else {
            const item = inventoryItems?.find(i => i.id === itemId);
            if (item) {
                setName(item.name);
                setPrice(item.unit_price.toString());
            }
        }
    };

    const handleAdd = () => {
        if (!name || !price || !quantity) {
            toast.error("Veuillez remplir tous les champs de l'article");
            return;
        }

        const priceNum = parseFloat(price);
        const qtyNum = parseInt(quantity);

        if (isNaN(priceNum) || isNaN(qtyNum) || qtyNum <= 0) {
            toast.error("Prix ou quantité invalide");
            return;
        }

        const item = inventoryItems?.find(i => i.id === selectedItemId);
        if (item && qtyNum > item.stock_quantity) {
            toast.warning(`Stock insuffisant (${item.stock_quantity} disponibles)`);
        }

        onAdd({
            name,
            price: priceNum,
            quantity: qtyNum,
            item_id: selectedItemId === "manual" ? undefined : selectedItemId
        });

        setName("");
        setPrice("");
        setQuantity("1");
        setSelectedItemId("manual");
    };

    return (
        <Card className="border-primary/10 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-4 border-b border-primary/5">
                <CardTitle className="text-lg flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                    Ajouter des Articles
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="md:col-span-1 space-y-2">
                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Sélectionner un article</Label>
                        <Select value={selectedItemId} onValueChange={handleItemChange}>
                            <SelectTrigger className="h-11 bg-background/50 border-primary/10 rounded-xl">
                                <SelectValue placeholder="Choisir un article" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="manual">Saisie manuelle</SelectItem>
                                {inventoryItems?.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                        <div className="flex flex-col">
                                            <span>{item.name}</span>
                                            <span className="text-[10px] text-muted-foreground uppercase">Stock: {item.stock_quantity}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="md:col-span-1 space-y-2">
                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nom de l'article</Label>
                        <Input
                            placeholder="ex: Uniforme Taille M"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={selectedItemId !== "manual"}
                            className="h-11 bg-background/50 border-primary/10 rounded-xl focus:border-primary/30 transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Prix Unitaire</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            disabled={selectedItemId !== "manual"}
                            className="h-11 bg-background/50 border-primary/10 rounded-xl focus:border-primary/30 transition-all"
                        />
                    </div>
                    <div className="md:col-span-1 flex gap-2 items-end">
                        <div className="flex-1 space-y-2">
                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Qté</Label>
                            <Input
                                type="number"
                                min="1"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="h-11 bg-background/50 border-primary/10 rounded-xl focus:border-primary/30 transition-all text-center font-bold"
                            />
                        </div>
                        <Button
                            onClick={handleAdd}
                            className="h-11 w-11 p-0 rounded-xl shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-0.5"
                        >
                            <Plus className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
