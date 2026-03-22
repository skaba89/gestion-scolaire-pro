import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, Grid3X3, List, Download, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ScheduleSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject_id: string;
  teacher_id?: string | null;
  subjects?: { name: string } | null;
  profiles?: { first_name: string; last_name: string } | null;
  room?: string;
}

interface EnhancedScheduleViewProps {
  slots: ScheduleSlot[];
  className?: string;
  isLoading?: boolean;
}

const DAYS = [
  { value: 1, label: "Lundi", short: "Lun" },
  { value: 2, label: "Mardi", short: "Mar" },
  { value: 3, label: "Mercredi", short: "Mer" },
  { value: 4, label: "Jeudi", short: "Jeu" },
  { value: 5, label: "Vendredi", short: "Ven" },
];

const TIME_SLOTS = [
  "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00",
];

const SUBJECT_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-blue-400", text: "text-blue-700 dark:text-blue-300" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", border: "border-emerald-400", text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-violet-100 dark:bg-violet-900/40", border: "border-violet-400", text: "text-violet-700 dark:text-violet-300" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-amber-400", text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", border: "border-rose-400", text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", border: "border-cyan-400", text: "text-cyan-700 dark:text-cyan-300" },
  { bg: "bg-fuchsia-100 dark:bg-fuchsia-900/40", border: "border-fuchsia-400", text: "text-fuchsia-700 dark:text-fuchsia-300" },
  { bg: "bg-lime-100 dark:bg-lime-900/40", border: "border-lime-400", text: "text-lime-700 dark:text-lime-300" },
];

