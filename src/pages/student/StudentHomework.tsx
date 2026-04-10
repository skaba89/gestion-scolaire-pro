import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  Send
} from "lucide-react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import HomeworkSubmissionDialog from "@/components/homework/HomeworkSubmissionDialog";
import { studentQueries } from "@/queries/students";
import { TableSkeleton } from "@/components/ui/TableSkeleton";

import { useStudentData } from "@/features/students/hooks/useStudentData";

const StudentHomework = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [selectedHomework, setSelectedHomework] = useState<any>(null);
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);

  const {
    student,
    enrollment,
    homework,
    submissions,
    isLoading
  } = useStudentData();

  const getSubmission = (homeworkId: string) => {
    return submissions?.find(s => s.homework_id === homeworkId);
  };

  const getHomeworkStatus = (hw: any) => {
    const submission = getSubmission(hw.id);
    const dueDate = new Date(hw.due_date);
    const daysUntil = differenceInDays(dueDate, new Date());

    if (submission) {
      if (submission.grade !== null) {
        return {
          label: `Noté: ${submission.grade}/${hw.max_points || 20}`,
          variant: "default" as const,
          icon: CheckCircle,
          color: "bg-green-100 text-green-700"
        };
      }
      return { label: "Rendu", variant: "secondary" as const, icon: CheckCircle, color: "bg-blue-100 text-blue-700" };
    }

    if (isPast(dueDate) && !isToday(dueDate)) {
      return { label: "En retard", variant: "destructive" as const, icon: AlertCircle, color: "bg-red-100 text-red-700" };
    }
    if (isToday(dueDate)) {
      return { label: "Aujourd'hui", variant: "secondary" as const, icon: Clock, color: "bg-orange-100 text-orange-700" };
    }
    if (daysUntil <= 2) {
      return { label: `${daysUntil}j restants`, variant: "secondary" as const, icon: Clock, color: "bg-orange-100 text-orange-700" };
    }
    return { label: "À faire", variant: "outline" as const, icon: BookOpen, color: "bg-muted text-muted-foreground" };
  };

  const handleOpenSubmission = (hw: any) => {
    setSelectedHomework(hw);
    setSubmissionDialogOpen(true);
  };

  // Separate upcoming and past homework
  const upcomingHomework = homework?.filter(hw => {
    const dueDate = new Date(hw.due_date);
    return !isPast(dueDate) || isToday(dueDate);
  }) || [];

  const pastHomework = homework?.filter(hw => {
    const dueDate = new Date(hw.due_date);
    return isPast(dueDate) && !isToday(dueDate);
  }) || [];

  if (isLoading) {
    return <TableSkeleton columns={3} rows={8} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Mes Devoirs</h1>
        <p className="text-muted-foreground">Consultez et rendez vos devoirs</p>
      </div>

      {!enrollment ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">Vous n'êtes inscrit dans aucune classe</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Upcoming Homework */}
          <Card className="border-primary/10 shadow-sm">
            <CardHeader className="bg-muted/20 border-b">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <Clock className="w-5 h-5 text-primary" />
                Devoirs à rendre ({upcomingHomework.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {upcomingHomework.length > 0 ? (
                <div className="space-y-4">
                  {upcomingHomework.map((hw) => {
                    const status = getHomeworkStatus(hw);
                    const StatusIcon = status.icon;
                    const teacher = hw.profiles as any;
                    const submission = getSubmission(hw.id);

                    return (
                      <div
                        key={hw.id}
                        className="p-4 border rounded-xl hover:shadow-md hover:border-primary/20 transition-all duration-200 bg-card group"
                      >
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-lg">{hw.title}</h3>
                              <Badge className={status.color} variant="secondary">
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {status.label}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium text-primary">
                              {(hw.subjects as any)?.name}
                              {teacher && (
                                <span className="text-muted-foreground font-normal italic ml-2">
                                  • {teacher.first_name} {teacher.last_name}
                                </span>
                              )}
                            </p>
                            {hw.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                                {hw.description}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-4 shrink-0">
                            <div className="text-right space-y-1">
                              <div className="flex items-center justify-end gap-1.5 text-xs font-semibold text-muted-foreground">
                                <Calendar className="w-3.5 h-3.5" />
                                {format(new Date(hw.due_date), "EEEE d MMMM", { locale: fr })}
                              </div>
                              {hw.due_time && (
                                <div className="flex items-center justify-end gap-1.5 text-xs font-semibold text-primary">
                                  <Clock className="w-3.5 h-3.5" />
                                  {hw.due_time.slice(0, 5)}
                                </div>
                              )}
                              {hw.max_points && (
                                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold">
                                  {hw.max_points} pts
                                </Badge>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant={submission ? "outline" : "default"}
                              className="group-hover:translate-x-1 transition-transform"
                              onClick={() => handleOpenSubmission(hw)}
                            >
                              <Send className="w-4 h-4 mr-1.5" />
                              {submission ? "Voir / Modifier" : "Rendre"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 text-green-500/20 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">Félicitations ! Aucun devoir en attente.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Past Homework */}
          {pastHomework.length > 0 && (
            <Card className="border-primary/5 bg-muted/5">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2 text-sm font-display text-muted-foreground">
                  <BookOpen className="w-4 h-4" />
                  Devoirs passés ({pastHomework.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-3">
                  {pastHomework.slice(0, 5).map((hw) => {
                    const status = getHomeworkStatus(hw);
                    const StatusIcon = status.icon;
                    const submission = getSubmission(hw.id);

                    return (
                      <div
                        key={hw.id}
                        className="p-3 border rounded-lg bg-card hover:bg-muted/10 transition-colors flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm truncate">{hw.title}</h3>
                          <p className="text-[10px] text-muted-foreground">
                            {(hw.subjects as any)?.name} •
                            {format(new Date(hw.due_date), " d MMM yyyy", { locale: fr })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant="outline" className={`${status.color} text-[10px] border-none`}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {status.label}
                          </Badge>
                          {submission && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              onClick={() => handleOpenSubmission(hw)}
                            >
                              Voir
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Submission Dialog */}
      {selectedHomework && student && tenant && (
        <HomeworkSubmissionDialog
          homework={selectedHomework}
          studentId={student.id}
          tenantId={tenant.id}
          existingSubmission={getSubmission(selectedHomework.id)}
          open={submissionDialogOpen}
          onOpenChange={setSubmissionDialogOpen}
        />
      )}
    </div>
  );
};

export default StudentHomework;
