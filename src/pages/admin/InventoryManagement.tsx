import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { adminQueries } from "@/queries/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Search, Filter, AlertTriangle, Edit2, Trash2, History, ArrowUpRight, ArrowDownRight, RefreshCcw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { useCurrency } from "@/hooks/useCurrency";

export const InventoryManagement = () => {
    const { tenant } = useTenant();
    const { formatCurrency } = useCurrency();
    const navigate = useNavigate();
    const { getTenantUrl } = useTenantUrl();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [adjustingItem, setAdjustingItem] = useState<any>(null);

    // Queries
    const { data: items, isLoading: itemsLoading } = useQuery({
        queryKey: ["admin-inventory-items", tenant?.id],
        queryFn: () => adminQueries.inventoryItems(tenant!.id).queryFn(),
        enabled: !!tenant?.id
    });

    const { data: categories } = useQuery({
        queryKey: ["admin-inventory-categories", tenant?.id],
        queryFn: () => adminQueries.inventoryCategories(tenant!.id).queryFn(),
        enabled: !!tenant?.id
    });

    const { data: transactions, isLoading: transLoading } = useQuery({
        queryKey: ["admin-inventory-transactions", tenant?.id],
        queryFn: () => adminQueries.inventoryTransactions(tenant!.id).queryFn(),
        enabled: !!tenant?.id
    });

    // Mutations
    const createItemMutation = useMutation({
        mutationFn: (data: any) => adminQueries.createInventoryItem(tenant!.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-inventory-items", tenant?.id] });
            toast.success("Article créé avec succès");
            setIsAddDialogOpen(false);
        }
    });

    const updateItemMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => adminQueries.updateInventoryItem(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-inventory-items", tenant?.id] });
            toast.success("Article mis à jour");
            setEditingItem(null);
        }
    });

    const deleteItemMutation = useMutation({
        mutationFn: (id: string) => adminQueries.deleteInventoryItem(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-inventory-items", tenant?.id] });
            toast.success("Article supprimé");
        }
    });

    const adjustStockMutation = useMutation({
        mutationFn: ({ itemId, quantity, type, notes }: any) => adminQueries.adjustInventoryStock(itemId, quantity, type, notes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-inventory-items", tenant?.id] });
            queryClient.invalidateQueries({ queryKey: ["admin-inventory-transactions", tenant?.id] });
            toast.success("Stock ajusté avec succès");
            setIsAdjustDialogOpen(false);
            setAdjustingItem(null);
        }
    });

    const filteredItems = items?.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === "all" || item.category_id === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const handleSaveItem = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = {
            name: formData.get("name"),
            description: formData.get("description"),
            category_id: formData.get("category_id") === "none" ? null : formData.get("category_id"),
            unit_price: parseFloat(formData.get("unit_price") as string),
            stock_quantity: parseInt(formData.get("stock_quantity") as string),
            min_stock_level: parseInt(formData.get("min_stock_level") as string),
        };

        if (editingItem) {
            updateItemMutation.mutate({ id: editingItem.id, data });
        } else {
            createItemMutation.mutate(data);
        }
    };

    const handleAdjustStock = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const type = formData.get("type") as string;
        const quantity = parseInt(formData.get("quantity") as string);
        const notes = formData.get("notes") as string;

        adjustStockMutation.mutate({
            itemId: adjustingItem.id,
            quantity: type === 'OUT' ? -Math.abs(quantity) : Math.abs(quantity),
            type,
            notes
        });
    };

    const lowStockItems = items?.filter(item => item.stock_quantity <= item.min_stock_level && item.stock_quantity > 0) || [];
    const outOfStockItems = items?.filter(item => item.stock_quantity <= 0) || [];
    const totalInventoryValue = items?.reduce((acc, item) => acc + (item.unit_price * item.stock_quantity), 0) || 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Package className="w-8 h-8 text-primary" />
                        Gestion de l'Inventaire
                    </h1>
                    <p className="text-muted-foreground">Suivez vos stocks d'uniformes, livres et fournitures.</p>
                </div>
                <div className="flex gap-2">
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2">
                                <Plus className="w-4 h-4" />
                                Nouvel Article
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Ajouter un article à l'inventaire</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSaveItem} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Nom de l'article</Label>
                                    <Input name="name" required placeholder="ex: Uniforme Polo XL" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Catégorie</Label>
                                        <Select name="category_id" defaultValue="none">
                                            <SelectTrigger>
                                                <SelectValue placeholder="Catégorie" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Sans catégorie</SelectItem>
                                                {categories?.map((cat) => (
                                                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Prix Unitaire</Label>
                                        <Input name="unit_price" type="number" step="0.01" required />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Quantité en Stock</Label>
                                        <Input name="stock_quantity" type="number" required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Alerte Stock Bas</Label>
                                        <Input name="min_stock_level" type="number" defaultValue="5" />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button type="submit" disabled={createItemMutation.isPending}>
                                        Enregistrer
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                    <Button variant="outline" className="gap-2" onClick={() => navigate(getTenantUrl('/admin/inventory/analytics'))}>
                        <TrendingUp className="w-4 h-4" />
                        Voir les Analyses
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Valeur Totale</p>
                                <h3 className="text-2xl font-bold">{formatCurrency(totalInventoryValue)}</h3>
                            </div>
                            <Package className="w-8 h-8 text-emerald-500 opacity-50" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Stock Bas</p>
                                <h3 className="text-2xl font-bold text-amber-700 dark:text-amber-500">{lowStockItems.length} articles</h3>
                            </div>
                            <AlertTriangle className="w-8 h-8 text-amber-500 opacity-50" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-rose-600 dark:text-rose-400">Rupture de Stock</p>
                                <h3 className="text-2xl font-bold text-rose-700 dark:text-rose-500">{outOfStockItems.length} articles</h3>
                            </div>
                            <Trash2 className="w-8 h-8 text-rose-500 opacity-50" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="items" className="space-y-4">
                <TabsList className="grid w-[400px] grid-cols-2">
                    <TabsTrigger value="items">Articles</TabsTrigger>
                    <TabsTrigger value="history">Historique des mouvements</TabsTrigger>
                </TabsList>

                <TabsContent value="items" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Rechercher un article..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                    <SelectTrigger className="w-[200px]">
                                        <Filter className="w-4 h-4 mr-2" />
                                        <SelectValue placeholder="Catégorie" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Toutes les catégories</SelectItem>
                                        {categories?.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Article</TableHead>
                                        <TableHead>Catégorie</TableHead>
                                        <TableHead className="text-right">Prix Unit.</TableHead>
                                        <TableHead className="text-center">Stock</TableHead>
                                        <TableHead className="text-center">Statut</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {itemsLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                Chargement de l'inventaire...
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredItems?.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                Aucun article trouvé.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredItems?.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium">{item.name}</TableCell>
                                                <TableCell>{item.category?.name || "-"}</TableCell>
                                                <TableCell className="text-right font-mono">{formatCurrency(item.unit_price)}</TableCell>
                                                <TableCell className="text-center font-bold">{item.stock_quantity}</TableCell>
                                                <TableCell className="text-center">
                                                    {item.stock_quantity <= 0 ? (
                                                        <Badge variant="destructive" className="gap-1">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            Rupture
                                                        </Badge>
                                                    ) : item.stock_quantity <= item.min_stock_level ? (
                                                        <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 bg-amber-50">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            Stock Bas
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-50">
                                                            Optimale
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => {
                                                                setAdjustingItem(item);
                                                                setIsAdjustDialogOpen(true);
                                                            }}
                                                            title="Ajuster le stock"
                                                        >
                                                            <RefreshCcw className="w-4 h-4 text-emerald-500" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => setEditingItem(item)}>
                                                            <Edit2 className="w-4 h-4 text-blue-500" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => {
                                                                if (confirm("Supprimer cet article ?")) {
                                                                    deleteItemMutation.mutate(item.id);
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-500" />
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
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Mouvements de Stock</CardTitle>
                            <CardDescription>Historique complet des entrées et sorties de l'inventaire.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Article</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-right">Quantité</TableHead>
                                        <TableHead>Notes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                Chargement de l'historique...
                                            </TableCell>
                                        </TableRow>
                                    ) : transactions?.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                Aucun mouvement enregistré.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        transactions?.map((trans: any) => (
                                            <TableRow key={trans.id}>
                                                <TableCell className="text-muted-foreground">
                                                    {format(new Date(trans.created_at), "dd MMM yyyy HH:mm", { locale: fr })}
                                                </TableCell>
                                                <TableCell className="font-medium">{trans.item?.name}</TableCell>
                                                <TableCell>
                                                    {trans.transaction_type === 'IN' ? (
                                                        <Badge variant="outline" className="gap-1 border-emerald-500 text-emerald-600 bg-emerald-50">
                                                            <ArrowUpRight className="w-3 h-3" /> Entrée
                                                        </Badge>
                                                    ) : trans.transaction_type === 'OUT' ? (
                                                        <Badge variant="outline" className="gap-1 border-rose-500 text-rose-600 bg-rose-50">
                                                            <ArrowDownRight className="w-3 h-3" /> Sortie
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600 bg-blue-50">
                                                            <RefreshCcw className="w-3 h-3" /> Ajustement
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className={`text-right font-bold ${trans.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {trans.quantity > 0 ? `+${trans.quantity}` : trans.quantity}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground italic">
                                                    {trans.notes || "-"}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Manual Adjustment Dialog */}
            <Dialog open={isAdjustDialogOpen} onOpenChange={setIsAdjustDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ajuster le stock : {adjustingItem?.name}</DialogTitle>
                        <DialogDescription>Enregistrez une entrée ou une sortie manuelle exceptionnelle.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAdjustStock} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Type de mouvement</Label>
                                <Select name="type" defaultValue="IN">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="IN">Entrée (Réapprovisionnement)</SelectItem>
                                        <SelectItem value="OUT">Sortie (Passe, Don, Perte)</SelectItem>
                                        <SelectItem value="ADJUSTMENT">Ajustement (Inventaire)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Quantité</Label>
                                <Input name="quantity" type="number" min="1" required />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Notes / Justification</Label>
                            <Input name="notes" placeholder="ex: Réception livraison ou Inventaire mensuel" />
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={adjustStockMutation.isPending}>
                                Confirmer l'ajustement
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Modifier l'article</DialogTitle>
                    </DialogHeader>
                    {editingItem && (
                        <form onSubmit={handleSaveItem} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Nom de l'article</Label>
                                <Input name="name" defaultValue={editingItem.name} required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Catégorie</Label>
                                    <Select name="category_id" defaultValue={editingItem.category_id || "none"}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Catégorie" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sans catégorie</SelectItem>
                                            {categories?.map((cat) => (
                                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Prix Unitaire</Label>
                                    <Input name="unit_price" type="number" step="0.01" defaultValue={editingItem.unit_price} required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Quantité en Stock</Label>
                                    <Input name="stock_quantity" type="number" defaultValue={editingItem.stock_quantity} required />
                                </div>
                                <div className="space-y-2">
                                    <Label>Alerte Stock Bas</Label>
                                    <Input name="min_stock_level" type="number" defaultValue={editingItem.min_stock_level} />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={updateItemMutation.isPending}>
                                    Enregistrer les modifications
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default InventoryManagement;
