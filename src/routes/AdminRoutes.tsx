import { lazy } from "react";
import { Route } from "react-router-dom";

// Lazy loaded pages - Admin
const Dashboard = lazy(() => import("@/pages/admin/Dashboard"));
const Admissions = lazy(() => import("@/pages/admin/Admissions"));
const Students = lazy(() => import("@/pages/admin/Students"));
const Grades = lazy(() => import("@/pages/admin/Grades"));
const Finances = lazy(() => import("@/pages/admin/Finances"));
const OrderReception = lazy(() => import("@/pages/admin/OrderReception"));
const OrderHistory = lazy(() => import("@/pages/admin/OrderHistory"));
const Settings = lazy(() => import("@/pages/admin/Settings"));
const AcademicYears = lazy(() => import("@/pages/admin/AcademicYears"));
const Terms = lazy(() => import("@/pages/admin/Terms"));
const Levels = lazy(() => import("@/pages/admin/Levels"));
const Schedule = lazy(() => import("@/pages/admin/Schedule"));
const Classrooms = lazy(() => import("@/pages/admin/Classrooms"));
const Subjects = lazy(() => import("@/pages/admin/Subjects"));
const Campuses = lazy(() => import("@/pages/admin/Campuses"));
const AdminReportCards = lazy(() => import("@/pages/admin/ReportCards"));
const UsersPage = lazy(() => import("@/pages/admin/Users"));
const SchoolCalendar = lazy(() => import("@/pages/admin/SchoolCalendar"));
const TeachersPage = lazy(() => import("@/pages/admin/Teachers"));
const AuditLogs = lazy(() => import("@/pages/admin/AuditLogs"));
const Badges = lazy(() => import("@/pages/admin/Badges"));
const TeacherHours = lazy(() => import("@/pages/admin/TeacherHours"));
const LiveAttendance = lazy(() => import("@/pages/admin/LiveAttendance"));
const AdminMessages = lazy(() => import("@/pages/admin/Messages"));
const Enrollments = lazy(() => import("@/pages/admin/Enrollments"));
const Announcements = lazy(() => import("@/pages/admin/Announcements"));
const StudentDetail = lazy(() => import("@/pages/admin/StudentDetail"));
const Departments = lazy(() => import("@/pages/admin/Departments"));
const Certificates = lazy(() => import("@/pages/admin/Certificates"));
const EnrollmentStats = lazy(() => import("@/pages/admin/EnrollmentStats"));
const Gamification = lazy(() => import("@/pages/admin/Gamification"));
const Analytics = lazy(() => import("@/pages/admin/Analytics"));
const Library = lazy(() => import("@/pages/admin/Library"));
const Bookings = lazy(() => import("@/pages/admin/Bookings"));
const Elearning = lazy(() => import("@/pages/admin/Elearning"));
const InventoryManagement = lazy(() => import("@/pages/admin/InventoryManagement"));
const InventoryDashboard = lazy(() => import("@/pages/admin/InventoryDashboard"));
const AdvancedExports = lazy(() => import("@/pages/admin/AdvancedExports"));
const ProfileSettings = lazy(() => import("@/pages/admin/ProfileSettings"));
const RGPDSettings = lazy(() => import("@/pages/settings/RGPDSettings"));
const AdminRGPDPanel = lazy(() => import("@/pages/admin/RGPDPanel"));
const AIInsights = lazy(() => import("@/pages/admin/AIInsights"));
const Events = lazy(() => import("@/pages/admin/Events"));
const Clubs = lazy(() => import("@/pages/admin/Clubs"));
const HumanResources = lazy(() => import("@/pages/admin/HumanResources"));
const AccountingExports = lazy(() => import("@/pages/admin/AccountingExports"));
const SuperAdminTenants = lazy(() => import("@/pages/admin/SuperAdminTenants"));
const Careers = lazy(() => import("@/pages/admin/Careers"));
const AlumniMentors = lazy(() => import("@/pages/admin/AlumniMentors"));
const Forums = lazy(() => import("@/pages/admin/Forums"));
const Sponsorships = lazy(() => import("@/pages/admin/Sponsorships"));
const Surveys = lazy(() => import("@/pages/admin/Surveys"));
const AlumniRequestsManagement = lazy(() => import("@/pages/admin/AlumniRequestsManagement"));
const SecuritySessions = lazy(() => import("@/pages/admin/SecuritySessions"));
const Documentation = lazy(() => import("@/pages/admin/Documentation"));
const TestingGuide = lazy(() => import("@/pages/admin/TestingGuide"));
const UniversityGuide = lazy(() => import("@/pages/admin/UniversityGuide"));
const Incidents = lazy(() => import("@/pages/admin/Incidents"));
const EarlyWarnings = lazy(() => import("@/pages/admin/EarlyWarnings"));
const SuccessPlans = lazy(() => import("@/pages/admin/SuccessPlans"));
const ElectronicSignatures = lazy(() => import("@/pages/admin/ElectronicSignatures"));
const VideoMeetings = lazy(() => import("@/pages/admin/VideoMeetings"));
const ClassLists = lazy(() => import("@/pages/admin/ClassLists"));
const DataQuality = lazy(() => import("@/pages/admin/DataQuality"));
const TestingDashboard = lazy(() => import("@/pages/TestingDashboard"));
const AcademicRules = lazy(() => import("@/pages/admin/AcademicRules"));
const Marketplace = lazy(() => import("@/pages/admin/Marketplace"));
const DecisionDashboard = lazy(() => import("@/pages/admin/DecisionDashboard"));
const QrScanPage = lazy(() => import("@/pages/admin/QrScanPage"));
const Onboarding = lazy(() => import("@/pages/admin/Onboarding"));
const MinistryDashboard = lazy(() => import("@/pages/admin/MinistryDashboard"));
const LandingPageEditor = lazy(() => import("@/pages/admin/LandingPageEditor"));
const CreateTenant = lazy(() => import("@/pages/admin/CreateTenant"));
const PublicPagesManager = lazy(() => import("@/pages/admin/PublicPagesManager"));

