import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Loader2 } from "lucide-react";
import { studentQueries } from "@/queries/students";

const DAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
];

const TIME_SLOTS = [
  "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00",
];

const COLORS = [
  "bg-blue-100 border-blue-300 text-blue-800",
  "bg-green-100 border-green-300 text-green-800",
  "bg-purple-100 border-purple-300 text-purple-800",
  "bg-orange-100 border-orange-300 text-orange-800",
  "bg-pink-100 border-pink-300 text-pink-800",
  "bg-cyan-100 border-cyan-300 text-cyan-800",
  "bg-yellow-100 border-yellow-300 text-yellow-800",
];

import { useStudentData } from "@/features/students/hooks/useStudentData";

const StudentSchedule = () => {
  const {
    enrollment,
    schedule: scheduleSlots,
    isLoading
  } = useStudentData();

  // Create color mapping for subjects
  const subjectColors = new Map<string, string>();
  scheduleSlots?.forEach((slot) => {
    const subName = slot.subjects?.name || slot.subject;
    if (subName && !subjectColors.has(subName)) {
      subjectColors.set(subName, COLORS[subjectColors.size % COLORS.length]);
    }
  });

  const getSlotForDayAndTime = (day: number, time: string) => {
    return scheduleSlots?.filter(
      (slot) => slot.day_of_week === day && slot.start_time.substring(0, 5) === time
    ) || [];
  };

  // Get unique subjects for legend
  const uniqueSubjects = scheduleSlots?.reduce((acc, slot) => {
    const subName = slot.subjects?.name || slot.subject;
    if (subName && !acc.find(s => s === subName)) {
      acc.push(subName);
    }
    return acc;
  }, [] as string[]) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          Emploi du Temps
        </h1>
        <p className="text-muted-foreground">
          Consultez votre programme de cours
          {enrollment?.class_name && (
            <span className="ml-2 font-medium">- Classe: {enrollment.class_name}</span>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Semaine en cours
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !enrollment ? (
            <div className="text-center py-12 text-muted-foreground">
              Vous n'êtes inscrit dans aucune classe pour le moment.
            </div>
          ) : scheduleSlots?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucun emploi du temps n'a encore été défini pour votre classe.
            </div>
          ) : (
            <>
              {/* Schedule Grid */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[800px]">
                  <thead>
                    <tr>
                      <th className="border p-2 bg-muted text-left w-24">
                        <Clock className="w-4 h-4 text-primary" />
                      </th>
                      {DAYS.map((day) => (
                        <th key={day.value} className="border p-2 bg-muted text-center font-semibold">
                          {day.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TIME_SLOTS.slice(0, -1).map((time, index) => (
                      <tr key={time}>
                        <td className="border p-2 text-xs font-semibold text-muted-foreground bg-muted/30">
                          {time} - {TIME_SLOTS[index + 1]}
                        </td>
                        {DAYS.map((day) => {
                          const slots = getSlotForDayAndTime(day.value, time);
                          return (
                            <td key={day.value} className="border p-1 h-20 align-top group hover:bg-muted/10 transition-colors">
                              {slots.map((slot) => {
                                const subName = slot.subjects?.name || slot.subject;
                                return (
                                  <div
                                    key={slot.id}
                                    className={`rounded p-2 text-[10px] leading-tight border shadow-sm ${subjectColors.get(subName) || "bg-primary/10 border-primary/20"}`}
                                  >
                                    <p className="font-bold uppercase tracking-tighter mb-0.5">{subName}</p>
                                    {slot.profiles && (
                                      <p className="opacity-80 italic">
                                        {(slot.profiles as any).first_name} {(slot.profiles as any).last_name}
                                      </p>
                                    )}
                                    {slot.room && (
                                      <p className="mt-1 font-mono">Salle: {slot.room}</p>
                                    )}
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

              {/* Legend */}
              {uniqueSubjects.length > 0 && (
                <div className="mt-6 pt-4 border-t">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">Légende des matières</h3>
                  <div className="flex flex-wrap gap-2">
                    {uniqueSubjects.map((subName) => (
                      <div
                        key={subName}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${subjectColors.get(subName)}`}
                      >
                        {subName}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentSchedule;
