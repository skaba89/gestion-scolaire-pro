import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StudentFormValues } from "./schema";

interface StudentContactSectionProps {
    form: UseFormReturn<StudentFormValues>;
}

export const StudentContactSection = ({ form }: StudentContactSectionProps) => {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Email */}
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input type="email" placeholder="jean.dupont@example.com" {...field} />
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
                            <FormLabel>Téléphone</FormLabel>
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
                        <FormLabel>Adresse</FormLabel>
                        <FormControl>
                            <Textarea placeholder="123 Rue de la Paix" className="resize-none" {...field} />
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
                            <FormLabel>Code Postal</FormLabel>
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
                            <FormLabel>Ville</FormLabel>
                            <FormControl>
                                <Input placeholder="Paris" {...field} />
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
                            <FormLabel>Région / État</FormLabel>
                            <FormControl>
                                <Input placeholder="Île-de-France" {...field} />
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
                            <FormLabel>Pays</FormLabel>
                            <FormControl>
                                <Input placeholder="France" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        </div>
    );
};
