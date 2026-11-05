# Appels frontend sans route backend — lot devoirs du 2026-11-05

Référence de départ : `828a6f7158e555290c4c71b6beee28e7c213dc0c` (main après #380).
Mesures du code proposé : **646 opérations**, 985 appels détectés,
21 URL dynamiques non vérifiables, **51 occurrences = 48 clés distinctes**
sans opération (49 clés avant). Le POST /homework-submissions/ de l'élève
est remplacé par la route de remise existante ; la modification utilise
une nouvelle route de contenu, distincte de la notation. Voir
`HOMEWORK_SUBMISSIONS_20261105.md` et la PR pour les tests.
L'analyse statique seule ne valide ni les permissions ni les corps/réponses.

## Chemin absent
DELETE /course-discussions/X  (src/components/elearning/CourseDiscussions.tsx:96)
DELETE /enrollments/X  (src/hooks/queries/useEnrollments.ts:70)
DELETE /infrastructure/classrooms/X  (src/queries/classrooms.ts:154)
DELETE /inventory/orders/X  (src/queries/admin.ts:597)
DELETE /rooms/X  (src/components/classrooms/RoomsManager.tsx:124)
DELETE /school-life/sponsorships/X  (src/pages/admin/Sponsorships.tsx:141)
GET /academic/subjects  (src/pages/admin/TeacherHours.tsx:84)
GET /analytics/cash-flow-forecasts  (src/pages/admin/ExecutiveDashboard.tsx:167)
GET /classroom-departments  (src/components/dashboard/DepartmentDashboardCharts.tsx:24)
GET /communication/electronic-documents  (src/pages/admin/ElectronicSignatures.tsx:71)
GET /communication/video-meetings  (src/pages/admin/VideoMeetings.tsx:62)
GET /finance/invoices  (src/utils/cashFlowForecasting.ts:39)
GET /finance/invoices  (src/utils/cashFlowForecasting.ts:79)
GET /hr/staff  (src/pages/admin/AdvancedExports.tsx:201)
GET /inventory/orders/X/items  (src/queries/admin.ts:576)
GET /library/marketplace  (src/queries/admin.ts:634)
GET /parents/enrollments  (src/pages/parent/ReportCards.tsx:74)
GET /school-life/early-warnings  (src/pages/admin/EarlyWarnings.tsx:51)
GET /school-life/sponsorships  (src/pages/admin/Sponsorships.tsx:60)
GET /school-life/success-plans  (src/pages/admin/SuccessPlans.tsx:77)
GET /students/X/enrollment  (src/features/parents/services/parentsService.ts:136)
GET /students/X/enrollment  (src/features/students/services/studentsService.ts:93)
GET /students/terms/X  (src/utils/riskAssessment.ts:124)
GET /teachers/X/schedule  (src/hooks/queries/useTeachers.ts:121)
PATCH /communication/video-meetings/X  (src/pages/admin/VideoMeetings.tsx:102)
PATCH /course-discussions/X  (src/components/elearning/CourseDiscussions.tsx:85)
PATCH /course-lessons/X  (src/components/admin/elearning/CourseContent.tsx:54)
PATCH /school-life/appointment-slots/appointments/X  (src/pages/teacher/AppointmentSlots.tsx:116)
PATCH /school-life/check-ins/sessions/${activeSession  (src/pages/teacher/ClassSessionAttendance.tsx:163)
PATCH /school-life/success-plans/X  (src/pages/admin/SuccessPlans.tsx:110)
POST /academic/courses/lessons/quiz  (src/queries/admin.ts:624)
POST /communication/document-signatories  (src/pages/admin/ElectronicSignatures.tsx:106)
POST /communication/electronic-documents  (src/pages/admin/ElectronicSignatures.tsx:85)
POST /communication/video-meetings  (src/pages/admin/VideoMeetings.tsx:73)
POST /parents/transcript/generate  (src/pages/parent/ChildDetail.tsx:200)
POST /school-life/sponsorships  (src/pages/admin/Sponsorships.tsx:118)
POST /school-life/success-plans  (src/pages/admin/SuccessPlans.tsx:86)
POST /students/term-results/bulk  (src/utils/pedagogicalEngine.ts:169)
PUT /hr/mentorship-requests/X  (src/pages/admin/AlumniMentors.tsx:93)
PUT /infrastructure/classrooms/X  (src/queries/classrooms.ts:128)
PUT /parents/appointment-slots/X  (src/pages/parent/Appointments.tsx:128)
PUT /parents/appointment-slots/X  (src/pages/parent/Appointments.tsx:154)
PUT /parents/appointments/X  (src/pages/parent/Appointments.tsx:146)
PUT /school-life/early-warnings/X  (src/pages/admin/EarlyWarnings.tsx:60)
PUT /school-life/sponsorships/X  (src/pages/admin/Sponsorships.tsx:110)

## Méthode absente (chemin existe)
DELETE /schedule [route existe: GET,POST]  (src/components/schedule/ScheduleGenerator.tsx:143)
GET /schedule/terms [route existe: PUT,DELETE]  (src/pages/admin/ExecutiveDashboard.tsx:140)
GET /student-parents [route existe: POST,DELETE]  (src/components/reminders/ReminderSystem.tsx:166)
PATCH /students/X [route existe: GET,PUT,DELETE]  (src/lib/optimisticUpdate.ts:8)
POST /school-life/appointment-slots/bulk [route existe: DELETE]  (src/pages/teacher/AppointmentSlots.tsx:148)
PUT /push-subscriptions/upsert [route existe: POST]  (src/hooks/useNativePushNotifications.ts:97)
