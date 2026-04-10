import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const Index = lazy(() => import("@/pages/Index"));
const Auth = lazy(() => import("@/pages/Auth"));
const ChangePassword = lazy(() => import("@/pages/ChangePassword"));
const AdmissionForm = lazy(() => import("@/pages/public/AdmissionForm"));
const TenantLanding = lazy(() => import("@/pages/public/TenantLanding"));
const AdmissionInfo = lazy(() => import("@/pages/public/AdmissionInfo"));
const Programs = lazy(() => import("@/pages/public/Programs"));
const PublicCalendar = lazy(() => import("@/pages/public/PublicCalendar"));
const Contact = lazy(() => import("@/pages/public/Contact"));
const Install = lazy(() => import("@/pages/Install"));
const Privacy = lazy(() => import("@/pages/public/Privacy"));
const TermsOfService = lazy(() => import("@/pages/public/Terms"));
const CreateTenant = lazy(() => import("@/pages/admin/CreateTenant"));
const SchoolFlowHomePage = lazy(() => import("@/pages/public/SchoolFlowHomePage"));
const PublicDirectory = lazy(() => import("@/pages/public/PublicDirectory"));

export const PublicRoutes = () => {
    return (
        <>
            {/* SchoolFlow Pro marketing homepage */}
            <Route path="/" element={<SchoolFlowHomePage />} />

            {/* Institution directory */}
            <Route path="/annuaire" element={<PublicDirectory />} />

            {/* Legacy index (kept for compatibility) */}
            <Route path="/app" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/change-password" element={
                <ProtectedRoute>
                    <ChangePassword />
                </ProtectedRoute>
            } />
            <Route path="/ecole/:tenantSlug" element={<TenantLanding />} />
            <Route path="/info/:tenantSlug" element={<AdmissionInfo />} />
            <Route path="/admissions/:tenantSlug" element={<AdmissionForm />} />

            {/* Demo Routes */}
            <Route path="/demo" element={<Navigate to="/ecole/lasource" replace />} />
            <Route path="/demo/admissions" element={<Navigate to="/admissions/lasource" replace />} />

            <Route path="/programmes/:tenantSlug" element={<Programs />} />
            <Route path="/calendrier/:tenantSlug" element={<PublicCalendar />} />
            <Route path="/contact/:tenantSlug" element={<Contact />} />
            <Route path="/install" element={<Install />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<TermsOfService />} />

            {/* Create Tenant */}
            <Route path="/admin/create-tenant" element={
                <ProtectedRoute>
                    <CreateTenant />
                </ProtectedRoute>
            } />
        </>
    );
};
