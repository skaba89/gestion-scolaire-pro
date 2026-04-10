import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

interface TeacherFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (formData: any) => void;
    isPending: boolean;
}

export const TeacherFormDialog = ({
    open,
    onOpenChange,
    onSubmit,
    isPending,
}: TeacherFormDialogProps) => {
    const [formData, setFormData] = useState({
        email: "",
        firstName: "",
        lastName: "",
        phone: "",
    });

    useEffect(() => {
        if (!open) {
            setFormData({ email: "", firstName: "", lastName: "", phone: "" });
        }
    }, [open]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>Ajouter un professeur</DialogTitle>
                    <DialogDescription>
                        L'utilisateur doit avoir un compte existant
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Email *</Label>
                            <Input
                                type="email"
                                placeholder="professeur@email.com"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Prénom</Label>
                                <Input
                                    placeholder="Prénom"
                                    value={formData.firstName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Nom</Label>
                                <Input
                                    placeholder="Nom"
                                    value={formData.lastName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Téléphone</Label>
                            <Input
                                type="tel"
                                placeholder="+33 6 00 00 00 00"
                                value={formData.phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                            />
                        </div>

                        <Button
                            className="w-full"
                            type="submit"
                            disabled={!formData.email || isPending}
                        >
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Ajouter le professeur
                        </Button>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
