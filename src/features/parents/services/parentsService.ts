import { supabase } from "@/integrations/supabase/client";

export const parentsService = {
    async getChildren(parentId: string) {
        if (!parentId) return [];
        const { data, error } = await supabase
            .from("parent_students")
            .select(`
        id,
        is_primary,
        relationship,
        student_id,
        students (
          id, 
          first_name, 
          last_name, 
          registration_number, 
          photo_url,
          date_of_birth,
          gender,
          email,
          phone,
          address
        )
      `)
            .eq("parent_id", parentId);

        if (error) throw error;

        return data.map(item => ({
            id: item.id,
            is_primary: item.is_primary,
            relationship: item.relationship,
            student_id: item.student_id,
            student: item.students as any
        }));
    },

    async getUnpaidInvoices(studentIds: string[]) {
        if (!studentIds.length) return [];
        const { data, error } = await supabase
            .from("invoices")
            .select("*")
            .in("student_id", studentIds)
            .in("status", ["PENDING", "PARTIAL", "OVERDUE"]);

        if (error) throw error;
        return data;
    },

    async getInvoices(studentIds: string[], selectedStudentId?: string) {
        if (studentIds.length === 0) return [];

        let query = supabase
            .from("invoices")
            .select(`
        *,
        students (first_name, last_name, registration_number)
      `)
            .order("created_at", { ascending: false });

        if (selectedStudentId && selectedStudentId !== "all") {
            query = query.eq("student_id", selectedStudentId);
        } else {
            query = query.in("student_id", studentIds);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async getNotifications(userId: string) {
        if (!userId) return [];
        const { data, error } = await supabase
            .from("notifications")
            .select("*")
            .eq("user_id", userId)
            .eq("is_read", false)
            .order("created_at", { ascending: false })
            .limit(5);
        if (error) throw error;
        return data || [];
    },

    async getUnreadMessagesCount(userId: string) {
        if (!userId) return 0;
        const { data: participations } = await supabase
            .from("conversation_participants")
            .select("conversation_id, last_read_at")
            .eq("user_id", userId);

        if (!participations?.length) return 0;
        let count = 0;
        for (const p of participations) {
            const { count: c } = await supabase
                .from("messages")
                .select("id", { count: "exact", head: true })
                .eq("conversation_id", p.conversation_id)
                .neq("sender_id", userId)
                .gt("created_at", p.last_read_at || "1970-01-01T00:00:00Z");
            count += c || 0;
        }
        return count;
    },

    async getUpcomingEvents(tenantId: string) {
        if (!tenantId) return [];
        const today = new Date().toISOString().split("T")[0];
        const { data, error } = await supabase
            .from("school_events")
            .select("*")
            .eq("tenant_id", tenantId)
            .gte("start_date", today)
            .order("start_date", { ascending: true })
            .limit(5);
        if (error) throw error;
        return data || [];
    },

    async getRecentGrades(studentIds: string[]) {
        if (!studentIds.length) return [];
        const { data, error } = await supabase
            .from("grades")
            .select(`
        id,
        score,
        created_at,
        assessments (
          max_score,
          name,
          subjects (name)
        ),
        students (first_name, last_name)
      `)
            .in("student_id", studentIds)
            .not("score", "is", null)
            .order("created_at", { ascending: false })
            .limit(5);
        if (error) throw error;
        return data || [];
    },

    async getAttendanceAlerts(studentIds: string[]) {
        if (!studentIds.length) return [];
        const { data, error } = await supabase
            .from("attendance")
            .select(`
        id,
        date,
        status,
        students (first_name, last_name)
      `)
            .in("student_id", studentIds)
            .in("status", ["ABSENT", "LATE"])
            .order("date", { ascending: false })
            .limit(5);
        if (error) throw error;
        return data || [];
    },

    async getChildCheckInHistory(studentIds: string[]) {
        if (!studentIds.length) return [];
        const { data, error } = await supabase
            .from("student_check_ins")
            .select(`
        *,
        students (first_name, last_name)
      `)
            .in("student_id", studentIds)
            .order("checked_at", { ascending: false })
            .limit(10);
        if (error) throw error;
        return data;
    },

    async getGrades(studentIds: string[], selectedStudentId?: string) {
        if (!studentIds.length) return [];

        let query = supabase
            .from("grades")
            .select(`
        *,
        students (id, first_name, last_name, photo_url),
        assessments (
          id,
          name,
          max_score,
          date,
          subjects (id, name)
        )
      `)
            .order("created_at", { ascending: false });

        if (selectedStudentId && selectedStudentId !== "all") {
            query = query.eq("student_id", selectedStudentId);
        } else {
            query = query.in("student_id", studentIds);
        }

        const { data, error } = await query.limit(100);
        if (error) throw error;
        return data || [];
    },

    async getStudentDetails(studentId: string) {
        if (!studentId) return null;
        const { data, error } = await supabase
            .from("students")
            .select("*")
            .eq("id", studentId)
            .single();

        if (error) throw error;
        return data;
    },

    async getStudentEnrollment(studentId: string) {
        if (!studentId) return null;
        const { data, error } = await supabase
            .from("enrollments")
            .select(`
        *,
        classrooms (name),
        levels (name),
        academic_years (name)
      `)
            .eq("student_id", studentId)
            .eq("status", "active")
            .single();

        if (error) return null;
        return data;
    },

    async getStudentAllGradesDetailed(studentId: string) {
        if (!studentId) return [];
        const { data, error } = await supabase
            .from("grades")
            .select(`
        *,
        assessments (
          name,
          type,
          max_score,
          date,
          weight,
          subjects (name, code, coefficient),
          terms (
            id,
            name,
            academic_years (
              id,
              name
            )
          )
        )
      `)
            .eq("student_id", studentId)
            .not("score", "is", null)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return data;
    },

    async getStudentAllEnrollments(studentId: string) {
        if (!studentId) return [];
        const { data, error } = await supabase
            .from("enrollments")
            .select(`
        *,
        classrooms (name),
        levels (name),
        academic_years (id, name, start_date)
      `)
            .eq("student_id", studentId)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return data;
    },

    async getStudentAllAttendance(studentId: string) {
        if (!studentId) return [];
        const { data, error } = await supabase
            .from("attendance")
            .select("*")
            .eq("student_id", studentId)
            .order("date", { ascending: false });

        if (error) throw error;
        return data;
    },

    async getChildrenTeachers(userId: string, tenantId: string) {
        if (!userId || !tenantId) return [];

        // 1. Get parent's children
        const { data: children } = await supabase
            .from("parent_students")
            .select("student_id")
            .eq("parent_id", userId);

        if (!children?.length) return [];

        const studentIds = children.map(c => c.student_id);

        // 2. Get children's enrollments
        const { data: enrollments } = await supabase
            .from("enrollments")
            .select("class_id")
            .in("student_id", studentIds)
            .eq("status", "active");

        if (!enrollments?.length) return [];

        const classroomIds = enrollments.map(e => e.class_id).filter(Boolean);

        // 3. Get teachers assigned to these classrooms
        const { data: assignments } = await supabase
            .from("teacher_assignments")
            .select(`
        teacher_id,
        profiles:teacher_id (id, first_name, last_name, email),
        subjects (name)
      `)
            .in("class_id", classroomIds)
            .eq("tenant_id", tenantId);

        if (!assignments) return [];

        // 4. Deduplicate teachers
        const teacherMap = new Map();
        assignments.forEach((a: any) => {
            const teacher = a.profiles;
            if (teacher && !teacherMap.has(teacher.id)) {
                const subjects: string[] = [];
                assignments.forEach((as: any) => {
                    if (as.profiles?.id === teacher.id && as.subjects?.name) {
                        if (!subjects.includes(as.subjects.name)) {
                            subjects.push(as.subjects.name);
                        }
                    }
                });

                teacherMap.set(teacher.id, {
                    id: teacher.id,
                    first_name: teacher.first_name || "",
                    last_name: teacher.last_name || "",
                    email: teacher.email || "",
                    info: subjects.join(", ") || "Enseignant"
                });
            }
        });

        return Array.from(teacherMap.values());
    }
};
