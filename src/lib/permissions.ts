import type { AppRole } from "./types";
export type { AppRole };

// Define all available permissions in the system
export type Permission =
  // User management
  | "users:read"
  | "users:create"
  | "users:update"
  | "users:delete"
  | "users:assign_roles"

  // Student management
  | "students:read"
  | "students:create"
  | "students:update"
  | "students:delete"
  | "students:import"
  | "students:export"
  | "students:view_details"

  // Enrollment
  | "enrollments:read"
  | "enrollments:create"
  | "enrollments:update"
  | "enrollments:manage"

  // Academic structure
  | "levels:manage"
  | "classrooms:manage"
  | "subjects:manage"
  | "academic_years:manage"
  | "terms:manage"

  // Grades & Assessments
  | "assessments:read"
  | "assessments:create"
  | "assessments:manage"
  | "grades:read"
  | "grades:create"
  | "grades:update"
  | "grades:transmit"

  // Attendance
  | "attendance:read"
  | "attendance:manage"

  // Homework
  | "homework:read"
  | "homework:create"
  | "homework:grade"

  // Report cards
  | "report_cards:read"
  | "report_cards:generate"

  // Finance
  | "fees:read"
  | "fees:manage"
  | "invoices:read"
  | "invoices:create"
  | "invoices:update"
  | "payments:read"
  | "payments:create"
  | "payment_status:read"

  // Messaging
  | "messages:read"
  | "messages:send"
  | "messages:send_group"
  | "messages:admin"

  // Schedule
  | "schedule:read"
  | "schedule:manage"

  // Calendar & Events
  | "events:read"
  | "events:manage"

  // Admissions
  | "admissions:read"
  | "admissions:manage"
  | "admissions:convert"

  // Settings
  | "settings:read"
  | "settings:manage"
  | "tenant:manage"

  // Teachers
  | "teachers:read"
  | "teachers:manage"
  | "teacher_assignments:manage"
  | "teacher_progress:read"

  // Departments
  | "departments:read"
  | "departments:manage"
  | "department:own"

  // Exams
  | "exams:read"
  | "exams:manage"

  // Certificates
  | "certificates:read"
  | "certificates:generate"

  // Rooms
  | "rooms:read"
  | "rooms:manage"

  // Dashboard
  | "dashboard:admin"
  | "dashboard:teacher"
  | "dashboard:student"
  | "dashboard:parent"
  | "dashboard:department"

  // Guides
  | "guides:read"

  // AI
  | "ai:read";

