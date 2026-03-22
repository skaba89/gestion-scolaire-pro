import { lazy } from "react";
import { Route } from "react-router-dom";

// Lazy loaded pages - Teacher
const TeacherDashboard = lazy(() => import("@/pages/teacher/TeacherDashboard"));
const TeacherClasses = lazy(() => import("@/pages/teacher/TeacherClasses"));
const TeacherGrades = lazy(() => import("@/pages/teacher/TeacherGrades"));
const TeacherAttendance = lazy(() => import("@/pages/teacher/TeacherAttendance"));
const TeacherMessages = lazy(() => import("@/pages/teacher/TeacherMessages"));
const TeacherHomework = lazy(() => import("@/pages/teacher/TeacherHomework"));
const ClassSessionAttendance = lazy(() => import("@/pages/teacher/ClassSessionAttendance"));
const AppointmentSlots = lazy(() => import("@/pages/teacher/AppointmentSlots"));

export const TeacherRoutes = () => {
    return (
        <>
            <Route index element={<TeacherDashboard />} />
            <Route path="classes" element={<TeacherClasses />} />
            <Route path="grades" element={<TeacherGrades />} />
            <Route path="attendance" element={<TeacherAttendance />} />
            <Route path="homework" element={<TeacherHomework />} />
            <Route path="messages" element={<TeacherMessages />} />
            <Route path="appointment-slots" element={<AppointmentSlots />} />
            <Route path="session-attendance" element={<ClassSessionAttendance />} />
        </>
    );
};
