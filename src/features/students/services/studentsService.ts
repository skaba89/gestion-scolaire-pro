import { apiClient } from "@/api/client";

export const studentsService = {
  async getProfile(userId: string, tenantId: string) {
    if (!userId || !tenantId) return null;
    const { data } = await apiClient.get<any>("/students/profile/", {
      params: { user_id: userId, tenant_id: tenantId },
    });
    return data || null;
  },

  async getEnrollment(studentId: string) {
    if (!studentId) return null;
    try {
      const { data } = await apiClient.get<any>(`/students/${studentId}/enrollment/`, {
        params: { status: "active" },
      });
      return data || null;
    } catch {
      return null;
    }
  },

  async getGrades(studentId: string) {
    if (!studentId) return [];
    const { data } = await apiClient.get<any[]>("/grades/", {
      params: { student_id: studentId },
    });
    return data || [];
  },

  async getSchedule(classId: string, tenantId: string) {
    if (!classId || !tenantId) return [];
    const { data } = await apiClient.get<any[]>("/schedule/", {
      params: { class_id: classId, tenant_id: tenantId },
    });
    return data || [];
  },

  async getHomework(classId: string, tenantId: string) {
    if (!classId || !tenantId) return [];
    const { data } = await apiClient.get<any[]>("/homework/", {
      params: { class_id: classId, tenant_id: tenantId, is_published: "true" },
    });
    return data || [];
  },

  async getCheckInHistory(studentId: string, tenantId: string) {
    if (!studentId || !tenantId) return [];
    const { data } = await apiClient.get<any[]>("/school-life/check-ins/", {
      params: { student_id: studentId, tenant_id: tenantId, limit: "10" },
    });
    return data || [];
  },

  async getSubmissions(studentId: string) {
    if (!studentId) return [];
    const { data } = await apiClient.get<any[]>("/homework/submissions/", {
      params: { student_id: studentId },
    });
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

    try {
      const { data: result } = await apiClient.get<any[]>("/students/messaging-recipients/", {
        params: { user_id: userId, tenant_id: tenantId },
      });
      return result || [];
    } catch {
      // Fallback: try fetching data manually
    }

    return recipientsList;
  },

  async getJobOffers(tenantId: string) {
    if (!tenantId) return [];
    const { data } = await apiClient.get<any[]>("/alumni/careers/jobs/", {
      params: { tenant_id: tenantId, is_active: "true" },
    });
    return data || [];
  },

  async getMyApplications(studentId: string) {
    if (!studentId) return [];
    const { data } = await apiClient.get<any[]>("/alumni/careers/applications/", {
      params: { student_id: studentId },
    });
    return data || [];
  },

  async getCareerEvents(tenantId: string) {
    if (!tenantId) return [];
    const { data } = await apiClient.get<any[]>("/school-life/events/", {
      params: { tenant_id: tenantId, is_active: "true", type: "career" },
    });
    return data || [];
  },

  async getMyEventRegistrations(studentId: string) {
    if (!studentId) return [];
    const { data } = await apiClient.get<any[]>("/school-life/events/registrations/", {
      params: { student_id: studentId },
    });
    return (data || []).map((r: any) => r.event_id);
  },

  async getMentors(tenantId: string) {
    if (!tenantId) return [];
    const { data } = await apiClient.get<any[]>("/alumni/careers/mentors/", {
      params: { tenant_id: tenantId, is_available: "true" },
    });
    return data || [];
  },

  async getMyMentorshipRequests(studentId: string) {
    if (!studentId) return [];
    const { data } = await apiClient.get<any[]>("/alumni/admin/mentorship-requests/", {
      params: { student_id: studentId },
    });
    return data || [];
  },

  async getNextAcademicYear(tenantId: string) {
    if (!tenantId) return null;
    const { data } = await apiClient.get<any[]>("/academic-years/", {
      params: { tenant_id: tenantId },
    });
    if (!data || data.length === 0) return null;

    const currentYear = data.find((y: any) => y.is_current);
    if (!currentYear) return data[data.length - 1];

    const currentIndex = data.findIndex((y: any) => y.id === currentYear.id);
    return data[currentIndex + 1] || null;
  },

  async getLevels(tenantId: string) {
    if (!tenantId) return [];
    const { data } = await apiClient.get<any[]>("/levels/", {
      params: { tenant_id: tenantId },
    });
    return data || [];
  },

  async getExistingAdmissionApplication(tenantId: string, academicYearId: string, firstName: string, lastName: string) {
    if (!tenantId || !academicYearId) return null;
    const { data } = await apiClient.get<any[]>("/admissions/", {
      params: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        student_first_name: firstName,
        student_last_name: lastName,
      },
    });
    return data?.[0] || null;
  },

  async submitAdmissionApplication(payload: any) {
    await apiClient.post("/admissions/", payload);
  },

  async getDetailedProfile(userId: string, tenantId: string) {
    if (!userId || !tenantId) return null;
    try {
      const { data } = await apiClient.get<any>("/students/detailed-profile/", {
        params: { user_id: userId, tenant_id: tenantId },
      });
      return data || null;
    } catch {
      return null;
    }
  },
};