// Permission matrix by role
export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  SUPER_ADMIN: [
    // Super admin has all permissions
    "users:read", "users:create", "users:update", "users:delete", "users:assign_roles",
    "students:read", "students:create", "students:update", "students:delete", "students:import", "students:export", "students:view_details",
    "enrollments:read", "enrollments:create", "enrollments:update", "enrollments:manage",
    "levels:manage", "classrooms:manage", "subjects:manage", "academic_years:manage", "terms:manage",
    "assessments:read", "assessments:create", "assessments:manage", "grades:read", "grades:create", "grades:update", "grades:transmit",
    "attendance:read", "attendance:manage",
    "homework:read", "homework:create", "homework:grade",
    "report_cards:read", "report_cards:generate",
    "fees:read", "fees:manage", "invoices:read", "invoices:create", "invoices:update", "payments:read", "payments:create", "payment_status:read",
    "messages:read", "messages:send", "messages:send_group", "messages:admin",
    "schedule:read", "schedule:manage",
    "events:read", "events:manage",
    "admissions:read", "admissions:manage", "admissions:convert",
    "settings:read", "settings:manage", "tenant:manage",
    "teachers:read", "teachers:manage", "teacher_assignments:manage", "teacher_progress:read",
    "departments:read", "departments:manage",
    "exams:read", "exams:manage",
    "certificates:read", "certificates:generate",
    "rooms:read", "rooms:manage",
    "dashboard:admin",
    "guides:read", "ai:read",
  ],

  TENANT_ADMIN: [
    "users:read", "users:create", "users:update", "users:delete", "users:assign_roles",
    "students:read", "students:create", "students:update", "students:delete", "students:import", "students:export", "students:view_details",
    "enrollments:read", "enrollments:create", "enrollments:update", "enrollments:manage",
    "levels:manage", "classrooms:manage", "subjects:manage", "academic_years:manage", "terms:manage",
    "assessments:read", "assessments:create", "assessments:manage", "grades:read", "grades:create", "grades:update", "grades:transmit",
    "attendance:read", "attendance:manage",
    "homework:read", "homework:create", "homework:grade",
    "report_cards:read", "report_cards:generate",
    "fees:read", "fees:manage", "invoices:read", "invoices:create", "invoices:update", "payments:read", "payments:create", "payment_status:read",
    "messages:read", "messages:send", "messages:send_group", "messages:admin",
    "schedule:read", "schedule:manage",
    "events:read", "events:manage",
    "admissions:read", "admissions:manage", "admissions:convert",
    "settings:read", "settings:manage", "tenant:manage",
    "teachers:read", "teachers:manage", "teacher_assignments:manage", "teacher_progress:read",
    "departments:read", "departments:manage",
    "exams:read", "exams:manage",
    "certificates:read", "certificates:generate",
    "rooms:read", "rooms:manage",
    "dashboard:admin",
    "guides:read", "ai:read",
  ],

  DIRECTOR: [
    "users:read", "users:create", "users:update",
    "students:read", "students:create", "students:update", "students:import", "students:export", "students:view_details",
    "enrollments:read", "enrollments:create", "enrollments:update", "enrollments:manage",
    "levels:manage", "classrooms:manage", "subjects:manage", "academic_years:manage", "terms:manage",
    "assessments:read", "assessments:manage", "grades:read", "grades:transmit",
    "attendance:read", "attendance:manage",
    "homework:read", "homework:grade",
    "report_cards:read", "report_cards:generate",
    "fees:read", "invoices:read", "payment_status:read",
    "messages:read", "messages:send", "messages:send_group", "messages:admin",
    "schedule:read", "schedule:manage",
    "events:read", "events:manage",
    "admissions:read", "admissions:manage", "admissions:convert",
    "settings:read",
    "teachers:read", "teachers:manage", "teacher_assignments:manage", "teacher_progress:read",
    "departments:read", "departments:manage",
    "exams:read", "exams:manage",
    "certificates:read", "certificates:generate",
    "rooms:read", "rooms:manage",
    "dashboard:admin",
    "guides:read", "ai:read",
  ],

  DEPARTMENT_HEAD: [
    "students:read", "students:view_details",
    "enrollments:read",
    "subjects:manage",
    "assessments:read", "grades:read",
    "attendance:read", "attendance:manage",
    "homework:read",
    "schedule:read", "schedule:manage",
    "events:read",
    "teachers:read", "teacher_progress:read",
    "department:own",
    "exams:read", "exams:manage",
    "rooms:read",
    "messages:read", "messages:send", "messages:send_group",
    "dashboard:department",
    "guides:read",
  ],

  TEACHER: [
    "students:read",
    "assessments:read", "assessments:create", "grades:read", "grades:create", "grades:update", "grades:transmit",
    "attendance:read", "attendance:manage",
    "homework:read", "homework:create", "homework:grade",
    "report_cards:read",
    "messages:read", "messages:send", "messages:send_group",
    "schedule:read",
    "events:read",
    "rooms:read",
    "dashboard:teacher",
    "guides:read",
  ],

  STUDENT: [
    "grades:read",
    "homework:read",
    "report_cards:read",
    "messages:read", "messages:send",
    "schedule:read",
    "events:read",
    "dashboard:student",
    "guides:read",
  ],

  PARENT: [
    "students:read", "students:view_details",
    "grades:read",
    "attendance:read",
    "homework:read",
    "report_cards:read",
    "invoices:read", "payment_status:read",
    "messages:read", "messages:send",
    "events:read",
    "dashboard:parent",
    "guides:read",
  ],

  ACCOUNTANT: [
    "students:read",
    "fees:read", "fees:manage",
    "invoices:read", "invoices:create", "invoices:update",
    "payments:read", "payments:create", "payment_status:read",
    "messages:read", "messages:send",
    "dashboard:admin",
    "guides:read", // Comptable can see guides
  ],

  ALUMNI: [
    "grades:read",
    "report_cards:read",
    "messages:read", "messages:send",
    "events:read",
    "schedule:read",
    "dashboard:student",
    "guides:read",
  ],

  STAFF: [
    "users:read",
    "students:read", "students:create", "students:update", "students:import", "students:view_details",
    "enrollments:read", "enrollments:create", "enrollments:update", "enrollments:manage",
    "grades:read",
    "attendance:read",
    "schedule:read",
    "invoices:read", "payment_status:read",
    "messages:read", "messages:send",
    "admissions:read", "admissions:manage",
    "teachers:read", "teacher_progress:read",
    "certificates:read", "certificates:generate",
    "dashboard:admin",
    "guides:read",
  ],

  SECRETARY: [
    "users:read",
    "students:read", "students:create", "students:update", "students:view_details",
    "enrollments:read", "enrollments:create", "enrollments:update", "enrollments:manage",
    "grades:read",
    "attendance:read", "attendance:manage",
    "schedule:read",
    "invoices:read", "payment_status:read",
    "messages:read", "messages:send", "messages:send_group",
    "admissions:read", "admissions:manage",
    "teachers:read", "teacher_progress:read",
    "certificates:read", "certificates:generate",
    "rooms:read",
    "dashboard:admin",
    "guides:read",
  ],
};

