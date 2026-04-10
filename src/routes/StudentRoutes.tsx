import { lazy } from "react";
import { Route } from "react-router-dom";

// Lazy loaded pages - Student
const StudentDashboard = lazy(() => import("@/pages/student/StudentDashboard"));
const StudentGrades = lazy(() => import("@/pages/student/StudentGrades"));
const StudentSchedule = lazy(() => import("@/pages/student/StudentSchedule"));
const StudentMessages = lazy(() => import("@/pages/student/StudentMessages"));
const StudentHomework = lazy(() => import("@/pages/student/StudentHomework"));
const PreRegistration = lazy(() => import("@/pages/student/PreRegistration"));
const StudentCareers = lazy(() => import("@/pages/student/StudentCareers"));

export const StudentRoutes = () => {
    return (
        <>
            <Route index element={<StudentDashboard />} />
            <Route path="grades" element={<StudentGrades />} />
            <Route path="schedule" element={<StudentSchedule />} />
            <Route path="homework" element={<StudentHomework />} />
            <Route path="messages" element={<StudentMessages />} />
            <Route path="pre-registration" element={<PreRegistration />} />
            <Route path="careers" element={<StudentCareers />} />
        </>
    );
};
