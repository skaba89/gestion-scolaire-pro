import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ResourceDialogProps {
    resource: any | null;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    isPending: boolean;
    categories: any[];
    resourceTypes: Record<string, string>;
}

export function ResourceDialog({
    resource,
    isOpen,
    onOpenChange,
    onSubmit,
    isPending,
    categories,
    resourceTypes,
}: ResourceDialogProps) {
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        author: "",
        resource_type: "document",
        external_url: "",
        isbn: "",
        publication_year: "",
        tags: "",
        is_featured: false,
        is_public: false,
        category_id: "",
    });

    useEffect(() => {
        if (resource) {
            setFormData({
                title: resource.title || "",
                description: resource.description || "",
                author: resource.author || "",
                resource_type: resource.resource_type || "document",
                external_url: resource.external_url || "",
                isbn: resource.isbn || "",
                publication_year: resource.publication_year?.toString() || "",
                tags: resource.tags?.join(", ") || "",
                is_featured: resource.is_featured || false,
                is_public: resource.is_public || false,
                category_id: resource.category_id || "",
            });
        } else {
            setFormData({
                title: "",
                description: "",
                author: "",
                resource_type: "document",
                external_url: "",
                isbn: "",
                publication_year: "",
                tags: "",
                is_featured: false,
                is_public: false,
                category_id: "",
            });
        }
    }, [resource, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {resource ? "Modifier la ressource" : "Nouvelle ressource"}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Titre *</Label>
                                <Input
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <Label>Type</Label>
                                <Select
                                    value={formData.resource_type}
                                    onValueChange={(v) => setFormData({ ...formData, resource_type: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(resourceTypes).map(([value, label]) => (
                                            <SelectItem key={value} value={value}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label>Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                rows={3}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Auteur</Label>
                                <Input
                                    value={formData.author}
                                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Catégorie</Label>
                                <Select
                                    value={formData.category_id}
                                    onValueChange={(v) => setFormData({ ...formData, category_id: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Sélectionner..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categories?.map((cat: any) => (
                                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label>URL externe (lien, vidéo, etc.)</Label>
                            <Input
                                type="url"
                                value={formData.external_url}
                                onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                                placeholder="https://..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>ISBN</Label>
                                <Input
                                    value={formData.isbn}
                                    onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Année de publication</Label>
                                <Input
                                    type="number"
                                    value={formData.publication_year}
                                    onChange={(e) => setFormData({ ...formData, publication_year: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <Label>Tags (séparés par des virgules)</Label>
                            <Input
                                value={formData.tags}
                                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                                placeholder="mathématiques, algèbre, exercices"
                            />
                        </div>

                        <div className="flex gap-4">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={formData.is_featured}
                                    onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                                />
                                <span className="text-sm">Mettre en avant</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={formData.is_public}
                                    onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                                />
                                <span className="text-sm font-medium text-primary">Partager sur le Marketplace global</span>
                            </label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isPending}>
                            {resource ? "Enregistrer" : "Ajouter"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
