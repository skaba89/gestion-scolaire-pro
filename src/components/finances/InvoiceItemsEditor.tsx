import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

interface Fee {
  id: string;
  name: string;
  amount: number;
  description?: string | null;
}

interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface InvoiceItemsEditorProps {
  items: InvoiceItem[];
  fees: Fee[];
  onItemsChange: (items: InvoiceItem[]) => void;
}

export function InvoiceItemsEditor({ items, fees, onItemsChange }: InvoiceItemsEditorProps) {
  const { formatCurrency } = useCurrency();
  const addItem = () => {
    try {
      const newItem: InvoiceItem = {
        id: Math.random().toString(36).substr(2, 9),
        name: "",
        quantity: 1,
        unit_price: 0,
        total: 0,
      };
      onItemsChange([...items, newItem]);
    } catch (error) {
      console.error("Error adding invoice item:", error);
    }
  };

  const removeItem = (id: string) => {
    onItemsChange(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<InvoiceItem>) => {
    onItemsChange(
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates };
        updated.total = updated.quantity * updated.unit_price;
        return updated;
      })
    );
  };

  const selectFee = (itemId: string, feeId: string) => {
    const fee = fees.find((f) => f.id === feeId);
    if (fee) {
      updateItem(itemId, {
        name: fee.name,
        unit_price: fee.amount,
        total: fee.amount,
      });
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Lignes de la facture</Label>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 mr-2" />
          Ajouter une ligne
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
          <p>Aucune ligne ajoutée</p>
          <Button type="button" variant="link" onClick={addItem}>
            Cliquez ici pour ajouter une ligne
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item.id} className="grid grid-cols-12 gap-3 items-end p-3 bg-muted/30 rounded-lg">
              <div className="col-span-12 md:col-span-4">
                <Label className="text-xs text-muted-foreground">Désignation</Label>
                <div className="space-y-2">
                  {fees.length > 0 && (
                    <Select onValueChange={(value) => selectFee(item.id, value)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Choisir un frais existant..." />
                      </SelectTrigger>
                      <SelectContent>
                        {fees.map((fee) => (
                          <SelectItem key={fee.id} value={fee.id}>
                            {fee.name} - {formatCurrency(fee.amount)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    placeholder="Ou saisir manuellement..."
                    className="h-9"
                  />
                </div>
              </div>

              <div className="col-span-4 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Quantité</Label>
                <Input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                  className="h-9"
                />
              </div>

              <div className="col-span-4 md:col-span-3">
                <Label className="text-xs text-muted-foreground">Prix unitaire</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={item.unit_price}
                  onChange={(e) => updateItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                  className="h-9"
                />
              </div>

              <div className="col-span-3 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Total</Label>
                <div className="h-9 flex items-center font-medium">
                  {formatCurrency(item.total)}
                </div>
              </div>

              <div className="col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {/* Total */}
          <div className="flex justify-end pt-4 border-t">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total facture</p>
              <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
