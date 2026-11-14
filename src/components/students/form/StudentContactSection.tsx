import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StudentFormValues } from "./schema";
import { useTranslation } from "react-i18next";

interface StudentContactSectionProps {
    form: UseFormReturn<StudentFormValues>;
}

export const StudentContactSection = ({ form }: StudentContactSectionProps) => {
    const { t } = useTranslation();
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Email */}
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("studentsAdmin.email")}</FormLabel>
                            <FormControl>
                                <Input type="email" placeholder={t("studentsAdmin.jeanDupontExampleCom")} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Phone */}
                <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("studentsAdmin.telephone")}</FormLabel>
                            <FormControl>
                                <Input type="tel" placeholder="+33 6 12 34 56 78" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Address */}
            <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>{t("studentsAdmin.adresse")}</FormLabel>
                        <FormControl>
                            <Textarea placeholder={t("studentsAdmin.123RueDeLaPaix")} className="resize-none" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Postal Code */}
                <FormField
                    control={form.control}
                    name="postal_code"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("studentsAdmin.codePostal")}</FormLabel>
                            <FormControl>
                                <Input placeholder="75001" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* City */}
                <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("studentsAdmin.ville")}</FormLabel>
                            <FormControl>
                                <Input placeholder={t("studentsAdmin.paris")} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* State */}
                <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("studentsAdmin.regionEtat")}</FormLabel>
                            <FormControl>
                                <Input placeholder={t("studentsAdmin.ileDeFrance")} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Country */}
                <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("studentsAdmin.pays")}</FormLabel>
                            <FormControl>
                                <Input placeholder={t("studentsAdmin.france")} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        </div>
    );
};
