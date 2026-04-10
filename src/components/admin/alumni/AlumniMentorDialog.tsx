import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface AlumniMentorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    editingMentor: any | null;
}

export function AlumniMentorDialog({
    open,
    onOpenChange,
    onSubmit,
    editingMentor
}: AlumniMentorDialogProps) {
    const [form, setForm] = useState({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        graduation_year: "",
        current_company: "",
        current_position: "",
        industry: "",
        expertise_areas: [] as string[],
        bio: "",
        linkedin_url: "",
        is_available: true,
        max_mentees: "3",
    });

    const [expertiseInput, setExpertiseInput] = useState("");

    useEffect(() => {
        if (editingMentor) {
            setForm({
                first_name: editingMentor.first_name || "",
                last_name: editingMentor.last_name || "",
                email: editingMentor.email || "",
                phone: editingMentor.phone || "",
                graduation_year: editingMentor.graduation_year?.toString() || "",
                current_company: editingMentor.current_company || "",
                current_position: editingMentor.current_position || "",
                industry: editingMentor.industry || "",
                expertise_areas: editingMentor.expertise_areas || [],
                bio: editingMentor.bio || "",
                linkedin_url: editingMentor.linkedin_url || "",
                is_available: editingMentor.is_available ?? true,
                max_mentees: editingMentor.max_mentees?.toString() || "3",
            });
        } else {
            setForm({
                first_name: "",
                last_name: "",
                email: "",
                phone: "",
                graduation_year: "",
                current_company: "",
                current_position: "",
                industry: "",
                expertise_areas: [],
                bio: "",
                linkedin_url: "",
                is_available: true,
                max_mentees: "3",
            });
        }
    }, [editingMentor, open]);

    const addExpertise = () => {
        if (expertiseInput.trim() && !form.expertise_areas.includes(expertiseInput.trim())) {
            setForm({
                ...form,
                expertise_areas: [...form.expertise_areas, expertiseInput.trim()],
            });
            setExpertiseInput("");
        }
    };

    const removeExpertise = (expertise: string) => {
        setForm({
            ...form,
            expertise_areas: form.expertise_areas.filter((e) => e !== expertise),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingMentor ? "Modifier le mentor" : "Ajouter un mentor"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Prénom *</Label>
                            <Input
                                value={form.first_name}
                                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Nom *</Label>
                            <Input
                                value={form.last_name}
                                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Email *</Label>
                            <Input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Téléphone</Label>
                            <Input
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Année de promotion</Label>
                            <Input
                                type="number"
                                value={form.graduation_year}
                                onChange={(e) => setForm({ ...form, graduation_year: e.target.value })}
                                placeholder="2020"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Secteur d'activité</Label>
                            <Input
                                value={form.industry}
                                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                                placeholder="Tech, Finance..."
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Entreprise actuelle</Label>
                            <Input
                                value={form.current_company}
                                onChange={(e) => setForm({ ...form, current_company: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Poste actuel</Label>
                            <Input
                                value={form.current_position}
                                onChange={(e) => setForm({ ...form, current_position: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Domaines d'expertise</Label>
                        <div className="flex gap-2">
                            <Input
                                value={expertiseInput}
                                onChange={(e) => setExpertiseInput(e.target.value)}
                                placeholder="Ajouter une expertise..."
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExpertise())}
                            />
                            <Button type="button" variant="outline" onClick={addExpertise}>
                                Ajouter
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {form.expertise_areas.map((exp) => (
                                <Badge key={exp} variant="secondary" className="gap-1">
                                    {exp}
                                    <X
                                        className="h-3 w-3 cursor-pointer"
                                        onClick={() => removeExpertise(exp)}
                                    />
                                </Badge>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Bio</Label>
                        <Textarea
                            value={form.bio}
                            onChange={(e) => setForm({ ...form, bio: e.target.value })}
                            placeholder="Présentez-vous..."
                            rows={3}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Profil LinkedIn</Label>
                            <Input
                                type="url"
                                value={form.linkedin_url}
                                onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                                placeholder="https://linkedin.com/in/..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Nombre max de mentorés</Label>
                            <Input
                                type="number"
                                value={form.max_mentees}
                                onChange={(e) => setForm({ ...form, max_mentees: e.target.value })}
                                min="1"
                                max="10"
                            />
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch
                            checked={form.is_available}
                            onCheckedChange={(checked) => setForm({ ...form, is_available: checked })}
                        />
                        <Label>Disponible pour du mentorat</Label>
                    </div>
                    <Button
                        onClick={() => onSubmit(form)}
                        disabled={!form.first_name || !form.last_name || !form.email}
                    >
                        {editingMentor ? "Mettre à jour" : "Ajouter le mentor"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
