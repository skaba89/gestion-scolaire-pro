import { lazy } from "react";
import { Route } from "react-router-dom";

// Lazy loaded pages - Department
const DepartmentDashboard = lazy(() => import("@/pages/department/DepartmentDashboard"));
const DepartmentClassrooms = lazy(() => import("@/pages/department/DepartmentClassrooms"));
const DepartmentStudents = lazy(() => import("@/pages/department/DepartmentStudents"));
const DepartmentExams = lazy(() => import("@/pages/department/DepartmentExams"));
const DepartmentAttendance = lazy(() => import("@/pages/department/DepartmentAttendance"));
const DepartmentTeachers = lazy(() => import("@/pages/department/DepartmentTeachers"));
const DepartmentExamCalendar = lazy(() => import("@/pages/department/DepartmentExamCalendar"));
const DepartmentSchedule = lazy(() => import("@/pages/department/DepartmentSchedule"));
const DepartmentMessages = lazy(() => import("@/pages/department/DepartmentMessages"));
const DepartmentReports = lazy(() => import("@/pages/department/DepartmentReports"));
const DepartmentAlertHistory = lazy(() => import("@/pages/department/DepartmentAlertHistory"));

export const DepartmentRoutes = () => {
    return (
        <>
            <Route index element={<DepartmentDashboard />} />
            <Route path="classrooms" element={<DepartmentClassrooms />} />
            <Route path="students" element={<DepartmentStudents />} />
            <Route path="exams" element={<DepartmentExams />} />
            <Route path="attendance" element={<DepartmentAttendance />} />
            <Route path="teachers" element={<DepartmentTeachers />} />
            <Route path="calendar" element={<DepartmentExamCalendar />} />
            <Route path="schedule" element={<DepartmentSchedule />} />
            <Route path="messages" element={<DepartmentMessages />} />
            <Route path="reports" element={<DepartmentReports />} />
            <Route path="alerts-history" element={<DepartmentAlertHistory />} />
        </>
    );
};
