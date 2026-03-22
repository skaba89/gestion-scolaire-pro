import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { format } from "date-fns";

export const useExportData = () => {
    const { user, roles, profile } = useAuth();
    const { tenant } = useTenant();
    const [isExporting, setIsExporting] = useState(false);

    const exportData = async () => {
        if (!user || !tenant) {
            toast.error("Données utilisateur ou établissement manquantes.");
            return;
        }

        setIsExporting(true);
        try {
            const exportPayload: any = {
                export_date: new Date().toISOString(),
                user: {
                    id: user.id,
                    email: user.email,
                    created_at: user.created_at,
                    last_sign_in: user.last_sign_in_at,
                    app_roles: roles,
                },
                profile: profile,
                tenant: {
                    name: tenant.name,
                    slug: tenant.slug
                },
                audit_logs: [],
                student_data: null,
                teacher_data: null,
                parent_data: null
            };

            // 1. Fetch Audit Logs (where actor_id is the user)
            const { data: logs } = await supabase
                .from("audit_logs")
                .select("*")
                .eq("actor_id", user.id)
                .order("created_at", { ascending: false })
                .limit(100); // Reasonable limit for "recent activity" in a portable file

            exportPayload.audit_logs = logs || [];

            // 2. Fetch specific role data
            if (roles.includes("STUDENT")) {
                // Fetch student profile linked to this user
                // Assuming students table has user_id or email match
                // Best effort based on profile.id (which is user.id)
                // If students table uses a different ID, we need to find it. 
                // Based on StudentDashboard, it uses studentQueries.studentProfile which typically queries by user_id

                const { data: studentProfile } = await supabase
                    .from("students")
                    .select("*, enrollments(*, classroom:classrooms(name))")
                    .eq("tenant_id", tenant.id)
                    .or(`email.eq.${user.email},user_id.eq.${user.id}`) // Robust check
                    .maybeSingle();

                if (studentProfile) {
                    // Fetch grades
                    const { data: grades } = await supabase
                        .from("grades")
                        .select("*, assessment:assessments(name, subject:subjects(name))")
                        .eq("student_id", studentProfile.id);

                    // Fetch attendance
                    const { data: attendance } = await supabase
                        .from("attendance")
                        .select("*")
                        .eq("student_id", studentProfile.id)
                        .limit(200);

                    exportPayload.student_data = {
                        info: studentProfile,
                        grades: grades,
                        attendance: attendance
                    };
                }
            }

            if (roles.includes("TEACHER")) {
                // Teacher logic (usually tied to profile)
                // Fetch classes/subjects assignment?
                // For now, profile and roles cover most personal data.
                // We could fetch assigned classes if needed.
                exportPayload.teacher_data = {
                    // Placeholder for potential teacher specific data
                    note: "Les données d'enseignement sont liées à l'établissement."
                };
            }

            if (roles.includes("PARENT")) {
                // Parent logic
                // Check if linked to students
                const { data: parentStudents } = await supabase
                    .from("student_parents")
                    .select("student:students(first_name, last_name)")
                    .eq("parent_id", user.id); // Assuming parent_id is user.id in this junction table

                // Fetch invoices if parent is the payer
                const { data: invoices } = await supabase
                    .from("invoices")
                    .select("*")
                    .eq("payer_id", user.id) // Assuming payer_id matches user.id
                    .limit(50);

                exportPayload.parent_data = {
                    children: parentStudents,
                    invoices: invoices
                };
            }


            // Generate JSON file
            const jsonString = JSON.stringify(exportPayload, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `my-data-${format(new Date(), "yyyy-MM-dd")}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success("Export de vos données personnelles terminé (JSON).");

        } catch (error: any) {
            console.error("Export Data Error:", error);
            toast.error("Erreur lors de l'export des données.");
        } finally {
            setIsExporting(false);
        }
    };

    return { exportData, isExporting };
};
