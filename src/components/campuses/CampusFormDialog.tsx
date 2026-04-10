import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MapPin, Phone } from "lucide-react";
import { Campus } from "@/queries/campuses";

interface CampusFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingCampus: Campus | null;
    onSubmit: (formData: any) => void;
    isPending: boolean;
}

export const CampusFormDialog = ({
    open,
    onOpenChange,
    editingCampus,
    onSubmit,
    isPending,
}: CampusFormDialogProps) => {
    const [formData, setFormData] = useState({
        name: "",
        address: "",
        phone: "",
        is_main: false,
    });

    useEffect(() => {
        if (editingCampus) {
            setFormData({
                name: editingCampus.name || "",
                address: editingCampus.address || "",
                phone: editingCampus.phone || "",
                is_main: editingCampus.is_main || false,
            });
        } else {
            setFormData({
                name: "",
                address: "",
                phone: "",
                is_main: false,
            });
        }
    }, [editingCampus, open]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>{editingCampus ? "Modifier" : "Nouveau"} campus</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nom du campus</Label>
                            <Input
                                placeholder="Campus Nord, Annexe Sud..."
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>
                                <MapPin className="w-4 h-4 inline mr-2" />
                                Adresse
                            </Label>
                            <Input
                                placeholder="123 Rue de l'Éducation"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>
                                <Phone className="w-4 h-4 inline mr-2" />
                                Téléphone
                            </Label>
                            <Input
                                placeholder="+33 1 23 45 67 89"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={formData.is_main}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_main: checked })}
                            />
                            <Label>Campus principal</Label>
                        </div>
                        <Button className="w-full" type="submit" disabled={isPending}>
                            {isPending ? "Traitement..." : (editingCampus ? "Mettre à jour" : "Créer")}
                        </Button>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
