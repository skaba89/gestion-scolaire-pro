/**
 * Centralized, type-safe query key factory for React Query.
 *
 * Benefits:
 * - Prevents cache key collisions across the app
 * - Enables targeted, surgical cache invalidation
 * - Single source of truth for all query identifiers
 *
 * Usage:
 *   useQuery({ queryKey: queryKeys.students.detail(id), ... })
 *   queryClient.invalidateQueries({ queryKey: queryKeys.students.all })
 */

export const queryKeys = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    all: ["auth"] as const,
    session: () => ["auth", "session"] as const,
    profile: (userId: string) => ["auth", "profile", userId] as const,
  },

  // ── Tenants ───────────────────────────────────────────────────────────────
  tenants: {
    all: ["tenants"] as const,
    list: () => ["tenants", "list"] as const,
    detail: (id: string) => ["tenants", "detail", id] as const,
    settings: (id: string) => ["tenants", "settings", id] as const,
    securitySettings: (id: string) => ["tenants", "security-settings", id] as const,
    stats: (id: string) => ["tenants", "stats", id] as const,
    quotas: (id: string) => ["tenants", "quotas", id] as const,
  },

  // ── Students ──────────────────────────────────────────────────────────────
  students: {
    all: ["students"] as const,
    list: (filters?: Record<string, unknown>) => ["students", "list", filters] as const,
    infinite: (filters?: Record<string, unknown>) => ["students", "infinite", filters] as const,
    detail: (id: string) => ["students", "detail", id] as const,
    byClass: (classId: string) => ["students", "by-class", classId] as const,
    absences: (studentId: string) => ["students", "absences", studentId] as const,
    grades: (studentId: string) => ["students", "grades", studentId] as const,
    risks: (tenantId: string) => ["students", "risks", tenantId] as const,
  },

  // ── Teachers ──────────────────────────────────────────────────────────────
  teachers: {
    all: ["teachers"] as const,
    list: (filters?: Record<string, unknown>) => ["teachers", "list", filters] as const,
    detail: (id: string) => ["teachers", "detail", id] as const,
    schedule: (id: string) => ["teachers", "schedule", id] as const,
    assignments: (id: string) => ["teachers", "assignments", id] as const,
  },

  // ── Classes ───────────────────────────────────────────────────────────────
  classes: {
    all: ["classes"] as const,
    list: () => ["classes", "list"] as const,
    detail: (id: string) => ["classes", "detail", id] as const,
    students: (classId: string) => ["classes", "students", classId] as const,
    schedule: (classId: string) => ["classes", "schedule", classId] as const,
  },

  // ── Grades ────────────────────────────────────────────────────────────────
  grades: {
    all: ["grades"] as const,
    list: (filters?: Record<string, unknown>) => ["grades", "list", filters] as const,
    byStudent: (studentId: string) => ["grades", "by-student", studentId] as const,
    byClass: (classId: string) => ["grades", "by-class", classId] as const,
    report: (studentId: string, period: string) =>
      ["grades", "report", studentId, period] as const,
    stats: (classId: string) => ["grades", "stats", classId] as const,
  },

  // ── Attendance ────────────────────────────────────────────────────────────
  attendance: {
    all: ["attendance"] as const,
    list: (filters?: Record<string, unknown>) => ["attendance", "list", filters] as const,
    byStudent: (studentId: string) => ["attendance", "by-student", studentId] as const,
    byClass: (classId: string, date: string) =>
      ["attendance", "by-class", classId, date] as const,
    stats: (tenantId: string, period: string) =>
      ["attendance", "stats", tenantId, period] as const,
  },

  // ── Messages ──────────────────────────────────────────────────────────────
  messages: {
    all: ["messages"] as const,
    conversations: () => ["messages", "conversations"] as const,
    thread: (conversationId: string) => ["messages", "thread", conversationId] as const,
    unreadCount: () => ["messages", "unread-count"] as const,
  },

  // ── Announcements ─────────────────────────────────────────────────────────
  announcements: {
    all: ["announcements"] as const,
    list: (filters?: Record<string, unknown>) => ["announcements", "list", filters] as const,
    detail: (id: string) => ["announcements", "detail", id] as const,
  },

  // ── Homework ──────────────────────────────────────────────────────────────
  homework: {
    all: ["homework"] as const,
    list: (filters?: Record<string, unknown>) => ["homework", "list", filters] as const,
    detail: (id: string) => ["homework", "detail", id] as const,
    byClass: (classId: string) => ["homework", "by-class", classId] as const,
    byStudent: (studentId: string) => ["homework", "by-student", studentId] as const,
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: {
    all: ["dashboard"] as const,
    stats: () => ["dashboard", "stats"] as const,
    kpis: () => ["dashboard", "kpis"] as const,
    activity: () => ["dashboard", "activity"] as const,
    cashFlow: () => ["dashboard", "cash-flow"] as const,
  },

  // ── Admissions ────────────────────────────────────────────────────────────
  admissions: {
    all: ["admissions"] as const,
    list: (filters?: Record<string, unknown>) => ["admissions", "list", filters] as const,
    detail: (id: string) => ["admissions", "detail", id] as const,
    stats: () => ["admissions", "stats"] as const,
    pipeline: () => ["admissions", "pipeline"] as const,
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  notifications: {
    all: ["notifications"] as const,
    list: () => ["notifications", "list"] as const,
    unreadCount: () => ["notifications", "unread-count"] as const,
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  users: {
    all: ["users"] as const,
    list: () => ["users", "list"] as const,
    detail: (id: string) => ["users", "detail", id] as const,
    me: () => ["users", "me"] as const,
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  analytics: {
    all: ["analytics"] as const,
    overview: (period: string) => ["analytics", "overview", period] as const,
    trends: (metric: string) => ["analytics", "trends", metric] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
