import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

interface CategoryDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    categories: any[];
    onAdd: (data: { name: string; color?: string }) => void;
    onDelete: (id: string) => void;
    isPending: boolean;
}

export function CategoryDialog({
    isOpen,
    onOpenChange,
    categories,
    onAdd,
    onDelete,
    isPending,
}: CategoryDialogProps) {
    const [newName, setNewName] = useState("");

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Gérer les catégories</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <Label htmlFor="cat-name">Nouvelle catégorie</Label>
                            <Input
                                id="cat-name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Ex: Mathématiques"
                            />
                        </div>
                        <Button
                            className="mt-6"
                            onClick={() => {
                                onAdd({ name: newName });
                                setNewName("");
                            }}
                            disabled={!newName || isPending}
                        >
                            Ajouter
                        </Button>
                    </div>

                    <div className="space-y-2 border rounded-md p-2 max-h-60 overflow-y-auto">
                        {categories?.map((cat: any) => (
                            <div key={cat.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || "#ccc" }} />
                                    <span>{cat.name}</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => onDelete(cat.id)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                        {categories?.length === 0 && (
                            <p className="text-center text-sm text-muted-foreground py-4">Aucune catégorie</p>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
