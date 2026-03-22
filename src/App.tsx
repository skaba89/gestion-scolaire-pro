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

// Components
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Layouts
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { ParentLayout } from "@/components/layouts/ParentLayout";
import { TeacherLayout } from "@/components/layouts/TeacherLayout";
import { StudentLayout } from "@/components/layouts/StudentLayout";
import { AlumniLayout } from "@/components/layouts/AlumniLayout";
import { TenantRoute } from "@/components/TenantRoute";

// Lazy-loaded pages
const NotFound = lazy(() => import("./pages/NotFound"));
const TenantLanding = lazy(() => import("./pages/public/TenantLanding"));

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
      <main id="main-content">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* 1. Dashboard Routes (High Priority) */}
              <Route
                path="/:tenantSlug/admin"
                element={
                  <TenantRoute>
                    <ProtectedRoute allowedRoles={["SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "STAFF"]}>
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
));

export default App;
