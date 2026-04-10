import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface EventDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    event: any | null;
    onSubmit: (data: any) => void;
    isPending: boolean;
}

export function EventDialog({ isOpen, onOpenChange, event, onSubmit, isPending }: EventDialogProps) {
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        event_type: "workshop",
        location: "",
        is_online: false,
        meeting_url: "",
        start_datetime: "",
        end_datetime: "",
        max_participants: "",
        registration_deadline: "",
    });

    useEffect(() => {
        if (event) {
            setFormData({
                title: event.title || "",
                description: event.description || "",
                event_type: event.event_type || "workshop",
                location: event.location || "",
                is_online: event.is_online || false,
                meeting_url: event.meeting_url || "",
                start_datetime: event.start_datetime ? event.start_datetime.slice(0, 16) : "",
                end_datetime: event.end_datetime ? event.end_datetime.slice(0, 16) : "",
                max_participants: event.max_participants?.toString() || "",
                registration_deadline: event.registration_deadline ? event.registration_deadline.slice(0, 16) : "",
            });
        } else {
            setFormData({
                title: "",
                description: "",
                event_type: "workshop",
                location: "",
                is_online: false,
                meeting_url: "",
                start_datetime: "",
                end_datetime: "",
                max_participants: "",
                registration_deadline: "",
            });
        }
    }, [event, isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{event ? "Modifier l'événement" : "Nouvel événement"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Titre *</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Ex: Atelier CV"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Type d'événement</Label>
                            <Select
                                value={formData.event_type}
                                onValueChange={(v) => setFormData({ ...formData, event_type: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="workshop">Atelier</SelectItem>
                                    <SelectItem value="conference">Conférence</SelectItem>
                                    <SelectItem value="fair">Salon</SelectItem>
                                    <SelectItem value="networking">Networking</SelectItem>
                                    <SelectItem value="webinar">Webinaire</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Décrivez l'événement..."
                            rows={3}
                        />
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch
                            checked={formData.is_online}
                            onCheckedChange={(checked) => setFormData({ ...formData, is_online: checked })}
                        />
                        <Label>Événement en ligne</Label>
                    </div>
                    <div className="space-y-2">
                        <Label>{formData.is_online ? "Lien de la réunion" : "Lieu"}</Label>
                        <Input
                            value={formData.is_online ? formData.meeting_url : formData.location}
                            onChange={(e) => setFormData({ ...formData, [formData.is_online ? "meeting_url" : "location"]: e.target.value })}
                            placeholder={formData.is_online ? "https://..." : "Lieu physique"}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Date de début *</Label>
                            <Input
                                type="datetime-local"
                                value={formData.start_datetime}
                                onChange={(e) => setFormData({ ...formData, start_datetime: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Date de fin</Label>
                            <Input
                                type="datetime-local"
                                value={formData.end_datetime}
                                onChange={(e) => setFormData({ ...formData, end_datetime: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Nombre max. participants</Label>
                            <Input
                                type="number"
                                value={formData.max_participants}
                                onChange={(e) => setFormData({ ...formData, max_participants: e.target.value })}
                                placeholder="Ex: 50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Date limite inscription</Label>
                            <Input
                                type="datetime-local"
                                value={formData.registration_deadline}
                                onChange={(e) => setFormData({ ...formData, registration_deadline: e.target.value })}
                            />
                        </div>
                    </div>
                    <Button
                        onClick={() => onSubmit(formData)}
                        disabled={!formData.title || !formData.start_datetime || isPending}
                    >
                        {event ? "Mettre à jour" : "Créer l'événement"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
