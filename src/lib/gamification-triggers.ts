import { supabase } from "@/integrations/supabase/client";
import { triggerGamificationEvent } from "./gamification-rules-service";

/**
 * Helper to automatically trigger gamification events when grades are added
 */
export async function onGradeAdded(
    gradeId: string,
    tenantId: string,
    studentId: string,
    score: number,
    subjectId?: string
) {
    try {
        // Trigger GRADE_ADDED event
        await triggerGamificationEvent({
            event_type: "GRADE_ADDED",
            event_id: gradeId,
            tenant_id: tenantId,
            student_id: studentId,
            event_data: {
                score,
                subject_id: subjectId,
            },
        });

        // Check for perfect score
        if (score === 20) {
            await triggerGamificationEvent({
                event_type: "PERFECT_SCORE",
                event_id: gradeId,
                tenant_id: tenantId,
                student_id: studentId,
                event_data: {
                    score: 20,
                    subject_id: subjectId,
                },
            });
        }

        // Check for grade improvement
        const { data: previousGrades } = await supabase
            .from("grades")
            .select("score")
            .eq("student_id", studentId)
            .eq("subject_id", subjectId || "")
            .order("created_at", { ascending: false })
            .limit(2);

        if (previousGrades && previousGrades.length === 2) {
            const improvement = score - previousGrades[1].score;
            if (improvement >= 5) {
                await triggerGamificationEvent({
                    event_type: "GRADE_IMPROVEMENT",
                    event_id: gradeId,
                    tenant_id: tenantId,
                    student_id: studentId,
                    event_data: {
                        score,
                        improvement,
                        subject_id: subjectId,
                    },
                });
            }
        }
    } catch (error) {
        console.error("Error triggering grade gamification events:", error);
    }
}

/**
 * Helper to automatically trigger gamification events when attendance is marked
 */
export async function onAttendanceMarked(
    attendanceId: string,
    tenantId: string,
    studentId: string,
    status: string
) {
    if (status !== "PRESENT") return;

    try {
        // Trigger ATTENDANCE_PRESENT event
        await triggerGamificationEvent({
            event_type: "ATTENDANCE_PRESENT",
            event_id: attendanceId,
            tenant_id: tenantId,
            student_id: studentId,
            event_data: {},
        });

        // Check for attendance streak
        const { data: recentAttendance } = await supabase
            .from("attendance")
            .select("status, date")
            .eq("student_id", studentId)
            .eq("status", "PRESENT")
            .order("date", { ascending: false })
            .limit(30);

        if (recentAttendance && recentAttendance.length >= 30) {
            // Check if they are consecutive days
            const dates = recentAttendance.map((a) => new Date(a.date));
            let consecutiveDays = 1;

            for (let i = 0; i < dates.length - 1; i++) {
                const diff = Math.abs(dates[i].getTime() - dates[i + 1].getTime());
                const daysDiff = Math.ceil(diff / (1000 * 60 * 60 * 24));

                if (daysDiff === 1) {
                    consecutiveDays++;
                } else {
                    break;
                }
            }

            if (consecutiveDays >= 30) {
                await triggerGamificationEvent({
                    event_type: "ATTENDANCE_STREAK",
                    event_id: attendanceId,
                    tenant_id: tenantId,
                    student_id: studentId,
                    event_data: {
                        consecutive_days: consecutiveDays,
                    },
                });
            }
        }
    } catch (error) {
        console.error("Error triggering attendance gamification events:", error);
    }
}

/**
 * Helper to automatically trigger gamification events when homework is submitted
 */
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
            event_data: {
                on_time: onTime,
                submitted_at: submittedAt.toISOString(),
                deadline: deadline.toISOString(),
            },
        });
    } catch (error) {
        console.error("Error triggering homework gamification events:", error);
    }
}
