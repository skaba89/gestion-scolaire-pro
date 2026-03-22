import {
    Calendar,
    Clock,
    Loader2,
    MapPin,
    Users,
    Trash2,
    School
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScheduleSlot } from "@/queries/schedule";

interface ScheduleGridProps {
    days: { value: number, label: string }[];
    timeSlots: string[];
    scheduleSlots: ScheduleSlot[];
    loading: boolean;
    onDeleteSlot: (id: string) => void;
    selectedClassroom: string;
    hasClasses: boolean;
}

const SUBJECT_COLORS = [
    { bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800", text: "text-blue-700 dark:text-blue-300" },
    { bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-300" },
    { bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-200 dark:border-purple-800", text: "text-purple-700 dark:text-purple-300" },
    { bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-300" },
    { bg: "bg-pink-50 dark:bg-pink-900/20", border: "border-pink-200 dark:border-pink-800", text: "text-pink-700 dark:text-pink-300" },
    { bg: "bg-indigo-50 dark:bg-indigo-900/20", border: "border-indigo-200 dark:border-indigo-800", text: "text-indigo-700 dark:text-indigo-300" },
];

export const ScheduleGrid = ({
    days,
    timeSlots,
    scheduleSlots,
    loading,
    onDeleteSlot,
    selectedClassroom,
    hasClasses,
}: ScheduleGridProps) => {

    const getSlotForDayAndTime = (day: number, time: string) => {
        return (scheduleSlots || []).filter(
            (slot) => slot && slot.day_of_week === day && slot.start_time && slot.start_time.startsWith(time)
        );
    };

    const getSubjectColor = (subjectId: string) => {
        // Basic hash to keep colors consistent for the same subject
        let hash = 0;
        for (let i = 0; i < subjectId.length; i++) {
            hash = subjectId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash);
        return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
    };

    return (
        <Card className="border-none shadow-xl rounded-2xl overflow-hidden bg-background/60 backdrop-blur-md">
            <CardHeader className="bg-primary/5 border-b border-primary/10">
                <CardTitle className="flex items-center gap-3 text-2xl font-display">
                    <Calendar className="w-6 h-6 text-primary" />
                    Grille hebdomadaire
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="w-12 h-12 animate-spin text-primary" />
                        <p className="text-muted-foreground font-medium">Chargement du planning...</p>
                    </div>
                ) : !hasClasses ? (
                    <div className="text-center py-20 bg-muted/20">
                        <School className="w-16 h-16 mx-auto mb-4 opacity-20 text-muted-foreground" />
                        <h3 className="text-xl font-bold">Aucune classe disponible</h3>
                        <p className="text-muted-foreground">Créez d'abord des classes pour gérer les emplois du temps.</p>
                    </div>
                ) : !selectedClassroom || selectedClassroom === "none" ? (
                    <div className="text-center py-20">
                        <p className="text-muted-foreground font-medium">Sélectionnez une classe ci-dessus pour afficher son planning.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-100/50 dark:bg-slate-800/50">
                                    <th className="p-4 border-r border-slate-200 dark:border-slate-700 w-24">
                                        <Clock className="w-5 h-5 mx-auto text-muted-foreground" />
                                    </th>
                                    {days.map((day) => (
                                        <th key={day.value} className="p-4 border-b border-l border-slate-200 dark:border-slate-700 text-center font-display font-bold text-foreground min-w-[180px]">
                                            {day.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {timeSlots.slice(0, -1).map((time, index) => (
                                    <tr key={time} className="group hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                                        <td className="p-4 border-r border-b border-slate-200 dark:border-slate-700 text-xs font-black text-muted-foreground text-center">
                                            {time}<br />{timeSlots[index + 1]}
                                        </td>
                                        {days.map((day) => {
                                            const slots = getSlotForDayAndTime(day.value, time);
                                            return (
                                                <td key={day.value} className="p-1 border-b border-l border-slate-200 dark:border-slate-700 h-28 relative bg-transparent">
                                                    {slots.map((slot) => {
                                                        const colors = getSubjectColor(slot.subject_id);
                                                        return (
                                                            <div
                                                                key={slot.id}
                                                                className={`${colors.bg} border-l-4 ${colors.border} rounded-lg p-3 h-full flex flex-col justify-between group/slot shadow-sm hover:shadow-md transition-all animate-in fade-in zoom-in duration-300`}
                                                            >
                                                                <div>
                                                                    <p className={`font-bold text-sm mb-1 ${colors.text}`}>{slot.subject?.name || "Matière"}</p>
                                                                    {slot.teacher && (
                                                                        <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                                                                            <Users className="w-3 h-3" />
                                                                            {slot.teacher.first_name} {slot.teacher.last_name}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center justify-between mt-auto">
                                                                    <div className="flex items-center gap-1 text-[10px] bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded border border-white/50">
                                                                        <MapPin className="w-2.5 h-2.5" />
                                                                        <span className="font-bold">{slot.room?.name || "Salle"}</span>
                                                                    </div>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-6 w-6 opacity-0 group-hover/slot:opacity-100 hover:bg-rose-100 hover:text-rose-600 transition-all rounded-full"
                                                                        onClick={() => onDeleteSlot(slot.id)}
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
