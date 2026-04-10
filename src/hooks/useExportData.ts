import { useState } from "react";
import { apiClient } from "@/api/client";
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
            try {
                const { data: logs } = await apiClient.get("/audit/", {
                    params: { actor_id: user.id, page_size: 100 },
                });
                exportPayload.audit_logs = logs?.results ?? logs?.data ?? logs ?? [];
            } catch {
                exportPayload.audit_logs = [];
            }

            // 2. Fetch specific role data
            if (roles.includes("STUDENT")) {
                try {
                    const { data: studentProfile } = await apiClient.get("/students/dashboard/");

                    if (studentProfile) {
                        let grades: any[] = [];
                        let attendance: any[] = [];

                        try {
                            const gradesResp = await apiClient.get("/grades/", {
                                params: { student_id: studentProfile.id },
                            });
                            grades = gradesResp.data?.results ?? gradesResp.data ?? [];
                        } catch { /* grades fetch failed */ }

                        try {
                            const attendanceResp = await apiClient.get("/attendance/", {
                                params: { student_id: studentProfile.id, page_size: 200 },
                            });
                            attendance = attendanceResp.data?.results ?? attendanceResp.data ?? [];
                        } catch { /* attendance fetch failed */ }

                        exportPayload.student_data = {
                            info: studentProfile,
                            grades,
                            attendance,
                        };
                    }
                } catch { /* student profile fetch failed */ }
            }

            if (roles.includes("TEACHER")) {
                exportPayload.teacher_data = {
                    note: "Les données d'enseignement sont liées à l'établissement."
                };
            }

            if (roles.includes("PARENT")) {
                try {
                    const { data: parentChildren } = await apiClient.get("/parents/children/");
                    let invoices: any[] = [];
                    try {
                        const invoicesResp = await apiClient.get("/invoices/", {
                            params: { payer_id: user.id, page_size: 50 },
                        });
                        invoices = invoicesResp.data?.results ?? invoicesResp.data ?? [];
                    } catch { /* invoices fetch failed */ }

                    exportPayload.parent_data = {
                        children: parentChildren,
                        invoices,
                    };
                } catch { /* parent data fetch failed */ }
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
