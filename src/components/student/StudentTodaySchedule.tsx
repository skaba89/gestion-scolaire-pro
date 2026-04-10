import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar } from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";

interface ScheduleSlot {
    id: string;
    start_time: string;
    end_time: string;
    room?: string;
    subjects?: { name: string };
    profiles?: { first_name: string; last_name: string };
}

interface StudentTodayScheduleProps {
    schedule: ScheduleSlot[];
}

export const StudentTodaySchedule = ({ schedule }: StudentTodayScheduleProps) => {
    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-display">
                    <Clock className="w-5 h-5 text-primary" />
                    Cours d'aujourd'hui
                </CardTitle>
            </CardHeader>
            <CardContent>
                {schedule.length === 0 ? (
                    <div className="text-center py-8">
                        <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-muted-foreground">Aucun cours aujourd'hui</p>
                    </div>
                ) : (
                    <StaggerContainer className="space-y-3">
                        {schedule.map((slot, idx) => (
                            <StaggerItem key={slot.id} index={idx}>
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-transparent hover:border-primary/20 transition-all duration-200">
                                    <div className="text-sm font-bold text-primary w-24">
                                        {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-sm">{slot.subjects?.name || "Matière"}</p>
                                        {slot.profiles && (
                                            <p className="text-xs text-muted-foreground">
                                                {slot.profiles.first_name} {slot.profiles.last_name}
                                            </p>
                                        )}
                                    </div>
                                    {slot.room && (
                                        <Badge variant="outline" className="text-[10px] h-5 bg-background">
                                            Salle {slot.room}
                                        </Badge>
                                    )}
                                </div>
                            </StaggerItem>
                        ))}
                    </StaggerContainer>
                )}
            </CardContent>
        </Card>
    );
};
