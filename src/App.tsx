import { Suspense, lazy, memo } from "react";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import OfflineIndicator from "@/components/pwa/OfflineIndicator";
import { NotificationPrompt } from "@/components/notifications/NotificationPrompt";
import { SkipLinks } from "@/components/accessibility/SkipLinks";
import { NativeAppProvider } from "@/components/native/NativeAppProvider";
import { AuthSyncProvider } from "@/components/providers/AuthSyncProvider";
import { SettingsProvider } from "@/components/providers/SettingsProvider";
import { DynamicThemeProvider } from "@/components/providers/DynamicThemeProvider";
import { AIChatWidget } from "@/components/ai/AIChatWidget";

// Components
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Layouts
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { ParentLayout } from "@/components/layouts/ParentLayout";
import { TeacherLayout } from "@/components/layouts/TeacherLayout";
import { StudentLayout } from "@/components/layouts/StudentLayout";
import { AlumniLayout } from "@/components/layouts/AlumniLayout";
import { DepartmentLayout } from "@/components/layouts/DepartmentLayout";
import { TenantRoute } from "@/components/TenantRoute";

// Lazy-loaded pages
const NotFound = lazy(() => import("./pages/NotFound"));
const TenantLanding = lazy(() => import("./pages/public/TenantLanding"));
const SuperAdminDashboard = lazy(() => import("./pages/superadmin/SuperAdminDashboard"));
const CreateTenantWithAdmin = lazy(() => import("./pages/superadmin/CreateTenantWithAdmin"));

const PageLoader = () => (
    <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
);

// Route modules
import { PublicRoutes } from "./routes/PublicRoutes";
import { AdminRoutes } from "./routes/AdminRoutes";
import { TeacherRoutes } from "./routes/TeacherRoutes";
import { ParentRoutes } from "./routes/ParentRoutes";
import { StudentRoutes } from "./routes/StudentRoutes";
import { AlumniRoutes } from "./routes/AlumniRoutes";
import { DepartmentRoutes } from "./routes/DepartmentRoutes";

// Layouts
import { SuperAdminLayout } from "@/components/layouts/SuperAdminLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const AppContent = memo(() => {
  return (
    <>
      <Toaster />
      <Sonner position="top-right" closeButton richColors />
      <OfflineIndicator />
      <SkipLinks />
      <NotificationPrompt />
      <AIChatWidget />
      <main id="main-content">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* 0. Super Admin Routes (no tenant required) */}
              <Route
                path="/super-admin"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                    <SuperAdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<SuperAdminDashboard />} />
                <Route path="tenants" element={<SuperAdminDashboard />} />
                <Route path="create-tenant" element={<CreateTenantWithAdmin />} />
              </Route>

              {/* 1. Dashboard Routes (High Priority) */}
              <Route
                path="/:tenantSlug/admin"
                element={
                  <TenantRoute>
                    <ProtectedRoute allowedRoles={["SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "STAFF", "ACCOUNTANT"]}>
                      <AdminLayout />
                    </ProtectedRoute>
                  </TenantRoute>
                }
              >
                {AdminRoutes()}
              </Route>

              <Route
                path="/:tenantSlug/parent"
                element={
                  <TenantRoute>
                    <ProtectedRoute allowedRoles={["PARENT"]}>
                      <ParentLayout />
                    </ProtectedRoute>
                  </TenantRoute>
                }
              >
                {ParentRoutes()}
              </Route>

              <Route
                path="/:tenantSlug/teacher"
                element={
                  <TenantRoute>
                    <ProtectedRoute allowedRoles={["TEACHER"]}>
                      <TeacherLayout />
                    </ProtectedRoute>
                  </TenantRoute>
                }
              >
                {TeacherRoutes()}
              </Route>

              <Route
                path="/:tenantSlug/student"
                element={
                  <TenantRoute>
                    <ProtectedRoute allowedRoles={["STUDENT"]}>
                      <StudentLayout />
                    </ProtectedRoute>
                  </TenantRoute>
                }
              >
                {StudentRoutes()}
              </Route>
              
              <Route
                path="/:tenantSlug/alumni"
                element={
                  <TenantRoute>
                    <ProtectedRoute allowedRoles={["ALUMNI", "STUDENT"]}>
                      <AlumniLayout />
                    </ProtectedRoute>
                  </TenantRoute>
                }
              >
                {AlumniRoutes()}
              </Route>

              <Route
                path="/:tenantSlug/department"
                element={
                  <TenantRoute>
                    <ProtectedRoute allowedRoles={["DEPARTMENT_HEAD"]}>
                      <DepartmentLayout />
                    </ProtectedRoute>
                  </TenantRoute>
                }
              >
                {DepartmentRoutes()}
              </Route>

              {/* 2. Specific Public Routes */}
              {PublicRoutes()}

              {/* 3. ROOT Tenant Slug Fallback (Matches /isc-paris, /lasource, etc.) */}
              <Route path="/:tenantSlug" element={<TenantLanding />} />

              {/* 4. Global 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </>
  );
});

const App = memo(() => (
  <ErrorBoundary fallback={
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Une erreur est survenue
        </h2>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          Une erreur inattendue s'est produite lors du chargement de l'application.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
        >
          Recharger la page
        </button>
      </div>
    </div>
  }>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="system">
          <TooltipProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AuthProvider>
                <TenantProvider>
                  <SettingsProvider>
                    <AuthSyncProvider>
                      <DynamicThemeProvider>
                        <NativeAppProvider>
                          <AppContent />
                        </NativeAppProvider>
                      </DynamicThemeProvider>
                    </AuthSyncProvider>
                  </SettingsProvider>
                </TenantProvider>
              </AuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </ErrorBoundary>
));

export default App;