// Get all permissions for a set of roles
export const getPermissionsForRoles = (roles: AppRole[]): Permission[] => {
  const permissions = new Set<Permission>();

  roles.forEach((role) => {
    const rolePermissions = ROLE_PERMISSIONS[role] || [];
    rolePermissions.forEach((permission) => permissions.add(permission));
  });

  return Array.from(permissions);
};

// Check if roles have a specific permission
export const hasPermission = (roles: AppRole[], permission: Permission): boolean => {
  return roles.some((role) => {
    const rolePermissions = ROLE_PERMISSIONS[role] || [];
    return rolePermissions.includes(permission);
  });
};

// Check if roles have any of the specified permissions
export const hasAnyPermission = (roles: AppRole[], permissions: Permission[]): boolean => {
  return permissions.some((permission) => hasPermission(roles, permission));
};

// Check if roles have all of the specified permissions
export const hasAllPermissions = (roles: AppRole[], permissions: Permission[]): boolean => {
  return permissions.every((permission) => hasPermission(roles, permission));
};

// Get role label
export const getRoleLabel = (role: AppRole, studentLabel?: string): string => {
  const labels: Record<AppRole, string> = {
    SUPER_ADMIN: "Super Admin",
    TENANT_ADMIN: "Administrateur",
    DIRECTOR: "Directeur",
    DEPARTMENT_HEAD: "Chef de Département",
    TEACHER: "Enseignant",
    STUDENT: studentLabel || "Élève",
    PARENT: "Parent",
    ACCOUNTANT: "Comptable",
    STAFF: "Secrétariat",
    SECRETARY: "Secrétaire",
    ALUMNI: "Ancien élève",
  };
  return labels[role] || role;
};

