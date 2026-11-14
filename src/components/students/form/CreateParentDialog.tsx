import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { parentSchema, ParentFormValues, Parent } from "./schema";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Form,
    FormField,
    FormItem,
    FormLabel,
    FormControl,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CreateParentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (parent: Parent) => void;
    tenantId: string;
}

export const CreateParentDialog = ({
    open,
    onOpenChange,
    onSuccess,
    tenantId,
}: CreateParentDialogProps) => {
    const { t } = useTranslation();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<ParentFormValues>({
        resolver: zodResolver(parentSchema),
        defaultValues: {
            first_name: "",
            last_name: "",
            email: "",
            phone: "",
            address: "",
        },
    });

    const onSubmit = async (values: ParentFormValues) => {
        setIsSubmitting(true);
        try {
            const { data } = await apiClient.post('/parents/', {
                ...values,
                tenant_id: tenantId,
            });

            const createdParent = data.data || data;

            toast.success(t("studentsAdmin.parentCreeAvecSucces"));
            onSuccess(createdParent);
            onOpenChange(false);
            form.reset();
        } catch (error: any) {
            console.error("Error creating parent:", error);
            toast.error(t("studentsAdmin.erreurlorsDeLaCreation") + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t("studentsAdmin.nouveauParent")}</DialogTitle>
                    <DialogDescription>
                        {t("studentsAdmin.ajoutezUnNouveauParentA")}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="first_name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("studentsAdmin.prenom2")}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t("studentsAdmin.jean")} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="last_name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("studentsAdmin.nom2")}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t("studentsAdmin.dupont")} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                            <FormLabel>{t("studentsAdmin.email2")}</FormLabel>
                                    <FormControl>
                                        <Input type="email" placeholder={t("studentsAdmin.emailExampleCom")} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("studentsAdmin.telephone2")}</FormLabel>
                                    <FormControl>
                                        <Input type="tel" placeholder={t("studentsAdmin.2246xxXxXxXx")} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("studentsAdmin.adresse")}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t("studentsAdmin.adresseComplete")} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end pt-4">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="mr-2">
                                {t("studentsAdmin.annuler")}
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {t("studentsAdmin.creer")}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};