export const EnhancedScheduleView = ({ slots, className, isLoading }: EnhancedScheduleViewProps) => {
  const [viewMode, setViewMode] = useState<"grid" | "list" | "day">("grid");
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().getDay() || 1);

  // Create color mapping for subjects
  const subjectColors = new Map<string, typeof SUBJECT_COLORS[0]>();
  slots.forEach((slot) => {
    if (slot.subject_id && !subjectColors.has(slot.subject_id)) {
      subjectColors.set(slot.subject_id, SUBJECT_COLORS[subjectColors.size % SUBJECT_COLORS.length]);
    }
  });

  const getSlotForDayAndTime = (day: number, time: string) => {
    return slots.filter(
      (slot) => slot.day_of_week === day && slot.start_time.substring(0, 5) === time
    );
  };

  const getSlotsForDay = (day: number) => {
    return slots.filter((slot) => slot.day_of_week === day).sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );
  };

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    // Generate iCal format
    let ical = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//SchoolFlow Pro//Schedule//FR\n";

    slots.forEach((slot) => {
      const dayOffset = slot.day_of_week - 1;
      const eventDate = addDays(weekStart, dayOffset);
      const dateStr = format(eventDate, "yyyyMMdd");
      const startTime = slot.start_time.replace(":", "") + "00";
      const endTime = slot.end_time.replace(":", "") + "00";

      ical += `BEGIN:VEVENT\n`;
      ical += `DTSTART:${dateStr}T${startTime}\n`;
      ical += `DTEND:${dateStr}T${endTime}\n`;
      ical += `SUMMARY:${slot.subjects?.name || "Cours"}\n`;
      if (slot.profiles) {
        ical += `DESCRIPTION:Enseignant: ${slot.profiles.first_name} ${slot.profiles.last_name}\n`;
      }
      ical += `END:VEVENT\n`;
    });

    ical += "END:VCALENDAR";

    const blob = new Blob([ical], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "emploi-du-temps.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get unique subjects for legend
  const uniqueSubjects = slots.reduce((acc, slot) => {
    if (slot.subjects && !acc.find(s => s.id === slot.subject_id)) {
      acc.push({ id: slot.subject_id, name: slot.subjects.name });
    }
    return acc;
  }, [] as { id: string; name: string }[]);

  // Calculate today's schedule stats
  const todaySlots = getSlotsForDay(new Date().getDay() || 1);
  const totalHoursToday = todaySlots.length;
  const nextClass = todaySlots.find(slot => {
    const now = format(new Date(), "HH:mm");
    return slot.start_time > now;
  });

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("print:shadow-none", className)}>
      <CardHeader className="print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Emploi du Temps
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "grid" | "list" | "day")}>
              <TabsList className="h-9">
                <TabsTrigger value="grid" className="px-3">
                  <Grid3X3 className="w-4 h-4" />
                </TabsTrigger>
                <TabsTrigger value="list" className="px-3">
                  <List className="w-4 h-4" />
                </TabsTrigger>
                <TabsTrigger value="day" className="px-3">
                  <Calendar className="w-4 h-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Exporter</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Imprimer</span>
            </Button>
          </div>
        </div>

        {/* Week Navigation */}
        <div className="flex items-center justify-between mt-4">
          <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Semaine précédente
          </Button>
          <span className="text-sm font-medium">
            Semaine du {format(weekStart, "d MMMM yyyy", { locale: fr })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
            Semaine suivante
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4 mt-4 flex-wrap">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {totalHoursToday}h aujourd'hui
          </Badge>
          {nextClass && (
            <Badge variant="outline" className="flex items-center gap-1">
              Prochain cours: {nextClass.subjects?.name} à {nextClass.start_time.substring(0, 5)}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="print:p-0">
        {slots.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Aucun emploi du temps disponible
          </div>
        ) : (
          <>
            {/* Grid View */}
            {viewMode === "grid" && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[800px]">
                  <thead>
                    <tr>
                      <th className="border border-border p-2 bg-muted text-left w-24">
                        <Clock className="w-4 h-4" />
                      </th>
                      {DAYS.map((day) => (
                        <th key={day.value} className="border border-border p-2 bg-muted text-center font-semibold">
                          <span className="hidden sm:inline">{day.label}</span>
                          <span className="sm:hidden">{day.short}</span>
                          <div className="text-xs text-muted-foreground font-normal">
                            {format(addDays(weekStart, day.value - 1), "d MMM", { locale: fr })}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TIME_SLOTS.slice(0, -1).map((time, index) => (
                      <tr key={time}>
                        <td className="border border-border p-2 text-sm font-medium text-muted-foreground bg-muted/50">
                          {time} - {TIME_SLOTS[index + 1]}
                        </td>
                        {DAYS.map((day) => {
                          const daySlots = getSlotForDayAndTime(day.value, time);
                          const isToday = new Date().getDay() === day.value;
                          return (
                            <td
                              key={day.value}
                              className={cn(
                                "border border-border p-1 h-16 align-top",
                                isToday && "bg-primary/5"
                              )}
                            >
                              {daySlots.map((slot) => {
                                const colors = subjectColors.get(slot.subject_id) || SUBJECT_COLORS[0];
                                return (
                                  <div
                                    key={slot.id}
                                    className={cn(
                                      "rounded-md p-2 text-xs border-l-4 transition-all hover:shadow-md cursor-pointer",
                                      colors.bg,
                                      colors.border,
                                    )}
                                  >
                                    <p className={cn("font-semibold truncate", colors.text)}>
                                      {slot.subjects?.name}
                                    </p>
                                    {slot.profiles && (
                                      <p className="text-muted-foreground truncate mt-0.5">
                                        {slot.profiles.first_name} {slot.profiles.last_name}
                                      </p>
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
            )}

            {/* List View */}
            {viewMode === "list" && (
              <div className="space-y-4">
                {DAYS.map((day) => {
                  const daySlots = getSlotsForDay(day.value);
                  if (daySlots.length === 0) return null;

                  return (
                    <div key={day.value} className="border border-border rounded-lg overflow-hidden">
                      <div className="bg-muted px-4 py-2 font-semibold flex items-center justify-between">
                        <span>{day.label}</span>
                        <Badge variant="secondary">{daySlots.length} cours</Badge>
                      </div>
                      <div className="divide-y divide-border">
                        {daySlots.map((slot) => {
                          const colors = subjectColors.get(slot.subject_id) || SUBJECT_COLORS[0];
                          return (
                            <div
                              key={slot.id}
                              className={cn("p-4 flex items-center gap-4", colors.bg)}
                            >
                              <div className="text-center min-w-[80px]">
                                <div className="font-semibold">{slot.start_time.substring(0, 5)}</div>
                                <div className="text-xs text-muted-foreground">{slot.end_time.substring(0, 5)}</div>
                              </div>
                              <div className={cn("w-1 h-12 rounded-full", colors.border.replace("border-", "bg-"))} />
                              <div className="flex-1">
                                <p className={cn("font-semibold", colors.text)}>{slot.subjects?.name}</p>
                                {slot.profiles && (
                                  <p className="text-sm text-muted-foreground">
                                    {slot.profiles.first_name} {slot.profiles.last_name}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Day View */}
            {viewMode === "day" && (
              <div>
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                  {DAYS.map((day) => (
                    <Button
                      key={day.value}
                      variant={selectedDay === day.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedDay(day.value)}
                      className="flex-shrink-0"
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2">
                  {TIME_SLOTS.slice(0, -1).map((time, index) => {
                    const daySlots = getSlotForDayAndTime(selectedDay, time);
                    const isEmpty = daySlots.length === 0;

                    return (
                      <div
                        key={time}
                        className={cn(
                          "flex items-stretch gap-4 min-h-[60px] rounded-lg transition-colors",
                          isEmpty ? "opacity-50" : "hover:bg-muted/30"
                        )}
                      >
                        <div className="w-20 flex-shrink-0 text-sm text-muted-foreground flex flex-col justify-center">
                          <div>{time}</div>
                          <div className="text-xs">{TIME_SLOTS[index + 1]}</div>
                        </div>
                        <div className="flex-1 border-l-2 border-border pl-4 py-1">
                          {daySlots.length > 0 ? (
                            daySlots.map((slot) => {
                              const colors = subjectColors.get(slot.subject_id) || SUBJECT_COLORS[0];
                              return (
                                <div
                                  key={slot.id}
                                  className={cn(
                                    "rounded-lg p-3 border-l-4",
                                    colors.bg,
                                    colors.border
                                  )}
                                >
                                  <p className={cn("font-semibold", colors.text)}>{slot.subjects?.name}</p>
                                  {slot.profiles && (
                                    <p className="text-sm text-muted-foreground">
                                      {slot.profiles.first_name} {slot.profiles.last_name}
                                    </p>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-muted-foreground text-sm py-2">Libre</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Legend */}
            {uniqueSubjects.length > 0 && (
              <div className="mt-6 pt-4 border-t border-border print:mt-4">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Légende</h3>
                <div className="flex flex-wrap gap-2">
                  {uniqueSubjects.map((subject) => {
                    const colors = subjectColors.get(subject.id) || SUBJECT_COLORS[0];
                    return (
                      <Badge
                        key={subject.id}
                        variant="outline"
                        className={cn("border-l-4", colors.border, colors.bg, colors.text)}
                      >
                        {subject.name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
