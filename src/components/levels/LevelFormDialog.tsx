import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Level } from "@/queries/levels";

interface LevelFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingLevel: Level | null;
    onSubmit: (formData: any) => void;
    isPending: boolean;
    nextOrderIndex: number;
}

export const LevelFormDialog = ({
    open,
    onOpenChange,
    editingLevel,
    onSubmit,
    isPending,
    nextOrderIndex,
}: LevelFormDialogProps) => {
    const [formData, setFormData] = useState({
        name: "",
        code: "",
        label: "",
        order_index: 0,
    });

    useEffect(() => {
        if (editingLevel) {
            setFormData({
                name: editingLevel.name || "",
                code: editingLevel.code || "",
                label: editingLevel.label || "",
                order_index: editingLevel.order_index,
            });
        } else {
            setFormData({
                name: "",
                code: "",
                label: "",
                order_index: nextOrderIndex,
            });
        }
    }, [editingLevel, open, nextOrderIndex]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>{editingLevel ? "Modifier" : "Nouveau"} niveau</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nom du niveau</Label>
                            <Input
                                placeholder="6ème, 5ème, Terminale..."
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Code niveau</Label>
                            <Input
                                placeholder="L1, M1, D1..."
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Libellé niveau</Label>
                            <Input
                                placeholder="Licence, Master, Doctorat..."
                                value={formData.label}
                                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isPending}
                            >
                                {isPending && (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                )}
                                {editingLevel ? "Mettre à jour" : "Créer"}
                            </Button>
                        </DialogFooter>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
