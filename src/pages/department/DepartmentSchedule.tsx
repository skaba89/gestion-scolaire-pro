import { useState } from "react";
import { useDepartmentSchedule } from "@/features/departments/hooks/useDepartment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar } from "lucide-react";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

const SUBJECT_COLORS = [
  "bg-blue-100 dark:bg-blue-900/30 border-blue-300 text-blue-700 dark:text-blue-300",
  "bg-green-100 dark:bg-green-900/30 border-green-300 text-green-700 dark:text-green-300",
  "bg-purple-100 dark:bg-purple-900/30 border-purple-300 text-purple-700 dark:text-purple-300",
  "bg-orange-100 dark:bg-orange-900/30 border-orange-300 text-orange-700 dark:text-orange-300",
  "bg-pink-100 dark:bg-pink-900/30 border-pink-300 text-pink-700 dark:text-pink-300",
  "bg-teal-100 dark:bg-teal-900/30 border-teal-300 text-teal-700 dark:text-teal-300",
];

export default function DepartmentSchedule() {
  const [selectedClassroom, setSelectedClassroom] = useState("all");
  const { data, isLoading } = useDepartmentSchedule();

  const schedule = data?.schedule || [];
  const department = data?.department;

  // Get unique classrooms from schedule for filter
  const classroomsInSchedule = Array.from(
    new Map(schedule.map((s) => [s.classroom.name, s.classroom])).values()
  );

  const filteredSchedule = selectedClassroom === "all"
    ? schedule
    : schedule.filter((s) => s.classroom.name === selectedClassroom);

  // Subject → color map
  const subjectColorMap = new Map<string, string>();
  Array.from(new Set(schedule.map((s) => s.subject.name))).forEach((name, i) => {
    subjectColorMap.set(name, SUBJECT_COLORS[i % SUBJECT_COLORS.length]);
  });

  const getSlotForDayAndTime = (dayIndex: number, hour: string) => {
    return filteredSchedule.filter((slot) => {
      const slotHour = slot.start_time?.slice(0, 5);
      return slot.day_of_week === String(dayIndex + 1) && slotHour === hour;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Emploi du temps</h1>
        <p className="text-muted-foreground">Département: {department?.name || "Non assigné"}</p>
      </div>

      <div className="flex gap-4">
        <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Toutes les classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les classes</SelectItem>
            {classroomsInSchedule.map((c) => (
              <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Planning hebdomadaire
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border p-2 bg-muted text-left w-20">
                    <Clock className="h-4 w-4" />
                  </th>
                  {DAYS.map((day) => (
                    <th key={day} className="border p-2 bg-muted text-center font-medium">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map((hour) => (
                  <tr key={hour}>
                    <td className="border p-2 text-sm font-medium text-muted-foreground">{hour}</td>
                    {DAYS.map((_, dayIndex) => {
                      const slots = getSlotForDayAndTime(dayIndex, hour);
                      return (
                        <td key={dayIndex} className="border p-1 min-w-[150px] align-top">
                          {slots.map((slot) => (
                            <div
                              key={slot.id}
                              className={`p-2 rounded border mb-1 text-xs ${subjectColorMap.get(slot.subject.name) || SUBJECT_COLORS[0]}`}
                            >
                              <div className="font-semibold truncate">{slot.subject.name}</div>
                              <div className="text-[10px] opacity-75">{slot.classroom.name}</div>
                              <div className="text-[10px] opacity-75">
                                {slot.teacher.first_name} {slot.teacher.last_name}
                              </div>
                              <div className="text-[10px] opacity-75">
                                {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                              </div>
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Légende des matières</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from(subjectColorMap.entries()).map(([name, color]) => (
              <Badge key={name} className={color} variant="outline">{name}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