// Get role description
export const getRoleDescription = (role: AppRole, studentLabel: string = "élève", studentsLabel: string = "élèves"): string => {
  const descriptions: Record<AppRole, string> = {
    SUPER_ADMIN: "Accès complet à tous les établissements et fonctionnalités",
    TENANT_ADMIN: "Gestion complète de l'établissement",
    DIRECTOR: "Direction pédagogique et administrative",
    DEPARTMENT_HEAD: `Gestion complète du département (cours, examens, enseignants, ${studentsLabel})`,
    TEACHER: `Gestion des cours, notes, devoirs et présences des ${studentsLabel}`,
    STUDENT: "Accès aux notes, devoirs et emploi du temps",
    PARENT: "Suivi de la scolarité des enfants",
    ACCOUNTANT: "Gestion financière et facturation",
    STAFF: `Secrétariat : inscriptions, documents administratifs, attestations, suivi des ${studentsLabel}`,
    SECRETARY: `Gestion des inscriptions, documents officiels, certificats, présences et suivi des ${studentsLabel}`,
    ALUMNI: "Accès en lecture aux données académiques",
  };
  return descriptions[role] || "";
};

// Get all available roles
export const getAllRoles = (): AppRole[] => {
  return ["SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "DEPARTMENT_HEAD", "TEACHER", "STUDENT", "PARENT", "ACCOUNTANT", "STAFF", "SECRETARY", "ALUMNI"];
};

// Get invitable roles (roles that can be assigned by admins)
export const getInvitableRoles = (): AppRole[] => {
  return ["DIRECTOR", "DEPARTMENT_HEAD", "TEACHER", "PARENT", "ACCOUNTANT", "STAFF", "SECRETARY", "STUDENT", "ALUMNI"];
};

// Permission category for UI grouping
export interface PermissionCategory {
  name: string;
  permissions: { key: Permission; label: string }[];
}

export const getPermissionCategories = (studentsLabel: string = "Élèves"): PermissionCategory[] => {
  return [
    {
      name: "Utilisateurs",
      permissions: [
        { key: "users:read", label: "Voir les utilisateurs" },
        { key: "users:create", label: "Créer des utilisateurs" },
        { key: "users:update", label: "Modifier les utilisateurs" },
        { key: "users:delete", label: "Supprimer des utilisateurs" },
        { key: "users:assign_roles", label: "Assigner des rôles" },
      ],
    },
    {
      name: studentsLabel,
      permissions: [
        { key: "students:read", label: `Voir les ${studentsLabel.toLowerCase()}` },
        { key: "students:create", label: `Créer des ${studentsLabel.toLowerCase()}` },
        { key: "students:update", label: `Modifier les ${studentsLabel.toLowerCase()}` },
        { key: "students:delete", label: `Supprimer des ${studentsLabel.toLowerCase()}` },
        { key: "students:import", label: `Importer des ${studentsLabel.toLowerCase()}` },
        { key: "students:export", label: `Exporter des ${studentsLabel.toLowerCase()}` },
      ],
    },
    {
      name: "Notes & Évaluations",
      permissions: [
        { key: "assessments:read", label: "Voir les évaluations" },
        { key: "assessments:create", label: "Créer des évaluations" },
        { key: "grades:read", label: "Voir les notes" },
        { key: "grades:create", label: "Saisir des notes" },
        { key: "grades:update", label: "Modifier les notes" },
      ],
    },
    {
      name: "Présences",
      permissions: [
        { key: "attendance:read", label: "Voir les présences" },
        { key: "attendance:manage", label: "Gérer les présences" },
      ],
    },
    {
      name: "Finances",
      permissions: [
        { key: "fees:read", label: "Voir les frais" },
        { key: "fees:manage", label: "Gérer les frais" },
        { key: "invoices:read", label: "Voir les factures" },
        { key: "invoices:create", label: "Créer des factures" },
        { key: "payments:read", label: "Voir les paiements" },
        { key: "payments:create", label: "Enregistrer des paiements" },
      ],
    },
    {
      name: "Messagerie",
      permissions: [
        { key: "messages:read", label: "Lire les messages" },
        { key: "messages:send", label: "Envoyer des messages" },
        { key: "messages:send_group", label: "Messages groupés" },
        { key: "messages:admin", label: "Messagerie admin" },
      ],
    },
  ];
};
