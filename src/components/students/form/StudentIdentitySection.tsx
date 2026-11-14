import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudentFormValues } from "./schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "react-i18next";

interface StudentIdentitySectionProps {
    form: UseFormReturn<StudentFormValues>;
    photoPreview: string | null;
    handlePhotoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const StudentIdentitySection = ({ form, photoPreview, handlePhotoSelect }: StudentIdentitySectionProps) => {
    const { t } = useTranslation();
    return (
        <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-muted/10">
                <Avatar className="w-24 h-24">
                    {photoPreview ? (
                        <AvatarImage src={photoPreview} alt={t("studentsAdmin.apercu")} className="object-cover" />
                    ) : (
                        <AvatarFallback>
                            <User className="w-12 h-12 text-muted-foreground" />
                        </AvatarFallback>
                    )}
                </Avatar>
                <div className="flex flex-col items-center gap-2">
                    <Label htmlFor="photo-upload" className="cursor-pointer">
                        <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-muted transition-colors">
                            <Upload className="w-4 h-4" />
                            {photoPreview ? t("studentsAdmin.changerLaPhoto") : t("studentsAdmin.ajouterUnePhoto")}
                        </div>
                    </Label>
                    <Input
                        id="photo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoSelect}
                    />
                    <p className="text-xs text-muted-foreground">
                        {t("studentsAdmin.formatRecommandeJpgOuPng")}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    name="date_of_birth"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("studentsAdmin.dateDeNaissance")}</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("studentsAdmin.genre")}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t("studentsAdmin.selectionnerLeGenre")} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="M">{t("studentsAdmin.masculin")}</SelectItem>
                                    <SelectItem value="F">{t("studentsAdmin.feminin")}</SelectItem>
                                    <SelectItem value="O">{t("studentsAdmin.autre")}</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="nationality"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("studentsAdmin.nationalite")}</FormLabel>
                            <FormControl>
                                <Input placeholder={t("studentsAdmin.francaise")} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="student_id_card"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                {t("studentsAdmin.numeroCniPasseport")}
                                <HelpTooltip content={t("studentsAdmin.numeroUniqueDeLaCarte")} />
                            </FormLabel>
                            <FormControl>
                                <Input placeholder={t("studentsAdmin.ab123456")} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        </div>
    );
};
