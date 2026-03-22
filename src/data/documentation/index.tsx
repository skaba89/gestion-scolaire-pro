import React from "react";
import { Shield, Users, GraduationCap, Building } from "lucide-react";
import { ModuleDoc, DocCategory } from "./types";
import { getAdminDocs } from "./admin";
import { getTeacherDocs } from "./teacher";
import { getParentDocs } from "./parent";
import { getStudentDocs } from "./student";
import { getAlumniDocs, getDepartmentDocs } from "./shared";

// Images (kept for compatibility)
import adminDashboardImg from "@/assets/docs/admin-dashboard.png";
import teacherDashboardImg from "@/assets/docs/teacher-dashboard.png";
import parentDashboardImg from "@/assets/docs/parent-dashboard.png";
import studentDashboardImg from "@/assets/docs/student-dashboard.png";
import alumniDashboardImg from "@/assets/docs/alumni-dashboard.png";
import departmentDashboardImg from "@/assets/docs/department-dashboard.png";

export const CATEGORY_IMAGES: Record<string, string> = {
    admin: adminDashboardImg,
    teacher: teacherDashboardImg,
    parent: parentDashboardImg,
    student: studentDashboardImg,
    alumni: alumniDashboardImg,
    department: departmentDashboardImg,
};

export const getDocumentationModules = (
    studentLabel: string,
    studentsLabel: string,
    StudentLabel: string,
    StudentsLabel: string
): ModuleDoc[] => [
        ...getAdminDocs(studentLabel, studentsLabel, StudentLabel, StudentsLabel),
        ...getTeacherDocs(studentLabel, studentsLabel),
        ...getParentDocs(studentLabel),
        ...getStudentDocs(studentLabel),
        ...getAlumniDocs(studentLabel),
        ...getDepartmentDocs(studentsLabel)
    ];

export const getDocCategories = (studentLabel: string): DocCategory[] => [
    { id: "admin", label: "Administration", icon: <Shield className="h-4 w-4" /> },
    { id: "teacher", label: "Enseignant", icon: <Users className="h-4 w-4" /> },
    { id: "parent", label: "Parent", icon: <Users className="h-4 w-4" /> },
    { id: "student", label: studentLabel.charAt(0).toUpperCase() + studentLabel.slice(1), icon: <GraduationCap className="h-4 w-4" /> },
    { id: "alumni", label: "Alumni", icon: <GraduationCap className="h-4 w-4" /> },
    { id: "department", label: "Département", icon: <Building className="h-4 w-4" /> },
];

export * from "./types";
