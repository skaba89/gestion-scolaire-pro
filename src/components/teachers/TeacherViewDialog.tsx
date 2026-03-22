import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraduationCap, Calendar } from "lucide-react";
import { useTeacherSchedule } from "@/features/staff/hooks/useStaff";
import { StaffProfile as TeacherProfile } from "@/features/staff/types";
import { useMemo } from "react";

// Helper type for schedule slot since it was also imported from useTeachers
interface TeacherScheduleSlot {
    id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    room_name: string | null;
    classrooms: { name: string } | null;
    subjects: { name: string } | null;
}

interface TeacherViewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    teacher: TeacherProfile | null;
    schedule: TeacherScheduleSlot[];
}

export const TeacherViewDialog = ({
    open,
    onOpenChange,
    teacher,
    schedule,
}: TeacherViewDialogProps) => {
    const getDayName = (day: number) => {
        const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
        return days[day] || "";
    };

    const scheduleByDay = useMemo(() => {
        return schedule.reduce((acc, slot) => {
            const day = slot.day_of_week;
            if (!acc[day]) acc[day] = [];
            acc[day].push(slot);
            return acc;
        }, {} as Record<number, TeacherScheduleSlot[]>);
    }, [schedule]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GraduationCap className="w-5 h-5" />
                        {teacher?.first_name} {teacher?.last_name}
                    </DialogTitle>
                    <DialogDescription>{teacher?.email}</DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <Tabs defaultValue="info" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="info">Informations</TabsTrigger>
                            <TabsTrigger value="schedule">Emploi du temps</TabsTrigger>
                        </TabsList>

                        <TabsContent value="info" className="space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Prénom</Label>
                                    <p className="font-medium">{teacher?.first_name || "—"}</p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Nom</Label>
                                    <p className="font-medium">{teacher?.last_name || "—"}</p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Email</Label>
                                    <p className="font-medium">{teacher?.email}</p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Téléphone</Label>
                                    <p className="font-medium">{teacher?.phone || "—"}</p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Statut</Label>
                                    <div>
                                        <Badge variant={teacher?.is_active ? "default" : "secondary"}>
                                            {teacher?.is_active ? "Actif" : "Inactif"}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="schedule" className="space-y-4 pt-4">
                            {schedule.length > 0 ? (
                                <div className="space-y-4">
                                    {[1, 2, 3, 4, 5, 6].map((day) => {
                                        const slots = scheduleByDay[day];
                                        if (!slots || slots.length === 0) return null;

                                        return (
                                            <div key={day}>
                                                <h4 className="font-semibold mb-2 flex items-center gap-2">
                                                    <Calendar className="w-4 h-4" />
                                                    {getDayName(day)}
                                                </h4>
                                                <div className="space-y-2">
                                                    {slots.map((slot) => (
                                                        <div
                                                            key={slot.id}
                                                            className="p-3 border rounded-lg bg-muted/30 flex items-center justify-between"
                                                        >
                                                            <div>
                                                                <p className="font-medium">{slot.subjects?.name}</p>
                                                                <p className="text-sm text-muted-foreground">
                                                                    {slot.classrooms?.name}
                                                                    {slot.room_name && ` • Salle ${slot.room_name}`}
                                                                </p>
                                                            </div>
                                                            <Badge variant="outline">
                                                                {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                                                            </Badge>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>Aucun cours assigné</p>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
