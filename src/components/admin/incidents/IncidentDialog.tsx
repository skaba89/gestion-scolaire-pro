import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface IncidentDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    isPending: boolean;
}

export function IncidentDialog({ isOpen, onOpenChange, onSubmit, isPending }: IncidentDialogProps) {
    const [formData, setFormData] = useState({
        incident_type: "discipline",
        severity: "medium",
        title: "",
        description: "",
        location: "",
        occurred_at: "",
    });

    const resetForm = () => {
        setFormData({
            incident_type: "discipline",
            severity: "medium",
            title: "",
            description: "",
            location: "",
            occurred_at: "",
        });
    };

    const handleOpenChange = (open: boolean) => {
        onOpenChange(open);
        if (!open) resetForm();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Signaler un incident</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Type d'incident</Label>
                            <Select
                                value={formData.incident_type}
                                onValueChange={(value) => setFormData({ ...formData, incident_type: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="discipline">Discipline</SelectItem>
                                    <SelectItem value="safety">Sécurité</SelectItem>
                                    <SelectItem value="health">Santé</SelectItem>
                                    <SelectItem value="property">Matériel</SelectItem>
                                    <SelectItem value="bullying">Harcèlement</SelectItem>
                                    <SelectItem value="other">Autre</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Gravité</Label>
                            <Select
                                value={formData.severity}
                                onValueChange={(value) => setFormData({ ...formData, severity: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="minor">Mineur</SelectItem>
                                    <SelectItem value="medium">Moyen</SelectItem>
                                    <SelectItem value="major">Majeur</SelectItem>
                                    <SelectItem value="critical">Critique</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Titre</Label>
                        <Input
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Résumé de l'incident"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Description détaillée</Label>
                        <Textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Décrivez ce qui s'est passé..."
                            rows={4}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Lieu</Label>
                            <Input
                                value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                placeholder="Cour, Salle 101..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Date et heure</Label>
                            <Input
                                type="datetime-local"
                                value={formData.occurred_at}
                                onChange={(e) => setFormData({ ...formData, occurred_at: e.target.value })}
                            />
                        </div>
                    </div>
                    <Button
                        onClick={() => onSubmit(formData)}
                        disabled={!formData.title || !formData.description || !formData.occurred_at || isPending}
                        className="w-full"
                        variant="destructive"
                    >
                        Signaler l'incident
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
