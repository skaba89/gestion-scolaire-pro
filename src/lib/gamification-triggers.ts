import { apiClient } from "@/api/client";
import { triggerGamificationEvent } from "./gamification-rules-service";

export async function onGradeAdded(
    gradeId: string,
    tenantId: string,
    studentId: string,
    score: number,
    subjectId?: string
) {
    try {
        await triggerGamificationEvent({
            event_type: "GRADE_ADDED",
            event_id: gradeId,
            tenant_id: tenantId,
            student_id: studentId,
            event_data: { score, subject_id: subjectId },
        });

        if (score === 20) {
            await triggerGamificationEvent({
                event_type: "PERFECT_SCORE",
                event_id: gradeId,
                tenant_id: tenantId,
                student_id: studentId,
                event_data: { score: 20, subject_id: subjectId },
            });
        }

        const { data: previousGrades } = await apiClient.get<any[]>("/grades/", {
            params: { student_id: studentId, subject_id: subjectId || "", limit: "2" },
        });

        if (previousGrades && previousGrades.length === 2) {
            const improvement = score - previousGrades[1].score;
            if (improvement >= 5) {
                await triggerGamificationEvent({
                    event_type: "GRADE_IMPROVEMENT",
                    event_id: gradeId,
                    tenant_id: tenantId,
                    student_id: studentId,
                    event_data: { score, improvement, subject_id: subjectId },
                });
            }
        }
    } catch (error) {
        console.error("Error triggering grade gamification events:", error);
    }
}

export async function onAttendanceMarked(
    attendanceId: string,
    tenantId: string,
    studentId: string,
    status: string
) {
    if (status !== "PRESENT") return;

    try {
        await triggerGamificationEvent({
            event_type: "ATTENDANCE_PRESENT",
            event_id: attendanceId,
            tenant_id: tenantId,
            student_id: studentId,
            event_data: {},
        });

        const { data: recentAttendance } = await apiClient.get<any[]>("/attendance/", {
            params: { student_id: studentId, status: "PRESENT", limit: "30" },
        });

        if (recentAttendance && recentAttendance.length >= 30) {
            const dates = recentAttendance.map((a: any) => new Date(a.date));
            let consecutiveDays = 1;

            for (let i = 0; i < dates.length - 1; i++) {
                const diff = Math.abs(dates[i].getTime() - dates[i + 1].getTime());
                const daysDiff = Math.ceil(diff / (1000 * 60 * 60 * 24));
                if (daysDiff === 1) consecutiveDays++;
                else break;
            }

            if (consecutiveDays >= 30) {
                await triggerGamificationEvent({
                    event_type: "ATTENDANCE_STREAK",
                    event_id: attendanceId,
                    tenant_id: tenantId,
                    student_id: studentId,
                    event_data: { consecutive_days: consecutiveDays },
                });
            }
        }
    } catch (error) {
        console.error("Error triggering attendance gamification events:", error);
    }
}

export async function onHomeworkSubmitted(
    submissionId: string,
    tenantId: string,
    studentId: string,
    submittedAt: Date,
    deadline: Date
) {
    try {
        const onTime = submittedAt <= deadline;
        await triggerGamificationEvent({
            event_type: "HOMEWORK_SUBMITTED",
            event_id: submissionId,
            tenant_id: tenantId,
            student_id: studentId,
            event_data: { on_time: onTime, submitted_at: submittedAt.toISOString(), deadline: deadline.toISOString() },
        });
    } catch (error) {
        console.error("Error triggering homework gamification events:", error);
    }
}
