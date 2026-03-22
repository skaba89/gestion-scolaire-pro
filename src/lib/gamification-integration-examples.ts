/**
 * Example Integration: Gamification Triggers
 * 
 * This file shows how to integrate gamification triggers into your existing components.
 * Copy these patterns into your actual components where grades, attendance, and homework are created.
 */

import { onGradeAdded, onAttendanceMarked, onHomeworkSubmitted } from "@/lib/gamification-triggers";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Example 1: Triggering gamification when adding a grade
 * 
 * Location: Wherever you create grades (e.g., GradeForm, GradeManager, etc.)
 */
export async function exampleAddGrade(
    studentId: string,
    subjectId: string,
    score: number,
    tenantId: string
) {
    // 1. Insert the grade as usual
    const { data: grade, error } = await supabase
        .from("grades")
        .insert({
            tenant_id: tenantId,
            student_id: studentId,
            subject_id: subjectId,
            score,
            // ... other fields
        })
        .select()
        .single();

    if (error) {
        console.error("Error creating grade:", error);
        return;
    }

    // 2. Trigger gamification events (non-blocking)
    onGradeAdded(grade.id, tenantId, studentId, score, subjectId).catch((err) => {
        console.error("Gamification trigger failed:", err);
        // Don't throw - gamification is a nice-to-have, not critical
    });

    return grade;
}

/**
 * Example 2: Triggering gamification when marking attendance
 * 
 * Location: Attendance management components
 */
export async function exampleMarkAttendance(
    studentId: string,
    date: string,
    status: "PRESENT" | "ABSENT" | "LATE",
    tenantId: string
) {
    // 1. Insert attendance record
    const { data: attendance, error } = await supabase
        .from("attendance")
        .insert({
            tenant_id: tenantId,
            student_id: studentId,
            date,
            status,
            // ... other fields
        })
        .select()
        .single();

    if (error) {
        console.error("Error marking attendance:", error);
        return;
    }

    // 2. Trigger gamification events (only for PRESENT status)
    if (status === "PRESENT") {
        onAttendanceMarked(attendance.id, tenantId, studentId, status).catch((err) => {
            console.error("Gamification trigger failed:", err);
        });
    }

    return attendance;
}

/**
 * Example 3: Triggering gamification when submitting homework
 * 
 * Location: Homework/Assignment submission components
 */
export async function exampleSubmitHomework(
    studentId: string,
    assignmentId: string,
    deadline: Date,
    tenantId: string
) {
    const submittedAt = new Date();

    // 1. Insert submission record
    const { data: submission, error } = await supabase
        .from("assignment_submissions")
        .insert({
            tenant_id: tenantId,
            student_id: studentId,
            assignment_id: assignmentId,
            submitted_at: submittedAt.toISOString(),
            // ... other fields
        })
        .select()
        .single();

    if (error) {
        console.error("Error submitting homework:", error);
        return;
    }

    // 2. Trigger gamification events
    onHomeworkSubmitted(
        submission.id,
        tenantId,
        studentId,
        submittedAt,
        deadline
    ).catch((err) => {
        console.error("Gamification trigger failed:", err);
    });

    return submission;
}

/**
 * Example 4: Using in a React component with mutations
 */
export function ExampleGradeFormComponent() {
    const { tenant } = useTenant();

    const createGradeMutation = useMutation({
        mutationFn: async (gradeData: any) => {
            // Create grade
            const { data: grade, error } = await supabase
                .from("grades")
                .insert({
                    ...gradeData,
                    tenant_id: tenant!.id,
                })
                .select()
                .single();

            if (error) throw error;

            // Trigger gamification (non-blocking)
            onGradeAdded(
                grade.id,
                tenant!.id,
                gradeData.student_id,
                gradeData.score,
                gradeData.subject_id
            ).catch(console.error);

            return grade;
        },
        onSuccess: () => {
            toast.success("Note ajoutée et points attribués !");
        },
    });

    // ... rest of component
}

/**
 * Integration Checklist:
 * 
 * 1. Find all places where you create:
 *    - Grades (grades table)
 *    - Attendance records (attendance table)
 *    - Homework submissions (assignment_submissions table)
 * 
 * 2. After successful insertion, call the appropriate trigger:
 *    - onGradeAdded() for grades
 *    - onAttendanceMarked() for attendance
 *    - onHomeworkSubmitted() for homework
 * 
 * 3. Always wrap in .catch() to prevent errors from breaking the main flow
 * 
 * 4. Consider showing a toast notification when points/badges are awarded
 * 
 * 5. Test with different scenarios:
 *    - Grade >= 18 (should award 50 points)
 *    - Grade = 20 (should award 100 points)
 *    - 30 consecutive days present (should award badge)
 *    - Homework submitted on time (should award 10 points)
 */
