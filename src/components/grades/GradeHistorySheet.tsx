import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History, User, MessageSquare, Clock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface GradeHistorySheetProps {
    gradeId?: string;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    studentName?: string;
}

const GradeHistorySheet = ({ gradeId, isOpen, onOpenChange, studentName }: GradeHistorySheetProps) => {
    const { data: history, isLoading } = useQuery({
        queryKey: ["grade-history", gradeId],
        queryFn: async () => {
            if (!gradeId) return [];
            const { data, error } = await supabase
                .from("grade_history")
                .select(`
          *,
          user:changed_by (first_name, last_name)
        `)
                .eq("grade_id", gradeId)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!gradeId && isOpen,
    });

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-md overflow-y-auto">
                <SheetHeader>
                    <div className="flex items-center gap-2 mb-2">
                        <History className="w-5 h-5 text-primary" />
                        <SheetTitle>Historique de modification</SheetTitle>
                    </div>
                    <SheetDescription>
                        Traçabilité des changements pour <strong>{studentName || "cet élève"}</strong>
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6">
                    {isLoading ? (
                        <p className="text-center text-muted-foreground py-8">Chargement de l'historique...</p>
                    ) : !history || history.length === 0 ? (
                        <div className="text-center py-12 border rounded-xl bg-muted/30">
                            <History className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                            <p className="text-muted-foreground">Aucun historique disponible</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {history.map((entry) => (
                                <div key={entry.id} className="relative pl-6 pb-6 border-l last:pb-0">
                                    <div className="absolute left-[-5px] top-0 w-2 h-2 rounded-full bg-primary" />

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                <User className="w-3 h-3 text-muted-foreground" />
                                                {entry.user?.first_name} {entry.user?.last_name}
                                            </div>
                                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                <Clock className="w-3 h-3" />
                                                {format(new Date(entry.created_at), "d MMM yyyy HH:mm", { locale: fr })}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <Badge variant="outline" className="text-muted-foreground">
                                                {entry.old_score ?? "?"}
                                            </Badge>
                                            <span className="text-muted-foreground">→</span>
                                            <Badge variant="default" className="bg-primary text-white">
                                                {entry.new_score}
                                            </Badge>
                                        </div>

                                        <div className="bg-muted/50 p-2 rounded-lg flex gap-2 items-start">
                                            <MessageSquare className="w-3 h-3 text-muted-foreground mt-1 shrink-0" />
                                            <p className="text-xs text-foreground leading-relaxed italic">
                                                "{entry.change_reason || "Aucun motif spécifié"}"
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};

export default GradeHistorySheet;
