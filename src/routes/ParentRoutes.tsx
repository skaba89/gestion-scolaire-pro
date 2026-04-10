import { lazy } from "react";
import { Route } from "react-router-dom";

// Lazy loaded pages - Parent
const ParentDashboard = lazy(() => import("@/pages/parent/ParentDashboard"));
const Children = lazy(() => import("@/pages/parent/Children"));
const ChildDetail = lazy(() => import("@/pages/parent/ChildDetail"));
const ReportCards = lazy(() => import("@/pages/parent/ReportCards"));
const Invoices = lazy(() => import("@/pages/parent/Invoices"));
const Messages = lazy(() => import("@/pages/parent/Messages"));
const ParentPreRegistration = lazy(() => import("@/pages/parent/PreRegistration"));
const ParentAnalytics = lazy(() => import("@/pages/parent/Analytics"));
const Appointments = lazy(() => import("@/pages/parent/Appointments"));

export const ParentRoutes = () => {
    return (
        <>
            <Route index element={<ParentDashboard />} />
            <Route path="children" element={<Children />} />
            <Route path="children/:studentId" element={<ChildDetail />} />
            <Route path="analytics" element={<ParentAnalytics />} />
            <Route path="report-cards" element={<ReportCards />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="messages" element={<Messages />} />
            <Route path="pre-registration" element={<ParentPreRegistration />} />
            <Route path="appointments" element={<Appointments />} />
        </>
    );
};
