import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Pin, Loader2 } from "lucide-react";

const ALL_ROLES = ["TENANT_ADMIN", "DIRECTOR", "TEACHER", "STUDENT", "PARENT", "STAFF"] as const;

interface AnnouncementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    isPending: boolean;
    roleLabels: Record<string, string>;
}

export const AnnouncementDialog = ({
    open,
    onOpenChange,
    onSubmit,
    isPending,
    roleLabels,
}: AnnouncementDialogProps) => {
    const [formData, setFormData] = useState({
        title: "",
        content: "",
        target_roles: [...ALL_ROLES] as string[],
        pinned: false,
    });

    useEffect(() => {
        if (!open) {
            setFormData({
                title: "",
                content: "",
                target_roles: [...ALL_ROLES] as string[],
                pinned: false,
            });
        }
    }, [open]);

    const toggleRole = (role: string) => {
        setFormData(prev => ({
            ...prev,
            target_roles: prev.target_roles.includes(role)
                ? prev.target_roles.filter(r => r !== role)
                : [...prev.target_roles, role]
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Publier une annonce</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label>Titre *</Label>
                        <Input
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Avis important..."
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Contenu *</Label>
                        <Textarea
                            value={formData.content}
                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            placeholder="Rédigez votre annonce ici..."
                            rows={5}
                            required
                        />
                    </div>
                    <div className="space-y-3">
                        <Label className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Audience cible
                        </Label>
                        <div className="grid grid-cols-2 gap-2 border rounded-md p-3 bg-muted/30">
                            {ALL_ROLES.map((role) => (
                                <div key={role} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`role-${role}`}
                                        checked={formData.target_roles.includes(role)}
                                        onCheckedChange={() => toggleRole(role)}
                                    />
                                    <Label htmlFor={`role-${role}`} className="text-sm cursor-pointer">
                                        {roleLabels[role] || role}
                                    </Label>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                        <Label className="flex items-center gap-2">
                            <Pin className="h-4 w-4" />
                            Épingler l'annonce
                        </Label>
                        <Checkbox
                            checked={formData.pinned}
                            onCheckedChange={(checked) => setFormData({ ...formData, pinned: !!checked })}
                        />
                    </div>
                    <Button
                        className="w-full"
                        type="submit"
                        disabled={!formData.title || !formData.content || isPending}
                    >
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Publier l'annonce
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
};
