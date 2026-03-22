import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Megaphone, Pin, Calendar, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

export const RecentAnnouncements = () => {
    const { tenant } = useTenant();

    const { data: announcements = [], isLoading } = useQuery({
        queryKey: ["recent-announcements", tenant?.id],
        queryFn: async () => {
            if (!tenant?.id) return [];
            const { data, error } = await supabase
                .from("announcements")
                .select("*")
                .eq("tenant_id", tenant.id)
                .is("deleted_at", null)
                .order("pinned", { ascending: false })
                .order("created_at", { ascending: false })
                .limit(3);

            if (error) throw error;
            return data;
        },
        enabled: !!tenant?.id,
    });

    if (isLoading) {
        return (
            <Card>
                <CardContent className="py-12 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    if (announcements.length === 0) return null;

    return (
        <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Megaphone className="h-5 w-5 text-primary" />
                    Annonces Officielles
                </CardTitle>
                <CardDescription>Dernières communications de l'établissement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {announcements.map((announcement) => (
                    <div
                        key={announcement.id}
                        className={cn(
                            "p-3 rounded-lg border bg-card transition-all hover:shadow-sm",
                            announcement.pinned && "border-primary/30"
                        )}
                    >
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="font-semibold text-sm flex items-center gap-1.5">
                                {announcement.pinned && <Pin className="h-3 w-3 text-primary fill-primary" />}
                                {announcement.title}
                            </h4>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
                                <Calendar className="h-2.5 w-2.5" />
                                {format(new Date(announcement.created_at), "d MMM", { locale: fr })}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {announcement.content}
                        </p>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
};
