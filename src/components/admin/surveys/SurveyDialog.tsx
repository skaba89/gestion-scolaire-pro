import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { audienceConfig } from "./constants";

interface SurveyDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    selectedSurvey: any;
    formData: {
        title: string;
        description: string;
        target_audience: string;
        is_anonymous: boolean;
        is_active: boolean;
        starts_at: string;
        ends_at: string;
    };
    setFormData: (data: any) => void;
    onSubmit: () => void;
    onClose: () => void;
    isSubmitting: boolean;
}

export const SurveyDialog = ({
    isOpen,
    onOpenChange,
    selectedSurvey,
    formData,
    setFormData,
    onSubmit,
    onClose,
    isSubmitting,
}: SurveyDialogProps) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {selectedSurvey ? "Modifier le Sondage" : "Créer un Sondage"}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label>Titre *</Label>
                        <Input
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Titre du sondage"
                        />
                    </div>
                    <div>
                        <Label>Description</Label>
                        <Textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Description du sondage"
                        />
                    </div>
                    <div>
                        <Label>Public cible</Label>
                        <Select
                            value={formData.target_audience}
                            onValueChange={(value) => setFormData({ ...formData, target_audience: value })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(audienceConfig).map(([key, config]) => (
                                    <SelectItem key={key} value={key}>
                                        {config.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Date de début</Label>
                            <Input
                                type="date"
                                value={formData.starts_at}
                                onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Date de fin</Label>
                            <Input
                                type="date"
                                value={formData.ends_at}
                                onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Réponses anonymes</Label>
                        <Switch
                            checked={formData.is_anonymous}
                            onCheckedChange={(checked) => setFormData({ ...formData, is_anonymous: checked })}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Sondage actif</Label>
                        <Switch
                            checked={formData.is_active}
                            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                        />
                    </div>
                    <div className="flex justify-end gap-2 text-left">
                        <Button variant="outline" onClick={onClose}>
                            Annuler
                        </Button>
                        <Button onClick={onSubmit} disabled={isSubmitting}>
                            {selectedSurvey ? "Mettre à jour" : "Créer"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
