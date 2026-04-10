import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface CourseDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    course: any;
    onSubmit: (data: any) => void;
    isPending: boolean;
}

export function CourseDialog({ isOpen, onOpenChange, course, onSubmit, isPending }: CourseDialogProps) {
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        category: "",
        level: "all",
        thumbnail_url: "",
        status: "draft",
        is_free: false,
        duration_hours: "",
    });

    useEffect(() => {
        if (course) {
            setFormData({
                title: course.title || "",
                description: course.description || "",
                category: course.category || "",
                level: course.level || "all",
                thumbnail_url: course.thumbnail_url || "",
                status: course.status || "draft",
                is_free: course.is_free || false,
                duration_hours: course.duration_hours?.toString() || "",
            });
        } else {
            setFormData({
                title: "",
                description: "",
                category: "",
                level: "all",
                thumbnail_url: "",
                status: "draft",
                is_free: false,
                duration_hours: "",
            });
        }
    }, [course]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{course ? "Modifier le cours" : "Nouveau cours"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Titre *</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Ex: Introduction à React"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Catégorie</Label>
                            <Input
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                placeholder="Ex: Programmation"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Décrivez le contenu du cours..."
                            rows={3}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Niveau</Label>
                            <Select
                                value={formData.level}
                                onValueChange={(v) => setFormData({ ...formData, level: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous niveaux</SelectItem>
                                    <SelectItem value="beginner">Débutant</SelectItem>
                                    <SelectItem value="intermediate">Intermédiaire</SelectItem>
                                    <SelectItem value="advanced">Avancé</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Durée estimée (heures)</Label>
                            <Input
                                type="number"
                                value={formData.duration_hours}
                                onChange={(e) => setFormData({ ...formData, duration_hours: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Image miniature (URL)</Label>
                        <Input
                            value={formData.thumbnail_url}
                            onChange={(e) => setFormData({ ...formData, thumbnail_url: e.target.value })}
                            placeholder="https://images.unsplash.com/..."
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <Switch
                                checked={formData.is_free}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_free: checked })}
                            />
                            <Label>Cours gratuit</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Label>Statut</Label>
                            <Select
                                value={formData.status}
                                onValueChange={(v) => setFormData({ ...formData, status: v })}
                            >
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="draft">Brouillon</SelectItem>
                                    <SelectItem value="published">Publié</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Button
                        onClick={() => onSubmit(formData)}
                        disabled={!formData.title || isPending}
                        className="w-full"
                    >
                        {course ? "Mettre à jour" : "Créer le cours"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
