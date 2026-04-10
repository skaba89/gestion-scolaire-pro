/**
 * Example Integration: Gamification Triggers
 */

import { onGradeAdded, onAttendanceMarked, onHomeworkSubmitted } from "@/lib/gamification-triggers";
import { apiClient } from "@/api/client";

export async function exampleAddGrade(
    studentId: string,
    subjectId: string,
    score: number,
    tenantId: string
) {
    const { data: grade } = await apiClient.post("/grades/", {
        tenant_id: tenantId,
        student_id: studentId,
        subject_id: subjectId,
        score,
    });

    onGradeAdded(grade.id, tenantId, studentId, score, subjectId).catch(console.error);
    return grade;
}

export async function exampleMarkAttendance(
    studentId: string,
    date: string,
    status: "PRESENT" | "ABSENT" | "LATE",
    tenantId: string
) {
    const { data: attendance } = await apiClient.post("/attendance/", {
        tenant_id: tenantId,
        student_id: studentId,
        date,
        status,
    });

    if (status === "PRESENT") {
        onAttendanceMarked(attendance.id, tenantId, studentId, status).catch(console.error);
    }

    return attendance;
}

export async function exampleSubmitHomework(
    studentId: string,
    assignmentId: string,
    deadline: Date,
    tenantId: string
) {
    const submittedAt = new Date();

    const { data: submission } = await apiClient.post("/homework/submissions/", {
        tenant_id: tenantId,
        student_id: studentId,
        assignment_id: assignmentId,
        submitted_at: submittedAt.toISOString(),
    });

    onHomeworkSubmitted(submission.id, tenantId, studentId, submittedAt, deadline).catch(console.error);
    return submission;
}
