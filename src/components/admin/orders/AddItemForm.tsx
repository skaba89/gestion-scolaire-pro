import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { adminQueries } from "@/queries/admin";
import { useTenant } from "@/contexts/TenantContext";

const schema = z.object({
    name: z.string().min(1, "Le nom de l'article est requis").max(200),
    price: z.number({ invalid_type_error: "Prix invalide" }).positive("Le prix doit être positif"),
    quantity: z
        .number({ invalid_type_error: "Quantité invalide" })
        .int("Quantité entière requise")
        .min(1, "Minimum 1"),
});

type FormValues = z.infer<typeof schema>;

interface AddItemFormProps {
    onAdd: (item: { name: string; price: number; quantity: number; item_id?: string }) => void;
}

export const AddItemForm = ({ onAdd }: AddItemFormProps) => {
    const { tenant } = useTenant();
    const [selectedItemId, setSelectedItemId] = useState<string>("manual");

    const { data: inventoryItems } = useQuery({
        queryKey: ["admin-inventory-items", tenant?.id],
        queryFn: () => adminQueries.inventoryItems(tenant!.id).queryFn(),
        enabled: !!tenant?.id,
    });

    const {
        register,
        handleSubmit,
        setValue,
        reset,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: "", price: 0, quantity: 1 },
    });

    const handleItemChange = (itemId: string) => {
        setSelectedItemId(itemId);
        if (itemId === "manual") {
            setValue("name", "");
            setValue("price", 0);
        } else {
            const item = inventoryItems?.find((i) => i.id === itemId);
            if (item) {
                setValue("name", item.name);
                setValue("price", item.unit_price);
            }
        }
    };

    const onSubmit = (values: FormValues) => {
        const item = inventoryItems?.find((i) => i.id === selectedItemId);
        if (item && values.quantity > item.stock_quantity) {
            toast.warning(`Stock insuffisant (${item.stock_quantity} disponibles)`);
        }

        onAdd({
            name: values.name,
            price: values.price,
            quantity: values.quantity,
            item_id: selectedItemId === "manual" ? undefined : selectedItemId,
        });

        reset({ name: "", price: 0, quantity: 1 });
        setSelectedItemId("manual");
    };

    const isInventoryItem = selectedItemId !== "manual";

    return (
        <Card className="border-primary/10 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-4 border-b border-primary/5">
                <CardTitle className="text-lg flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                    Ajouter des Articles
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-1 space-y-2">
                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Sélectionner un article
                            </Label>
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
                                                <span className="text-[10px] text-muted-foreground uppercase">
                                                    Stock: {item.stock_quantity}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="md:col-span-1 space-y-2">
                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Nom de l'article
                            </Label>
                            <Input
                                placeholder="ex: Uniforme Taille M"
                                disabled={isInventoryItem}
                                className="h-11 bg-background/50 border-primary/10 rounded-xl focus:border-primary/30 transition-all"
                                {...register("name")}
                            />
                            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Prix Unitaire
                            </Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                disabled={isInventoryItem}
                                className="h-11 bg-background/50 border-primary/10 rounded-xl focus:border-primary/30 transition-all"
                                {...register("price", { valueAsNumber: true })}
                            />
                            {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
                        </div>
                        <div className="md:col-span-1 flex gap-2 items-end">
                            <div className="flex-1 space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    Qté
                                </Label>
                                <Input
                                    type="number"
                                    min="1"
                                    className="h-11 bg-background/50 border-primary/10 rounded-xl focus:border-primary/30 transition-all text-center font-bold"
                                    {...register("quantity", { valueAsNumber: true })}
                                />
                                {errors.quantity && <p className="text-sm text-destructive">{errors.quantity.message}</p>}
                            </div>
                            <Button
                                type="submit"
                                className="h-11 w-11 p-0 rounded-xl shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-0.5"
                            >
                                <Plus className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};
