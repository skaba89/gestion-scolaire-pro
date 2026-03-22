import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar as CalendarIcon } from "lucide-react";

const eventSchema = z.object({
    title: z.string().min(3, "Le titre doit faire au moins 3 caractères"),
    description: z.string().optional(),
    event_type: z.string().min(1, "Veuillez choisir un type"),
    start_date: z.string().min(1, "La date de début est requise"),
    end_date: z.string().optional(),
    location: z.string().optional(),
    max_participants: z.coerce.number().optional(),
    registration_required: z.boolean().default(false),
    is_public: z.boolean().default(true),
});

type EventFormValues = z.infer<typeof eventSchema>;

interface EventDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: EventFormValues) => void;
    initialData?: Partial<EventFormValues>;
}

export const EventDialog = ({
    open,
    onOpenChange,
    onSubmit,
    initialData
}: EventDialogProps) => {
    const form = useForm<EventFormValues>({
        resolver: zodResolver(eventSchema),
        defaultValues: {
            title: "",
            description: "",
            event_type: "general",
            start_date: new Date().toISOString().slice(0, 16),
            location: "",
            max_participants: 0,
            registration_required: false,
            is_public: true,
            ...initialData
        },
    });

    useEffect(() => {
        if (open && initialData) {
            form.reset({
                ...form.getValues(),
                ...initialData
            });
        }
    }, [open, initialData, form]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5 text-primary" />
                        {initialData ? "Modifier l'événement" : "Créer un nouvel événement"}
                    </DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
                        <div className="grid md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem className="col-span-2">
                                        <FormLabel>Titre de l'événement</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ex: Fête de fin d'année" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="event_type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Type d'événement</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Choisir un type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="general">Général</SelectItem>
                                                <SelectItem value="academic">Académique</SelectItem>
                                                <SelectItem value="sport">Sport</SelectItem>
                                                <SelectItem value="cultural">Culturel</SelectItem>
                                                <SelectItem value="celebration">Célébration</SelectItem>
                                                <SelectItem value="announcement">Annonce</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="location"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Lieu</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ex: Grande cour, Salle 10..." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="start_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Date et heure de début</FormLabel>
                                        <FormControl>
                                            <Input type="datetime-local" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="end_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Date et heure de fin (optionnel)</FormLabel>
                                        <FormControl>
                                            <Input type="datetime-local" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem className="col-span-2">
                                        <FormLabel>Description</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Détails de l'événement..."
                                                className="min-h-[100px]"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="col-span-2 space-y-4 p-4 border rounded-lg bg-muted/30">
                                <h4 className="font-medium text-sm">Paramètres avancés</h4>

                                <div className="grid md:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="registration_required"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center justify-between space-y-0 gap-4 p-2 rounded-md hover:bg-muted/50 transition-colors">
                                                <div>
                                                    <FormLabel>Inscription requise</FormLabel>
                                                    <FormDescription className="text-[10px]">
                                                        Les parents/élèves doivent s'inscrire
                                                    </FormDescription>
                                                </div>
                                                <FormControl>
                                                    <Switch
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="is_public"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center justify-between space-y-0 gap-4 p-2 rounded-md hover:bg-muted/50 transition-colors">
                                                <div>
                                                    <FormLabel>Événement public</FormLabel>
                                                    <FormDescription className="text-[10px]">
                                                        Visible par tous les utilisateurs
                                                    </FormDescription>
                                                </div>
                                                <FormControl>
                                                    <Switch
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {form.watch("registration_required") && (
                                    <FormField
                                        control={form.control}
                                        name="max_participants"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Nombre maximum de participants</FormLabel>
                                                <FormControl>
                                                    <Input type="number" {...field} />
                                                </FormControl>
                                                <FormDescription className="text-xs">
                                                    Laissez 0 pour illimité
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Annuler
                            </Button>
                            <Button type="submit">
                                {initialData ? "Sauvegarder les modifications" : "Créer l'événement"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};
