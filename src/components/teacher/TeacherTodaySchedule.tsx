import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock } from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";
import { TeacherScheduleSlot } from "@/hooks/queries/useTeacherData";

interface TeacherTodayScheduleProps {
    schedule: TeacherScheduleSlot[];
}

export const TeacherTodaySchedule = ({ schedule }: TeacherTodayScheduleProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Emploi du Temps - Aujourd'hui
                </CardTitle>
            </CardHeader>
            <CardContent>
                {schedule.length > 0 ? (
                    <StaggerContainer className="space-y-3">
                        {schedule.map((slot, idx) => (
                            <StaggerItem key={slot.id} index={idx}>
                                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-transparent hover:border-primary/20 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1 text-sm font-medium text-primary">
                                            <Clock className="w-4 h-4" />
                                            {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                                        </div>
                                        <div>
                                            <p className="font-medium">{slot.subject?.name || "Sans titre"}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {slot.classroom?.name}
                                                {slot.room?.name && ` • Salle ${slot.room.name}`}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </StaggerItem>
                        ))}
                    </StaggerContainer>
                ) : (
                    <div className="text-center py-8">
                        <Calendar className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                        <p className="text-muted-foreground">Aucun cours aujourd'hui</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
