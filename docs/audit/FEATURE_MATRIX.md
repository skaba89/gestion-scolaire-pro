# Matrice des écrans — statique, 2026-11-07 (commit `07530de094dafa782b99b3bd614c9d5b55d6bca0`)

Générée par `scripts/audit/feature-matrix.mjs` (méthode et commande : `docs/audit/AUDIT_GLOBAL.md` § 0.3).

**Ce que cette matrice prouve** : pour chaque page de `src/pages/`, si elle est routée, combien d'appels `apiClient` littéraux elle atteint par ses imports, et lesquels ne correspondent à **aucune opération OpenAPI** réelle (chemin + méthode).
**Ce qu'elle ne prouve pas** : le comportement à l'exécution. Une page « NON VÉRIFIÉ » n'a aucun défaut statique détecté, mais n'est jouée par aucun test de parcours. Les URL entièrement dynamiques ne sont pas vérifiées.

Statuts : **DÉFECTUEUX** = appel sans route dans la page ou dans un module qu'elle seule utilise · **À VÉRIFIER** = appel sans route dans un module partagé · **NON VÉRIFIÉ** = aucun défaut statique, aucun parcours · **COMPLET (parcours E2E)** = nom de page cité par `tests/e2e/journeys/` (détection par nom : sous-estime la couverture réelle) · **NON ROUTÉE** = page sans route.

| Statut | Pages |
|---|---:|
| DÉFECTUEUX | 9 |
| À VÉRIFIER | 19 |
| NON VÉRIFIÉ | 116 |
| COMPLET (parcours E2E) | 3 |
| NON ROUTÉE | 24 |
| **Total** | **171** |

## DÉFECTUEUX (9)

