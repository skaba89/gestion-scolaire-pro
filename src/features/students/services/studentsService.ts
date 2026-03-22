import { supabase } from "@/integrations/supabase/client";

export const studentsService = {
  async getProfile(userId: string, tenantId: string) {
    if (!userId || !tenantId) return null;
    const { data, error } = await supabase
      .from("students")
      .select("id, first_name, last_name, registration_number, photo_url")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single();
    if (error) throw error;
    return data;
  },

  async getEnrollment(studentId: string) {
    if (!studentId) return null;
    const { data, error } = await supabase
      .from("enrollments")
      .select(`
        id,
        class_id,
        class_name,
        classrooms (name),
        levels (name),
        academic_years (name)
      `)
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  },

  async getGrades(studentId: string) {
    if (!studentId) return [];
    const { data, error } = await supabase
      .from("grades")
      .select(`
        id,
        score,
        comment,
        created_at,
        assessments!inner (
          id,
          name,
          max_score,
          type,
          date,
          subjects!inner (
            id,
            name,
            code
          )
        )
      `)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getSchedule(classId: string, tenantId: string) {
    if (!classId || !tenantId) return [];
    const { data, error } = await supabase
      .from("schedule")
      .select(`
        id,
        day_of_week,
        start_time,
        end_time,
        room,
        subject,
        teacher_id,
        profiles:teacher_id(first_name, last_name),
        subjects:subject_id(name)
      `)
      .eq("class_id", classId)
      .eq("tenant_id", tenantId)
      .order("day_of_week")
      .order("start_time");

    if (error) throw error;
    return data || [];
  },

  async getHomework(classId: string, tenantId: string) {
    if (!classId || !tenantId) return [];
    const { data, error } = await supabase
      .from("homework")
      .select(`
        *,
        subjects (name),
        profiles:teacher_id (first_name, last_name)
      `)
      .eq("class_id", classId)
      .eq("tenant_id", tenantId)
      .eq("is_published", true)
      .order("due_date", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getCheckInHistory(studentId: string, tenantId: string) {
    if (!studentId || !tenantId) return [];
    const { data, error } = await supabase
      .from("student_check_ins")
      .select("*")
      .eq("student_id", studentId)
      .eq("tenant_id", tenantId)
      .order("checked_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return data;
  },

  async getSubmissions(studentId: string) {
    if (!studentId) return [];
    const { data, error } = await supabase
      .from("homework_submissions")
      .select("id, homework_id, submitted_at, grade, feedback, content")
      .eq("student_id", studentId);
    if (error) throw error;
    return data || [];
  },

  async getMessagingRecipients(userId: string, tenantId: string) {
    if (!userId || !tenantId) return [];

    const recipientsList: Array<{
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      info: string;
    }> = [];

    // 1. Get student record
    const { data: studentData } = await supabase
      .from("students")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single();

    if (studentData) {
      // 2. Get student's enrollments
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("class_id")
        .eq("student_id", studentData.id)
        .eq("status", "active");

      const classroomIds = enrollments?.map(e => e.class_id).filter(Boolean) || [];

      if (classroomIds.length > 0) {
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

        // Deduplicate teachers
        const teacherMap = new Map();
        assignments?.forEach((a: any) => {
          const teacher = a.profiles;
          if (teacher && !teacherMap.has(teacher.id)) {
            teacherMap.set(teacher.id, {
              id: teacher.id,
              first_name: teacher.first_name || "",
              last_name: teacher.last_name || "",
              email: teacher.email || "",
              info: `Professeur - ${(a.subjects as any)?.name || "Enseignant"}`
            });
          }
        });

        recipientsList.push(...Array.from(teacherMap.values()));

        // 4. Get classmates from same classrooms
        const { data: classmateEnrollments } = await supabase
          .from("enrollments")
          .select(`
            student_id,
            students!inner (
              user_id,
              profiles:user_id (id, first_name, last_name, email)
            )
          `)
          .in("class_id", classroomIds)
          .eq("status", "active")
          .neq("student_id", studentData.id);

        const classmateMap = new Map();
        classmateEnrollments?.forEach((e: any) => {
          const profile = e.students?.profiles;
          if (profile && !classmateMap.has(profile.id) && profile.id !== userId) {
            classmateMap.set(profile.id, {
              id: profile.id,
              first_name: profile.first_name || "",
              last_name: profile.last_name || "",
              email: profile.email || "",
              info: "Camarade de classe"
            });
          }
        });

        recipientsList.push(...Array.from(classmateMap.values()));
      }
    }

    // 5. Get administration staff
    const { data: adminUsers } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .eq("tenant_id", tenantId)
      .neq("id", userId)
      .limit(50);

    if (adminUsers?.length) {
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", adminUsers.map(u => u.id))
        .in("role", ["TENANT_ADMIN", "DIRECTOR", "STAFF"]);

      userRoles?.forEach((role: any) => {
        const adminUser = adminUsers.find(u => u.id === role.user_id);
        if (adminUser && !recipientsList.some(r => r.id === adminUser.id)) {
          const roleLabel = role.role === "DIRECTOR" ? "Direction" :
            role.role === "TENANT_ADMIN" ? "Administration" : "Secrétariat";
          recipientsList.push({
            id: adminUser.id,
            first_name: adminUser.first_name || "",
            last_name: adminUser.last_name || "",
            email: adminUser.email || "",
            info: roleLabel
          });
        }
      });
    }

    return recipientsList;
  },

  async getJobOffers(tenantId: string) {
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("job_offers")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getMyApplications(studentId: string) {
    if (!studentId) return [];
    const { data, error } = await supabase
      .from("job_applications")
      .select(`
        *,
        job_offers:job_offer_id (id, title, company_name, offer_type)
      `)
      .eq("student_id", studentId)
      .order("applied_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getCareerEvents(tenantId: string) {
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("career_events")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .gte("start_datetime", new Date().toISOString())
      .order("start_datetime", { ascending: true });
    if (error) throw error;
    return data;
  },

  async getMyEventRegistrations(studentId: string) {
    if (!studentId) return [];
    const { data, error } = await supabase
      .from("career_event_registrations")
      .select("event_id")
      .eq("student_id", studentId);
    if (error) throw error;
    return data.map(r => r.event_id);
  },

  async getMentors(tenantId: string) {
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("alumni_mentors")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_available", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getMyMentorshipRequests(studentId: string) {
    if (!studentId) return [];
    const { data, error } = await supabase
      .from("mentorship_requests")
      .select(`
        *,
        alumni_mentors:mentor_id (id, first_name, last_name, current_company)
      `)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getNextAcademicYear(tenantId: string) {
    if (!tenantId) return null;
    const { data } = await supabase
      .from("academic_years")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("start_date", { ascending: true });

    if (!data || data.length === 0) return null;

    const currentYear = data.find(y => y.is_current);
    if (!currentYear) return data[data.length - 1];

    const currentIndex = data.findIndex(y => y.id === currentYear.id);
    return data[currentIndex + 1] || null;
  },

  async getLevels(tenantId: string) {
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("levels")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("order_index");

    if (error) throw error;
    return data;
  },

  async getExistingAdmissionApplication(tenantId: string, academicYearId: string, firstName: string, lastName: string) {
    if (!tenantId || !academicYearId) return null;
    const { data } = await supabase
      .from("admission_applications")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("academic_year_id", academicYearId)
      .eq("student_first_name", firstName)
      .eq("student_last_name", lastName)
      .maybeSingle();

    return data;
  },

  async submitAdmissionApplication(payload: any) {
    const { error } = await supabase.from("admission_applications").insert(payload);
    if (error) throw error;
  },

  async getDetailedProfile(userId: string, tenantId: string) {
    if (!userId || !tenantId) return null;

    const { data: directStudent } = await supabase
      .from("students")
      .select(`
        *,
        enrollments(
          id,
          status,
          academic_year_id,
          level_id,
          class_id,
          academic_years:academic_year_id(id, name, is_current),
          levels:level_id(id, name),
          classrooms:class_id(id, name)
        )
      `)
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle();

    if (directStudent) return directStudent;

    const { data: parentStudent } = await supabase
      .from("parent_students")
      .select(`
        students(
          *,
          enrollments(
            id,
            status,
            academic_year_id,
            level_id,
            class_id,
            academic_years:academic_year_id(id, name, is_current),
            levels:level_id(id, name),
            classrooms:class_id(id, name)
          )
        )
      `)
      .eq("parent_id", userId)
      .eq("tenant_id", tenantId)
      .eq("is_primary", true)
      .maybeSingle();

    return parentStudent?.students || null;
  }
};
