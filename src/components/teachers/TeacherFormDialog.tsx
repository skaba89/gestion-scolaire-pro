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
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
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
                    <DialogTitle>{t("teachingAdmin.ajouterUnProfesseur")}</DialogTitle>
                    <DialogDescription>
                        {t("teachingAdmin.lUtilisateurDoitAvoirUn")}
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>{t("teachingAdmin.email2")}</Label>
                            <Input
                                type="email"
                                placeholder={t("teachingAdmin.professeurEmailCom")}
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t("teachingAdmin.prenom")}</Label>
                                <Input
                                    placeholder={t("teachingAdmin.prenom")}
                                    value={formData.firstName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t("teachingAdmin.nom")}</Label>
                                <Input
                                    placeholder={t("teachingAdmin.nom")}
                                    value={formData.lastName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>{t("teachingAdmin.telephone")}</Label>
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
                            {t("teachingAdmin.ajouterLeProfesseur")}
                        </Button>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
