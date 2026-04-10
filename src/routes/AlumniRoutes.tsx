import { lazy } from "react";
import { Route } from "react-router-dom";

// Lazy loaded pages - Alumni
const AlumniDocumentRequests = lazy(() => import("@/pages/alumni/AlumniDocumentRequests"));
const AlumniDashboard = lazy(() => import("@/pages/alumni/AlumniDashboard"));
const AlumniMessages = lazy(() => import("@/pages/alumni/AlumniMessages"));
const AlumniCareers = lazy(() => import("@/pages/alumni/AlumniCareers"));

export const AlumniRoutes = () => {
    return (
        <>
            <Route index element={<AlumniDashboard />} />
            <Route path="document-requests" element={<AlumniDocumentRequests />} />
            <Route path="messages" element={<AlumniMessages />} />
            <Route path="careers" element={<AlumniCareers />} />
        </>
    );
};