export const AdminRoutes = () => {
    return (
        <>
            <Route index element={<Dashboard />} />
            <Route path="onboarding" element={<Onboarding />} />
            <Route path="admissions" element={<Admissions />} />
            <Route path="students" element={<Students />} />
            <Route path="class-lists" element={<ClassLists />} />
            <Route path="grades" element={<Grades />} />
            <Route path="finances" element={<Finances />} />
            <Route path="orders" element={<OrderReception />} />
            <Route path="orders/history" element={<OrderHistory />} />
            <Route path="inventory" element={<InventoryManagement />} />
            <Route path="inventory/analytics" element={<InventoryDashboard />} />
            <Route path="academic-years" element={<AcademicYears />} />
            <Route path="terms" element={<Terms />} />
            <Route path="levels" element={<Levels />} />
            <Route path="classrooms" element={<Classrooms />} />
            <Route path="subjects" element={<Subjects />} />
            <Route path="campuses" element={<Campuses />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="calendar" element={<SchoolCalendar />} />
            <Route path="report-cards" element={<AdminReportCards />} />
            <Route path="settings" element={<Settings />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="teachers" element={<TeachersPage />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="badges" element={<Badges />} />
            <Route path="teacher-hours" element={<TeacherHours />} />
            <Route path="live-attendance" element={<LiveAttendance />} />
            <Route path="messages" element={<AdminMessages />} />
            <Route path="enrollments" element={<Enrollments />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="students/:studentId" element={<StudentDetail />} />
            <Route path="departments" element={<Departments />} />
            <Route path="certificates" element={<Certificates />} />
            <Route path="enrollment-stats" element={<EnrollmentStats />} />
            <Route path="gamification" element={<Gamification />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="library" element={<Library />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="elearning" element={<Elearning />} />
            <Route path="exports" element={<AdvancedExports />} />
            <Route path="profile" element={<ProfileSettings />} />
            <Route path="ai-insights" element={<AIInsights />} />
            <Route path="events" element={<Events />} />
            <Route path="clubs" element={<Clubs />} />
            <Route path="hr" element={<HumanResources />} />
            <Route path="accounting-exports" element={<AccountingExports />} />
            <Route path="tenants" element={<SuperAdminTenants />} />
            <Route path="careers" element={<Careers />} />
            <Route path="alumni-mentors" element={<AlumniMentors />} />
            <Route path="forums" element={<Forums />} />
            <Route path="sponsorships" element={<Sponsorships />} />
            <Route path="surveys" element={<Surveys />} />
            <Route path="alumni-requests" element={<AlumniRequestsManagement />} />
            <Route path="security" element={<SecuritySessions />} />
            <Route path="rgpd" element={<AdminRGPDPanel />} />
            <Route path="settings/rgpd" element={<RGPDSettings />} />
            <Route path="documentation" element={<Documentation />} />
            <Route path="testing-guide" element={<TestingGuide />} />
            <Route path="university-guide" element={<UniversityGuide />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="early-warnings" element={<EarlyWarnings />} />
            <Route path="success-plans" element={<SuccessPlans />} />
            <Route path="electronic-signatures" element={<ElectronicSignatures />} />
            <Route path="video-meetings" element={<VideoMeetings />} />
            <Route path="data-quality" element={<DataQuality />} />
            <Route path="testing" element={<TestingDashboard />} />
            <Route path="academic-rules" element={<AcademicRules />} />
            <Route path="marketplace" element={<Marketplace />} />
            <Route path="decision-support" element={<DecisionDashboard />} />
            <Route path="scan" element={<QrScanPage />} />
            <Route path="ministry-reporting" element={<MinistryDashboard />} />
            <Route path="landing" element={<LandingPageEditor />} />
            <Route path="create-tenant" element={<CreateTenant />} />
            <Route path="public-pages" element={<PublicPagesManager />} />
        </>
    );
};
