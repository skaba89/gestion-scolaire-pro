import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar, Clock, MapPin, BookOpen } from "lucide-react";

export default function DepartmentExamCalendar() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedExam, setSelectedExam] = useState<any>(null);

  // Get department for current user
  const { data: userDepartment } = useQuery({
    queryKey: ['user-department', user?.id, tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/department-portal/members/', {
        params: { user_id: user?.id, tenant_id: tenant?.id },
      });
      return Array.isArray(data) ? data[0] ?? null : data;
    },
    enabled: !!user?.id && !!tenant?.id,
  });

  // Get exams for this department
  const { data: exams } = useQuery({
    queryKey: ['department-exams-calendar', userDepartment?.department_id, currentDate, tenant?.id],
    queryFn: async () => {
      const startDate = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(currentDate), 'yyyy-MM-dd');

      const { data } = await apiClient.get('/department-portal/exams/', {
        params: {
          tenant_id: tenant?.id,
          department_id: userDepartment?.department_id,
          exam_date_after: startDate,
          exam_date_before: endDate,
        },
      });

      return Array.isArray(data) ? data : [];
    },
    enabled: !!userDepartment?.department_id && !!tenant?.id,
  });

  // Generate calendar days
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { locale: fr });
  const calendarEnd = endOfWeek(monthEnd, { locale: fr });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getExamsForDay = (date: Date) => {
    return exams?.filter((exam: any) => 
      isSameDay(new Date(exam.exam_date), date)
    ) || [];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-500';
      case 'in_progress':
        return 'bg-yellow-500';
      case 'completed':
        return 'bg-green-500';
      case 'cancelled':
        return 'bg-destructive';
      default:
        return 'bg-muted';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'Programmé';
      case 'in_progress':
        return 'En cours';
      case 'completed':
        return 'Terminé';
      case 'cancelled':
        return 'Annulé';
      default:
        return status;
    }
  };

  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Calendrier des examens</h1>
        <p className="text-muted-foreground">
          Département: {(userDepartment?.departments as any)?.name || 'Non assigné'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {format(currentDate, 'MMMM yyyy', { locale: fr })}
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Week day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => {
                const dayExams = getExamsForDay(day);
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={idx}
                    className={`min-h-[80px] p-1 border rounded-md ${
                      isCurrentMonth ? 'bg-background' : 'bg-muted/30'
                    } ${isToday ? 'ring-2 ring-primary' : ''}`}
                  >
                    <div className={`text-sm font-medium mb-1 ${
                      isCurrentMonth ? '' : 'text-muted-foreground'
                    }`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {dayExams.slice(0, 2).map((exam: any) => (
                        <button
                          key={exam.id}
                          onClick={() => setSelectedExam(exam)}
                          className={`w-full text-left text-xs p-1 rounded truncate text-white ${getStatusColor(exam.status)}`}
                        >
                          {exam.name}
                        </button>
                      ))}
                      {dayExams.length > 2 && (
                        <div className="text-xs text-muted-foreground text-center">
                          +{dayExams.length - 2} autre(s)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Exam Details / List */}
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedExam ? 'Détails de l\'examen' : 'Examens ce mois'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedExam ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">{selectedExam.name}</h3>
                  <Badge className={getStatusColor(selectedExam.status)}>
                    {getStatusLabel(selectedExam.status)}
                  </Badge>
                </div>

                {selectedExam.description && (
                  <p className="text-sm text-muted-foreground">
                    {selectedExam.description}
                  </p>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {format(new Date(selectedExam.exam_date), 'EEEE d MMMM yyyy', { locale: fr })}
                  </div>

                  {(selectedExam.start_time || selectedExam.end_time) && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {selectedExam.start_time?.slice(0, 5)} - {selectedExam.end_time?.slice(0, 5)}
                    </div>
                  )}

                  {selectedExam.room_name && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {selectedExam.room_name}
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    {selectedExam.subjects?.name}
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Classe: </span>
                    {selectedExam.classrooms?.name || 'Non spécifiée'}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Note max: </span>
                    {selectedExam.max_score} points
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setSelectedExam(null)}
                >
                  Retour à la liste
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {exams?.map((exam: any) => (
                  <button
                    key={exam.id}
                    onClick={() => setSelectedExam(exam)}
                    className="w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{exam.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {exam.subjects?.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(new Date(exam.exam_date), 'd MMMM', { locale: fr })}
                          {exam.start_time && ` à ${exam.start_time.slice(0, 5)}`}
                        </div>
                      </div>
                      <Badge className={getStatusColor(exam.status)} variant="secondary">
                        {getStatusLabel(exam.status)}
                      </Badge>
                    </div>
                  </button>
                ))}
                {(!exams || exams.length === 0) && (
                  <p className="text-center text-muted-foreground py-4">
                    Aucun examen ce mois
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
