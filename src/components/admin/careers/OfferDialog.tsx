import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCurrency } from "@/hooks/useCurrency";

interface OfferDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    offer: any | null;
    onSubmit: (data: any) => void;
    isPending: boolean;
}

export function OfferDialog({ isOpen, onOpenChange, offer, onSubmit, isPending }: OfferDialogProps) {
    const { currency } = useCurrency();
    const [formData, setFormData] = useState({
        title: "",
        company_name: "",
        description: "",
        requirements: "",
        location: "",
        is_remote: false,
        offer_type: "INTERNSHIP",
        salary_range: "",
        start_date: "",
        end_date: "",
        application_deadline: "",
        contact_email: "",
        external_url: "",
    });

    useEffect(() => {
        if (offer) {
            setFormData({
                title: offer.title || "",
                company_name: offer.company_name || "",
                description: offer.description || "",
                requirements: offer.requirements || "",
                location: offer.location || "",
                is_remote: offer.is_remote || false,
                offer_type: offer.offer_type || "INTERNSHIP",
                salary_range: offer.salary_range || "",
                start_date: offer.start_date || "",
                end_date: offer.end_date || "",
                application_deadline: offer.application_deadline || "",
                contact_email: offer.contact_email || "",
                external_url: offer.external_url || "",
            });
        } else {
            setFormData({
                title: "",
                company_name: "",
                description: "",
                requirements: "",
                location: "",
                is_remote: false,
                offer_type: "INTERNSHIP",
                salary_range: "",
                start_date: "",
                end_date: "",
                application_deadline: "",
                contact_email: "",
                external_url: "",
            });
        }
    }, [offer, isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{offer ? "Modifier l'offre" : "Nouvelle offre"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Titre *</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Ex: Stage développeur web"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Entreprise *</Label>
                            <Input
                                value={formData.company_name}
                                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                                placeholder="Nom de l'entreprise"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Type d'offre *</Label>
                            <Select
                                value={formData.offer_type}
                                onValueChange={(v) => setFormData({ ...formData, offer_type: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="INTERNSHIP">Stage</SelectItem>
                                    <SelectItem value="JOB">Emploi</SelectItem>
                                    <SelectItem value="APPRENTICESHIP">Alternance</SelectItem>
                                    <SelectItem value="VOLUNTEER">Bénévolat</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Localisation</Label>
                            <Input
                                value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                placeholder="Paris, Lyon..."
                            />
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch
                            checked={formData.is_remote}
                            onCheckedChange={(checked) => setFormData({ ...formData, is_remote: checked })}
                        />
                        <Label>Télétravail possible</Label>
                    </div>
                    <div className="space-y-2">
                        <Label>Description *</Label>
                        <Textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Décrivez le poste..."
                            rows={4}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Prérequis</Label>
                        <Textarea
                            value={formData.requirements}
                            onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                            placeholder="Compétences requises..."
                            rows={3}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Rémunération</Label>
                            <Input
                                value={formData.salary_range}
                                onChange={(e) => setFormData({ ...formData, salary_range: e.target.value })}
                                placeholder={`Ex: 600 ${currency.symbol}/mois`}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Email de contact</Label>
                            <Input
                                type="email"
                                value={formData.contact_email}
                                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                                placeholder="recrutement@entreprise.com"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Date de début</Label>
                            <Input
                                type="date"
                                value={formData.start_date}
                                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Date de fin</Label>
                            <Input
                                type="date"
                                value={formData.end_date}
                                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Date limite candidature</Label>
                            <Input
                                type="date"
                                value={formData.application_deadline}
                                onChange={(e) => setFormData({ ...formData, application_deadline: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Lien externe</Label>
                        <Input
                            type="url"
                            value={formData.external_url}
                            onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                            placeholder="https://..."
                        />
                    </div>
                    <Button
                        onClick={() => onSubmit(formData)}
                        disabled={!formData.title || !formData.company_name || !formData.description || isPending}
                    >
                        {offer ? "Mettre à jour" : "Créer l'offre"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