| Portail | Page | Appels API | Défauts |
|---|---|---:|---|
| Admin | `admin/AdvancedExports.tsx` | 79 | GET /hr/staff (pages/admin/AdvancedExports.tsx)<br>(partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/AlumniMentors.tsx` | 77 | PUT /hr/mentorship-requests/X (pages/admin/AlumniMentors.tsx)<br>(partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Elearning.tsx` | 77 | PATCH /course-lessons/X (components/admin/elearning/CourseContent.tsx)<br>(partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/ReportCards.tsx` | 22 | POST /students/term-results/bulk (utils/pedagogicalEngine.ts) |
| Admin | `admin/VideoMeetings.tsx` | 14 | GET /communication/video-meetings (pages/admin/VideoMeetings.tsx)<br>POST /communication/video-meetings (pages/admin/VideoMeetings.tsx)<br>PATCH /communication/video-meetings/X (pages/admin/VideoMeetings.tsx) |
| Parent | `parent/Appointments.tsx` | 18 | **Corrigé 2026-11-11** (rendez-vous de bout en bout, parcours E2E 16) |
| Parent | `parent/ParentDashboard.tsx` | 44 | GET /students/terms/X (utils/riskAssessment.ts) |
| Teacher | `teacher/AppointmentSlots.tsx` | 17 | **Corrigé 2026-11-11** (rendez-vous de bout en bout, parcours E2E 16) |
| Teacher | `teacher/ClassSessionAttendance.tsx` | 19 | Faux positif de l'analyse statique (URL `${activeSession?.id}` non lue) : `PATCH /school-life/check-ins/sessions/{id}/end/` existe |

## À VÉRIFIER (19)

| Portail | Page | Appels API | Défauts |
|---|---|---:|---|
| Admin | `admin/AlumniRequestsManagement.tsx` | 77 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Analytics.tsx` | 78 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Badges.tsx` | 81 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Careers.tsx` | 80 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Clubs.tsx` | 77 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Events.tsx` | 73 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Forums.tsx` | 73 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Gamification.tsx` | 88 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Incidents.tsx` | 75 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/InventoryDashboard.tsx` | 73 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/InventoryManagement.tsx` | 73 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Library.tsx` | 78 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/LiveAttendance.tsx` | 78 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Marketplace.tsx` | 74 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/MinistryDashboard.tsx` | 78 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/OrderHistory.tsx` | 76 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/OrderReception.tsx` | 77 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/StudentDetail.tsx` | 114 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| Admin | `admin/Surveys.tsx` | 73 | (partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |

## NON VÉRIFIÉ (116)

| Portail | Page | Appels API | Défauts |
|---|---|---:|---|
| Admin | `admin/AcademicRules.tsx` | 11 | — |
| Admin | `admin/AcademicYears.tsx` | 15 | — |
| Admin | `admin/AccountingExports.tsx` | 11 | — |
| Admin | `admin/Admissions.tsx` | 15 | — |
| Admin | `admin/AIInsights.tsx` | 14 | — |
| Admin | `admin/Announcements.tsx` | 22 | — |
| Admin | `admin/AuditLogs.tsx` | 12 | — |
| Admin | `admin/Billing.tsx` | 4 | — |
| Admin | `admin/Bookings.tsx` | 18 | — |
| Admin | `admin/Campuses.tsx` | 15 | — |
| Admin | `admin/Certificates.tsx` | 15 | — |
| Admin | `admin/ClassLists.tsx` | 20 | — |
| Admin | `admin/Classrooms.tsx` | 53 | — |
| Admin | `admin/Dashboard.tsx` | 30 | — |
| Admin | `admin/DataImport.tsx` | 4 | — |
| Admin | `admin/DataQuality.tsx` | 14 | — |
| Admin | `admin/DecisionDashboard.tsx` | 16 | — |
| Admin | `admin/Departments.tsx` | 19 | — |
| Admin | `admin/Documentation.tsx` | 11 | — |
| Admin | `admin/Enrollments.tsx` | 36 | — |
| Admin | `admin/EnrollmentStats.tsx` | 15 | — |
| Admin | `admin/Faculties.tsx` | 15 | — |
| Admin | `admin/Grades.tsx` | 16 | — |
| Admin | `admin/HumanResources.tsx` | 28 | — |
| Admin | `admin/KioskDevices.tsx` | 15 | — |
| Admin | `admin/LandingPageEditor.tsx` | 15 | — |
| Admin | `admin/Levels.tsx` | 15 | — |
| Admin | `admin/Messages.tsx` | 33 | — |
| Admin | `admin/Onboarding.tsx` | 17 | — |
| Admin | `admin/ProfileSettings.tsx` | 28 | — |
| Admin | `admin/Programs.tsx` | 15 | — |
| Admin | `admin/PublicFormSubmissions.tsx` | 4 | — |
| Admin | `admin/PublicPagesManager.tsx` | 19 | — |
| Admin | `admin/QrScanPage.tsx` | 13 | — |
| Admin | `admin/RGPDPanel.tsx` | 22 | — |
| Admin | `admin/Schedule.tsx` | 47 | — |
| Admin | `admin/SchoolCalendar.tsx` | 15 | — |
| Admin | `admin/SecuritySessions.tsx` | 3 | — |
| Admin | `admin/Semesters.tsx` | 20 | — |
| Admin | `admin/Settings.tsx` | 65 | — |
| Admin | `admin/Subjects.tsx` | 50 | — |
| Admin | `admin/SuperAdminTenants.tsx` | 0 | — |
| Admin | `admin/TeacherHours.tsx` | 34 | — |
| Admin | `admin/Teachers.tsx` | 46 | — |
| Admin | `admin/Terms.tsx` | 19 | — |
| Admin | `admin/TestingGuide.tsx` | 11 | — |
| Admin | `admin/UniversityGuide.tsx` | 0 | — |
| Admin | `admin/Users.tsx` | 30 | — |
| Admin | `settings/RGPDSettings.tsx` | 17 | — |
| Alumni | `alumni/AlumniCareers.tsx` | 8 | — |
| Alumni | `alumni/AlumniDashboard.tsx` | 19 | — |
| Alumni | `alumni/AlumniDocumentRequests.tsx` | 9 | — |
| Alumni | `alumni/AlumniMessages.tsx` | 37 | — |
| App | `NotFound.tsx` | 0 | — |
| App | `public/PublicPageView.tsx` | 7 | — |
| App | `superadmin/CreateTenantWithAdmin.tsx` | 9 | — |
| App | `superadmin/SaaSDashboard.tsx` | 3 | — |
| App | `superadmin/SubscriptionRequests.tsx` | 3 | — |
| App | `superadmin/SuperAdminDashboard.tsx` | 14 | — |
| App | `superadmin/TenantSettings.tsx` | 4 | — |
| App | `TenantAuth.tsx` | 11 | — |
| Department | `department/DepartmentAlertHistory.tsx` | 13 | — |
| Department | `department/DepartmentAttendance.tsx` | 11 | — |
| Department | `department/DepartmentClassrooms.tsx` | 0 | — |
| Department | `department/DepartmentDashboard.tsx` | 28 | — |
| Department | `department/DepartmentExamCalendar.tsx` | 13 | — |
| Department | `department/DepartmentExams.tsx` | 0 | — |
| Department | `department/DepartmentMessages.tsx` | 29 | — |
| Department | `department/DepartmentReports.tsx` | 16 | — |
| Department | `department/DepartmentSchedule.tsx` | 0 | — |
| Department | `department/DepartmentStudents.tsx` | 0 | — |
| Department | `department/DepartmentTeachers.tsx` | 0 | — |
| Parent | `parent/Analytics.tsx` | 16 | — |
| Parent | `parent/ChildDetail.tsx` | 26 | — |
| Parent | `parent/Children.tsx` | 29 | — |
| Parent | `parent/Invoices.tsx` | 30 | — |
| Parent | `parent/Messages.tsx` | 43 | — |
| Parent | `parent/PreRegistration.tsx` | 16 | — |
| Parent | `parent/ReportCards.tsx` | 28 | — |
| Public | `admin/CreateTenant.tsx` | 12 | — |
| Public | `Bootstrap.tsx` | 1 | — |
| Public | `ChangePassword.tsx` | 9 | — |
| Public | `ForgotPassword.tsx` | 1 | — |
| Public | `Index.tsx` | 11 | — |
| Public | `Install.tsx` | 0 | — |
| Public | `public/AdmissionForm.tsx` | 15 | — |
| Public | `public/AdmissionInfo.tsx` | 4 | — |
| Public | `public/ApplicationStatus.tsx` | 4 | — |
| Public | `public/ConnectionHub.tsx` | 11 | — |
| Public | `public/Contact.tsx` | 3 | — |
| Public | `public/EnrollmentHub.tsx` | 0 | — |
| Public | `public/KioskScanPage.tsx` | 0 | — |
| Public | `public/Pricing.tsx` | 0 | — |
| Public | `public/Privacy.tsx` | 0 | — |
| Public | `public/Programs.tsx` | 15 | — |
| Public | `public/PublicCalendar.tsx` | 4 | — |
| Public | `public/PublicDirectory.tsx` | 3 | — |
| Public | `public/ReEnrollment.tsx` | 0 | — |
| Public | `public/Register.tsx` | 9 | — |
| Public | `public/SchoolFlowHomePage.tsx` | 3 | — |
| Public | `public/TenantLanding.tsx` | 7 | — |
| Public | `public/Terms.tsx` | 0 | — |
| Public | `ResetPassword.tsx` | 2 | — |
| Student | `student/PreRegistration.tsx` | 35 | — |
| Student | `student/StudentCareers.tsx` | 38 | — |
| Student | `student/StudentDashboard.tsx` | 29 | — |
| Student | `student/StudentGrades.tsx` | 17 | — |
| Student | `student/StudentHomework.tsx` | 26 | — |
| Student | `student/StudentMessages.tsx` | 53 | — |
| Student | `student/StudentSchedule.tsx` | 17 | — |
| Teacher | `teacher/TeacherAttendance.tsx` | 34 | — |
| Teacher | `teacher/TeacherClasses.tsx` | 30 | — |
| Teacher | `teacher/TeacherDashboard.tsx` | 41 | — |
| Teacher | `teacher/TeacherGrades.tsx` | 32 | — |
| Teacher | `teacher/TeacherHomework.tsx` | 20 | — |
| Teacher | `teacher/TeacherMessages.tsx` | 29 | — |

## COMPLET (parcours E2E) (3)

| Portail | Page | Appels API | Défauts |
|---|---|---:|---|
| Admin | `admin/Finances.tsx` | 39 | — |
| Admin | `admin/Students.tsx` | 58 | — |
| Public | `Auth.tsx` | 8 | — |

## NON ROUTÉE (24)

| Portail | Page | Appels API | Défauts |
|---|---|---:|---|
| — | `admin/EarlyWarnings.tsx` | 13 | GET /school-life/early-warnings (pages/admin/EarlyWarnings.tsx)<br>PUT /school-life/early-warnings/X (pages/admin/EarlyWarnings.tsx) |
| — | `admin/ElectronicSignatures.tsx` | 14 | GET /communication/electronic-documents (pages/admin/ElectronicSignatures.tsx)<br>POST /communication/electronic-documents (pages/admin/ElectronicSignatures.tsx)<br>POST /communication/document-signatories (pages/admin/ElectronicSignatures.tsx) |
| — | `admin/ExecutiveDashboard.tsx` | 85 | GET /schedule/terms (pages/admin/ExecutiveDashboard.tsx)<br>GET /analytics/cash-flow-forecasts (pages/admin/ExecutiveDashboard.tsx)<br>(partagé) GET /inventory/orders/X/items (queries/admin.ts)<br>(partagé) DELETE /inventory/orders/X (queries/admin.ts)<br>(partagé) POST /academic/courses/lessons/quiz (queries/admin.ts)<br>(partagé) GET /library/marketplace (queries/admin.ts) |
| — | `admin/GamificationTest.tsx` | 17 | — |
| — | `admin/Sponsorships.tsx` | 17 | GET /school-life/sponsorships (pages/admin/Sponsorships.tsx)<br>PUT /school-life/sponsorships/X (pages/admin/Sponsorships.tsx)<br>POST /school-life/sponsorships (pages/admin/Sponsorships.tsx)<br>DELETE /school-life/sponsorships/X (pages/admin/Sponsorships.tsx) |
| — | `admin/SuccessPlans.tsx` | 15 | GET /school-life/success-plans (pages/admin/SuccessPlans.tsx)<br>POST /school-life/success-plans (pages/admin/SuccessPlans.tsx)<br>PATCH /school-life/success-plans/X (pages/admin/SuccessPlans.tsx) |
| — | `admin/university-guide/components/GuideComponents.tsx` | 0 | — |
| — | `admin/university-guide/sections/AcademicsSection.tsx` | 0 | — |
| — | `admin/university-guide/sections/AlumniSection.tsx` | 0 | — |
| — | `admin/university-guide/sections/DepartmentsSection.tsx` | 0 | — |
| — | `admin/university-guide/sections/DocumentsSection.tsx` | 0 | — |
| — | `admin/university-guide/sections/FinancesSection.tsx` | 0 | — |
| — | `admin/university-guide/sections/OverviewSection.tsx` | 0 | — |
| — | `admin/university-guide/sections/ReportsSection.tsx` | 0 | — |
| — | `admin/university-guide/sections/ScheduleSection.tsx` | 0 | — |
| — | `admin/university-guide/sections/SetupSection.tsx` | 0 | — |
| — | `admin/university-guide/sections/StudentsSection.tsx` | 0 | — |
| — | `admin/university-guide/sections/UsersSection.tsx` | 0 | — |
| — | `AuthNative.tsx` | 8 | — |
| — | `public/landing/DefaultLandingTemplate.tsx` | 3 | — |
| — | `public/landing/HighSchoolTemplate.tsx` | 3 | — |
| — | `public/landing/LegacyHeroBackground.tsx` | 0 | — |
| — | `public/landing/PrimarySchoolTemplate.tsx` | 3 | — |
| — | `public/landing/UniversityTemplate.tsx` | 3 | — |

