import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ClipboardList, AlertCircle, BookOpen, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";

interface Homework {
    id: string;
    title: string;
    due_date: string;
    subjects?: { name: string };
}

interface StudentUpcomingHomeworkProps {
    homework: Homework[];
    getTenantUrl: (path: string) => string;
}

export const StudentUpcomingHomework = ({ homework, getTenantUrl }: StudentUpcomingHomeworkProps) => {
    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-display">
                    <ClipboardList className="w-5 h-5 text-primary" />
                    Devoirs à venir
                </CardTitle>
            </CardHeader>
            <CardContent>
                {homework.length === 0 ? (
                    <div className="text-center py-8">
                        <CheckCircle className="w-12 h-12 text-success/30 mx-auto mb-3" />
                        <p className="text-muted-foreground">Aucun devoir à rendre</p>
                    </div>
                ) : (
                    <StaggerContainer className="space-y-3">
                        {homework.map((hw, idx) => {
                            const daysUntil = Math.ceil(
                                (new Date(hw.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                            );
                            const isUrgent = daysUntil <= 2;

                            return (
                                <StaggerItem key={hw.id} index={idx}>
                                    <Link
                                        to={getTenantUrl("/student/homework")}
                                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted border border-transparent hover:border-primary/20 transition-all duration-200"
                                    >
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isUrgent ? "bg-red-100" : "bg-primary/10"
                                            }`}>
                                            {isUrgent ? (
                                                <AlertCircle className="w-5 h-5 text-red-600" />
                                            ) : (
                                                <BookOpen className="w-5 h-5 text-primary" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate text-sm">{hw.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {hw.subjects?.name} • {formatDistanceToNow(new Date(hw.due_date), {
                                                    addSuffix: true,
                                                    locale: fr
                                                })}
                                            </p>
                                        </div>
                                        {isUrgent && (
                                            <Badge variant="destructive" className="text-[10px] h-5">
                                                Urgent
                                            </Badge>
                                        )}
                                    </Link>
                                </StaggerItem>
                            );
                        })}
                    </StaggerContainer>
                )}
            </CardContent>
        </Card>
    );
};
