import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { forumCategories } from "./constants";

interface ForumDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    selectedForum: any;
    formData: {
        title: string;
        description: string;
        category: string;
        is_active: boolean;
    };
    setFormData: (data: any) => void;
    onSubmit: () => void;
    onClose: () => void;
    isSubmitting: boolean;
}

export const ForumDialog = ({
    isOpen,
    onOpenChange,
    selectedForum,
    formData,
    setFormData,
    onSubmit,
    onClose,
    isSubmitting,
}: ForumDialogProps) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {selectedForum ? "Modifier le Forum" : "Créer un Forum"}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label>Titre *</Label>
                        <Input
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Nom du forum"
                        />
                    </div>
                    <div>
                        <Label>Description</Label>
                        <Textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Description du forum"
                        />
                    </div>
                    <div>
                        <Label>Catégorie</Label>
                        <Select
                            value={formData.category}
                            onValueChange={(value) => setFormData({ ...formData, category: value })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {forumCategories.map((cat) => (
                                    <SelectItem key={cat.value} value={cat.value}>
                                        {cat.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Forum actif</Label>
                        <Switch
                            checked={formData.is_active}
                            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={onClose}>
                            Annuler
                        </Button>
                        <Button onClick={onSubmit} disabled={isSubmitting}>
                            {selectedForum ? "Mettre à jour" : "Créer"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
