# Appels frontend sans route backend — lot planning atomique, 2026-11-07

Base : `07530de094dafa782b99b3bd614c9d5b55d6bca0` (`main` après #420).
Mesures du code proposé : **657 opérations**, 983 appels, 21 URL dynamiques
non vérifiables, **37 occurrences = 35 clés distinctes** sans opération
(36 sur `main`, 37 dans l'ancienne référence CI). Le double appel destructif
`DELETE` puis `POST /schedule/` est remplacé par un contrat atomique réel ;
aucune fonction utilisateur n'a été retirée. Voir
`SCHEDULE_ATOMIC_REPLACE_20261107.md`. L'analyse statique ne valide ni les
corps, ni les réponses, ni les permissions.

## Chemin absent
DELETE /course-discussions/X  (src/components/elearning/CourseDiscussions.tsx:96)
DELETE /inventory/orders/X  (src/queries/admin.ts:597)
DELETE /school-life/sponsorships/X  (src/pages/admin/Sponsorships.tsx:141)
GET /analytics/cash-flow-forecasts  (src/pages/admin/ExecutiveDashboard.tsx:167)
GET /communication/electronic-documents  (src/pages/admin/ElectronicSignatures.tsx:71)
GET /communication/video-meetings  (src/pages/admin/VideoMeetings.tsx:62)
GET /finance/invoices  (src/utils/cashFlowForecasting.ts:39)
GET /finance/invoices  (src/utils/cashFlowForecasting.ts:79)
GET /hr/staff  (src/pages/admin/AdvancedExports.tsx:201)
GET /inventory/orders/X/items  (src/queries/admin.ts:576)
GET /library/marketplace  (src/queries/admin.ts:634)
GET /school-life/early-warnings  (src/pages/admin/EarlyWarnings.tsx:51)
GET /school-life/sponsorships  (src/pages/admin/Sponsorships.tsx:60)
GET /school-life/success-plans  (src/pages/admin/SuccessPlans.tsx:77)
GET /students/terms/X  (src/utils/riskAssessment.ts:124)
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
POST /school-life/sponsorships  (src/pages/admin/Sponsorships.tsx:118)
POST /school-life/success-plans  (src/pages/admin/SuccessPlans.tsx:86)
POST /students/term-results/bulk  (src/utils/pedagogicalEngine.ts:169)
PUT /hr/mentorship-requests/X  (src/pages/admin/AlumniMentors.tsx:93)
PUT /parents/appointment-slots/X  (src/pages/parent/Appointments.tsx:128)
PUT /parents/appointment-slots/X  (src/pages/parent/Appointments.tsx:154)
PUT /parents/appointments/X  (src/pages/parent/Appointments.tsx:146)
PUT /school-life/early-warnings/X  (src/pages/admin/EarlyWarnings.tsx:60)
PUT /school-life/sponsorships/X  (src/pages/admin/Sponsorships.tsx:110)

## Méthode absente (chemin existe)
GET /schedule/terms [route existe: PUT,DELETE]  (src/pages/admin/ExecutiveDashboard.tsx:140)
PATCH /students/X [route existe: GET,PUT,DELETE]  (src/lib/optimisticUpdate.ts:8)
POST /school-life/appointment-slots/bulk [route existe: DELETE]  (src/pages/teacher/AppointmentSlots.tsx:148)
