import { apiClient } from "@/api/client";

export interface ScheduleReplacementSlot {
  subject_id: string;
  teacher_id?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room_id?: string | null;
}

export const replaceClassSchedule = async (
  classId: string,
  slots: ScheduleReplacementSlot[],
) => {
  const { data } = await apiClient.put(
    `/schedule/classes/${classId}/replace/`,
    { slots },
  );
  return data;
};
