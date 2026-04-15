import { apiClient } from "@/api/client";

export interface SchoolEvent {
    id: string;
    tenant_id: string;
    title: string;
    description: string | null;
    event_type: string;
    start_date: string;
    end_date: string | null;
    location: string | null;
    max_participants: number | null;
    registration_required: boolean;
    is_public: boolean;
    created_by: string | null;
    created_at: string;
    creator?: { first_name: string; last_name: string };
}

export interface EventRegistration {
    event_id: string;
    user_id: string;
}

export const adminQueries = {
    events: (tenantId: string) => ({
        queryKey: ["school-events", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get<SchoolEvent[]>("/school-life/events/");
            return response.data;
        },
    }),

    eventRegistrations: (tenantId: string) => ({
        queryKey: ["event-registrations", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/school-life/event-registrations/");
            return response.data;
        },
    }),

    createEvent: async (tenantId: string, userId: string | undefined, eventData: any) => {
        const response = await apiClient.post("/school-life/events/", eventData);
        return response.data;
    },

    deleteEvent: async (eventId: string) => {
        const response = await apiClient.delete(`/school-life/events/${eventId}/`);
        return response.data;
    },

    analyticsKPIs: (tenantId: string) => ({
        queryKey: ["admin-analytics-kpis", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return null;
            const response = await apiClient.get("/analytics/dashboard-kpis/");
            return response.data;
        },
    }),

    classrooms: (tenantId: string) => ({
        queryKey: ["admin-classrooms", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get<any[]>("/infrastructure/classrooms/");
            return response.data;
        },
    }),

    terms: (tenantId: string) => ({
        queryKey: ["admin-terms", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get<any[]>("/terms/");
            return response.data;
        },
    }),

    studentFullDetail: (tenantId: string, studentId: string) => ({
        queryKey: ["admin-student-detail", tenantId, studentId] as const,
        queryFn: async () => {
            if (!tenantId || !studentId) return null;
            const response = await apiClient.get(`/students/${studentId}/`);
            return response.data;
        },
    }),

    studentEnrollments: (tenantId: string, studentId: string) => ({
        queryKey: ["admin-student-enrollments", tenantId, studentId] as const,
        queryFn: async () => {
            if (!tenantId || !studentId) return [];
            // Enrollments are usually nested in student response or separate
            const response = await apiClient.get(`/students/${studentId}/`);
            return response.data.enrollments || [];
        },
    }),

    studentGradesDetailed: (tenantId: string, studentId: string) => ({
        queryKey: ["admin-student-grades", tenantId, studentId] as const,
        queryFn: async () => {
            if (!tenantId || !studentId) return [];
            const response = await apiClient.get<any[]>("/school-life/grades/", {
                params: { student_id: studentId }
            });
            return response.data;
        },
    }),

    studentAttendanceDetailed: (tenantId: string, studentId: string) => ({
        queryKey: ["admin-student-attendance", tenantId, studentId] as const,
        queryFn: async () => {
            if (!tenantId || !studentId) return [];
            const response = await apiClient.get<any[]>("/school-life/attendance/", {
                params: { student_ids: [studentId] }
            });
            return response.data;
        },
    }),

    studentInvoices: (tenantId: string, studentId: string) => ({
        queryKey: ["admin-student-invoices", tenantId, studentId] as const,
        queryFn: async () => {
            if (!tenantId || !studentId) return [];
            const response = await apiClient.get<any[]>("/payments/invoices/", {
                params: { student_id: studentId }
            });
            return response.data;
        },
    }),

    studentParentsCombined: (studentId: string) => ({
        queryKey: ["admin-student-parents", studentId] as const,
        queryFn: async () => {
            if (!studentId) return [];
            const response = await apiClient.get<any[]>(`/parents/students/${studentId}/parents/`);
            return response.data.map(p => ({
                id: p.id,
                relationship: p.relationship,
                is_primary: p.is_primary,
                type: 'user',
                parent: p.parent // Assuming backend returns parent details
            }));
        },
    }),

    alumniMentors: (tenantId: string) => ({
        queryKey: ["admin-alumni-mentors", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/alumni/admin/mentors/");
            return response.data || [];
        },
    }),

    mentorshipRequests: (tenantId: string) => ({
        queryKey: ["admin-mentorship-requests", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/alumni/admin/mentorship-requests/");
            return response.data || [];
        },
    }),

    alumniDocumentRequests: (tenantId: string) => ({
        queryKey: ["admin-alumni-requests", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/alumni/admin/document-requests/");
            return response.data || [];
        },
    }),

    alumniProfilesForRequests: (tenantId: string) => ({
        queryKey: ["admin-alumni-profiles", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/users/", {
                params: { role: 'ALUMNI', page_size: 100 }
            });
            return response.data?.items || response.data || [];
        },
    }),

    adminStaffMembers: (tenantId: string) => ({
        queryKey: ["admin-staff-members", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/alumni/messaging/staff-recipients/");
            return response.data || [];
        },
    }),

    alumniRequestHistory: (requestId: string) => ({
        queryKey: ["admin-alumni-request-history", requestId] as const,
        queryFn: async () => {
            if (!requestId) return [];
            const response = await apiClient.get(`/alumni/document-requests/${requestId}/history/`);
            return response.data || [];
        },
    }),

    // Badge Queries
    studentBadgesDetailed: (tenantId: string) => ({
        queryKey: ["admin-student-badges", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/school-life/badges/");
            return response.data || [];
        },
    }),

    studentsWithoutBadges: (tenantId: string) => ({
        queryKey: ["admin-students-without-badges", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/school-life/students-without-badges/");
            return response.data || [];
        },
    }),

    studentCheckInHistory: (tenantId: string, startDate?: string, endDate?: string) => ({
        queryKey: ["admin-student-check-ins", tenantId, startDate, endDate] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get<any[]>("/school-life/check-ins/", {
                params: {
                    start_date: startDate,
                    end_date: endDate
                }
            });
            return response.data;
        },
    }),

    getStudentLastCheckIn: async (studentId: string, tenantId: string) => {
        const response = await apiClient.get<any[]>("/school-life/check-ins/", {
            params: { student_ids: [studentId], limit: 1 }
        });
        return response.data[0] || null;
    },

    createStudentCheckIn: async (checkInData: {
        student_id: string;
        tenant_id: string;
        check_in_type: 'ENTRY' | 'EXIT';
        badge_id?: string;
        checked_by?: string;
        notes?: string;
    }) => {
        const response = await apiClient.post("/school-life/check-ins/", checkInData);
        return response.data;
    },

    // Clubs Queries
    adminClubs: (tenantId: string) => ({
        queryKey: ["admin-clubs", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/clubs/");
            return response.data || [];
        },
    }),

    clubMemberships: (tenantId: string) => ({
        queryKey: ["admin-club-memberships", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/clubs/memberships/");
            return response.data || [];
        },
    }),

    studentsForClubs: (tenantId: string) => ({
        queryKey: ["admin-students-for-clubs", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/students/", {
                params: { archived: false }
            });
            // Assume the backend returns full list or we can filter
            return response.data || [];
        },
    }),

    saveSurvey: async (tenantId: string, surveyData: any) => {
        if (surveyData.id) {
            await apiClient.patch(`/surveys/${surveyData.id}/`, surveyData);
        } else {
            await apiClient.post("/surveys/", surveyData);
        }
    },

    deleteSurvey: async (id: string) => {
        await apiClient.delete(`/surveys/${id}/`);
    },

    // Library Queries
    libraryCategories: (tenantId: string) => ({
        queryKey: ["admin-library-categories", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/library/categories/");
            return response.data || [];
        },
    }),

    libraryResources: (tenantId: string, filters: {
        search?: string;
        category?: string;
        type?: string;
    }) => ({
        queryKey: ["admin-library-resources", tenantId, filters] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/library/resources/", {
                params: {
                    search: filters.search,
                    category: filters.category,
                    resource_type: filters.type
                }
            });
            return response.data || [];
        },
    }),

    // Careers Queries
    careersOffers: (tenantId: string) => ({
        queryKey: ["admin-job-offers", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/alumni/careers/jobs/");
            return response.data || [];
        },
    }),

    careersApplications: (tenantId: string) => ({
        queryKey: ["admin-job-applications", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/alumni/admin/job-applications/");
            return response.data || [];
        },
    }),

    careersEvents: (tenantId: string) => ({
        queryKey: ["admin-career-events", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/alumni/careers/events/");
            return response.data || [];
        },
    }),

    careersEventRegistrations: (tenantId: string) => ({
        queryKey: ["admin-career-event-registrations", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/alumni/admin/event-registrations/");
            return response.data || [];
        },
    }),

    // Incidents Queries
    adminIncidents: (tenantId: string) => ({
        queryKey: ["admin-incidents", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/incidents/");
            return response.data || [];
        },
    }),

    // E-learning Queries
    // TODO: Backend endpoints not yet implemented — returning empty stubs to prevent runtime errors
    adminCourses: (tenantId: string) => ({
        queryKey: ["admin-courses", tenantId] as const,
        queryFn: async () => {
            // TODO: Backend endpoint /academic/courses/ not yet implemented
            return [];
        },
    }),

    adminCourseModules: (courseId: string) => ({
        queryKey: ["admin-course-modules", courseId] as const,
        queryFn: async () => {
            // TODO: Backend endpoint /academic/courses/:id/modules/ not yet implemented
            return [];
        },
    }),

    adminCourseEnrollments: (tenantId: string) => ({
        queryKey: ["admin-course-enrollments", tenantId] as const,
        queryFn: async () => {
            // TODO: Backend endpoint /academic/courses/enrollments/ not yet implemented
            return [];
        },
    }),

    // Forum Queries
    adminForums: (tenantId: string) => ({
        queryKey: ["admin-student-forums", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/communication/forums/");
            return response.data || [];
        },
    }),

    adminForumPostCounts: (tenantId: string) => ({
        queryKey: ["admin-forum-post-counts", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return {};
            const response = await apiClient.get("/communication/forums/post-counts/");
            return response.data || {};
        },
    }),

    saveForum: async (tenantId: string, forumData: any) => {
        if (forumData.id) {
            await apiClient.patch(`/communication/forums/${forumData.id}/`, forumData);
        } else {
            await apiClient.post("/communication/forums/", forumData);
        }
    },

    deleteForum: async (id: string) => {
        await apiClient.delete(`/communication/forums/${id}/`);
    },

    // Gamification Queries
    adminGamificationStats: (tenantId: string) => ({
        queryKey: ["admin-gamification-stats", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return null;
            const response = await apiClient.get("/school-life/gamification/stats/");
            return response.data || null;
        },
    }),

    // Survey Queries
    adminSurveys: (tenantId: string) => ({
        queryKey: ["admin-surveys", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/surveys/");
            return response.data || [];
        },
    }),

    adminSurveyQuestions: (surveyId: string) => ({
        queryKey: ["admin-survey-questions", surveyId] as const,
        queryFn: async () => {
            if (!surveyId) return [];
            const response = await apiClient.get(`/surveys/${surveyId}/questions/`);
            return response.data || [];
        },
    }),

    adminSurveyResponseCounts: (tenantId: string) => ({
        queryKey: ["admin-survey-response-counts", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return {};
            const response = await apiClient.get("/surveys/response-counts/");
            return response.data || {};
        },
    }),
    // Inventory Queries
    inventoryCategories: (tenantId: string) => ({
        queryKey: ["admin-inventory-categories", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/inventory/categories/");
            return response.data || [];
        },
    }),

    inventoryItems: (tenantId: string) => ({
        queryKey: ["admin-inventory-items", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/inventory/items/");
            return response.data || [];
        },
    }),

    createInventoryItem: async (tenantId: string, itemData: any) => {
        const response = await apiClient.post("/inventory/items/", itemData);
        return response.data;
    },

    updateInventoryItem: async (itemId: string, itemData: any) => {
        const response = await apiClient.patch(`/inventory/items/${itemId}/`, itemData);
        return response.data;
    },

    deleteInventoryItem: async (itemId: string) => {
        await apiClient.delete(`/inventory/items/${itemId}/`);
    },

    createInventoryCategory: async (tenantId: string, categoryData: any) => {
        const response = await apiClient.post("/inventory/categories/", categoryData);
        return response.data;
    },

    // Orders Queries
    orders: (tenantId: string) => ({
        queryKey: ["admin-orders", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/inventory/orders/");
            return response.data || [];
        },
    }),

    orderItems: (orderId: string) => ({
        queryKey: ["admin-order-items", orderId] as const,
        queryFn: async () => {
            if (!orderId) return [];
            const response = await apiClient.get(`/inventory/orders/${orderId}/items/`);
            // Note: need to add this endpoint to inventory.py if missing, or use a list filtering
            return response.data || [];
        },
    }),

    createOrder: async (tenantId: string, orderData: any, items: any[]) => {
        const response = await apiClient.post("/inventory/orders/", {
            ...orderData,
            items: items.map(item => ({
                item_name: item.item_name,
                item_id: item.item_id || null,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.total_price
            }))
        });
        return response.data;
    },

    deleteOrder: async (orderId: string) => {
        await apiClient.delete(`/inventory/orders/${orderId}/`);
    },

    inventoryTransactions: (tenantId: string) => ({
        queryKey: ["admin-inventory-transactions", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/inventory/transactions/");
            return response.data || [];
        },
    }),

    adjustInventoryStock: async (p_item_id: string, p_quantity: number, p_type: string, p_notes?: string) => {
        await apiClient.post("/inventory/adjust/", {
            item_id: p_item_id,
            quantity: p_quantity,
            type: p_type,
            notes: p_notes
        });
    },
    // AI Generation Queries
    generateAIContent: async (lessonId: string, type: 'SUMMARY' | 'QUIZ') => {
        const response = await apiClient.post("/ai/generate/", { lesson_id: lessonId, type });
        return response.data;
    },

    saveAIQuiz: async (tenantId: string, lessonId: string, quizData: any) => {
        const response = await apiClient.post("/academic/courses/lessons/quiz/", {
            lesson_id: lessonId,
            ...quizData
        });
        return response.data;
    },

    marketplaceResources: (filters: { search?: string; category?: string; type?: string }) => ({
        queryKey: ["admin-marketplace-resources", filters] as const,
        queryFn: async () => {
            const response = await apiClient.get("/library/marketplace/", {
                params: filters
            });
            return response.data || [];
        },
    }),

    calculateCashFlowForecast: async (tenantId: string, monthsAhead: number = 3) => {
        const response = await apiClient.post("/analytics/cash-flow-forecast/", { months_ahead: monthsAhead });
        return response.data;
    },
    ministryKPIs: (tenantId: string) => ({
        queryKey: ["admin-ministry-kpis", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return null;
            const response = await apiClient.get("/analytics/ministry-kpis/");
            return response.data;
        },
    }),
    refreshMinistryDashboard: async () => {
        // Now real-time on sovereign API, but we keep the method for compatibility
        return { success: true };
    }
};
