import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ClubCreateDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    isPending: boolean;
    categories: Record<string, any>;
}

export function ClubCreateDialog({
    isOpen,
    onOpenChange,
    onSubmit,
    isPending,
    categories,
}: ClubCreateDialogProps) {
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        category: "other",
        meeting_schedule: "",
        max_members: "",
    });

    useEffect(() => {
        if (!isOpen) {
            setFormData({
                name: "",
                description: "",
                category: "other",
                meeting_schedule: "",
                max_members: "",
            });
        }
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Créer un club</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label>Nom du club *</Label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Nom du club"
                        />
                    </div>
                    <div>
                        <Label>Description</Label>
                        <Textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Description..."
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Catégorie</Label>
                            <Select
                                value={formData.category}
                                onValueChange={(v) => setFormData({ ...formData, category: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(categories).map(([key, config]: [string, any]) => (
                                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Capacité max</Label>
                            <Input
                                type="number"
                                value={formData.max_members}
                                onChange={(e) => setFormData({ ...formData, max_members: e.target.value })}
                                placeholder="Illimité"
                            />
                        </div>
                    </div>
                    <div>
                        <Label>Planning des réunions</Label>
                        <Input
                            value={formData.meeting_schedule}
                            onChange={(e) => setFormData({ ...formData, meeting_schedule: e.target.value })}
                            placeholder="Ex: Tous les lundis à 16h"
                        />
                    </div>
                    <Button
                        className="w-full"
                        onClick={() => onSubmit(formData)}
                        disabled={!formData.name || isPending}
                    >
                        Créer le club
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
