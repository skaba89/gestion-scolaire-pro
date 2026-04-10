import { useState, useMemo, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { referenceQueries } from "@/queries/reference-data";
import { classroomQueries } from "@/queries/classrooms";
import { useSubjects } from "@/queries/subjects";
import {
  scheduleQueries,
  useCreateScheduleSlot,
  useDeleteScheduleSlot
} from "@/queries/schedule";

// Modular Components
import { ScheduleHeader } from "@/components/schedule/ScheduleHeader";
import { ScheduleFilters } from "@/components/schedule/ScheduleFilters";
import { ScheduleGrid } from "@/components/schedule/ScheduleGrid";
import { ScheduleFormDialog } from "@/components/schedule/ScheduleFormDialog";

const DAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
];

const TIME_SLOTS = [
  "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
];

const Schedule = () => {
  const { tenant } = useTenant();
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Queries
  const { data: departments = [] } = useQuery({
    ...referenceQueries.departments(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: levels = [] } = useQuery({
    ...referenceQueries.levels(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: classrooms = [] } = useQuery({
    ...classroomQueries.all(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: subjectsData = [] } = useSubjects(tenant?.id || "");

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms", tenant?.id],
    queryFn: async () => {
      const response = await apiClient.get<{ id: string; name: string }[]>("/infrastructure/rooms/");
      return response.data;
    },
    enabled: !!tenant?.id,
  });

  const { data: classroomDepts = [] } = useQuery({
    queryKey: ["classroom-departments", tenant?.id],
    queryFn: async () => {
      const response = await apiClient.get<{ class_id: string; department_id: string }[]>("/infrastructure/classroom-departments/");
      return response.data;
    },
    enabled: !!tenant?.id,
  });

  const { data: scheduleSlots = [], isLoading: scheduleLoading, refetch: refetchSchedule } = useQuery({
    ...scheduleQueries.byClass(tenant?.id || "", selectedClassroom),
    enabled: !!tenant?.id && !!selectedClassroom && selectedClassroom !== "none",
  });

  const createSlot = useCreateScheduleSlot();
  const deleteSlot = useDeleteScheduleSlot();

  // Filtering Logic
  const classesFiltered = useMemo(() => classrooms.filter(cls => {
    const matchesDept = selectedDept === "all" ? true : classroomDepts.some(cd => cd.class_id === cls.id && cd.department_id === selectedDept);
    const matchesLevel = selectedLevel === "all" || cls.level_id === selectedLevel;
    return matchesDept && matchesLevel;
  }), [classrooms, selectedDept, selectedLevel, classroomDepts]);

  // Selection auto
  useEffect(() => {
    if (classesFiltered.length > 0 && !classesFiltered.some(c => c.id === selectedClassroom)) {
      setSelectedClassroom(classesFiltered[0].id);
    }
  }, [classesFiltered, selectedClassroom]);

  // Handle slot submission
  const handleSubmitSlot = async (data: any) => {
    try {
      await createSlot.mutateAsync({
        ...data,
        tenant_id: tenant?.id || "",
        class_id: selectedClassroom,
        day_of_week: String(data.day_of_week),
        start_time: data.start_time + ":00",
        end_time: data.end_time + ":00",
      });
      setIsDialogOpen(false);
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleDeleteSlot = async (id: string) => {
    try {
      await deleteSlot.mutateAsync({
        id,
        tenantId: tenant?.id || "",
        classId: selectedClassroom,
      });
    } catch (error) {
      // Error handled by hook
    }
  };

  return (
    <div className="space-y-6">
      <ScheduleHeader
        onAddClick={() => setIsDialogOpen(true)}
        selectedDept={selectedDept}
        selectedLevel={selectedLevel}
        filteredClassrooms={classesFiltered}
        onGenerated={refetchSchedule}
        onClassroomGenerated={setSelectedClassroom}
        isAddDisabled={!selectedClassroom || selectedClassroom === "none"}
      />

      <ScheduleFilters
        selectedDept={selectedDept}
        onDeptChange={setSelectedDept}
        departments={departments}
        selectedLevel={selectedLevel}
        onLevelChange={setSelectedLevel}
        levels={levels}
        selectedClassroom={selectedClassroom}
        onClassroomChange={setSelectedClassroom}
        classrooms={classesFiltered}
      />

      <ScheduleGrid
        days={DAYS}
        timeSlots={TIME_SLOTS}
        scheduleSlots={scheduleSlots}
        loading={scheduleLoading}
        onDeleteSlot={handleDeleteSlot}
        selectedClassroom={selectedClassroom}
        hasClasses={classrooms.length > 0}
      />

      <ScheduleFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmitSlot}
        isPending={createSlot.isPending}
        subjects={subjectsData}
        rooms={rooms}
        days={DAYS}
        timeSlots={TIME_SLOTS}
      />
    </div>
  );
};

export default Schedule;
