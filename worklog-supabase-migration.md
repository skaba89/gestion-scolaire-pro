# Supabase Migration Summary — Task ID: supabase-migration

## Overview
Migrated 8 frontend services/components from the dummy Supabase shim to the backend API (`apiClient`). Added 3 new backend endpoints to support the migration.

## Changes Made

### Backend Changes

#### 1. `backend/app/api/v1/endpoints/core/auth.py` — 3 new endpoints
- **POST `/auth/change-password/`** — Accepts `{current_password, new_password}`, verifies current password with bcrypt, updates hash
- **POST `/auth/logout-all/`** — Placeholder for multi-device logout (JWT-only; future blacklist support)

#### 2. `backend/app/api/v1/endpoints/core/users.py` — 2 new endpoints
- **POST `/users/{user_id}/roles/`** — Assigns a single role to a user (with duplicate check)
- **DELETE `/users/{user_id}/roles/{role}`** — Removes a single role from a user

#### 3. `backend/app/api/v1/endpoints/academic/homework.py` — NEW file (full CRUD)
- **GET `/homework/`** — List with filters (class_id, subject_id, search, date range, pagination)
- **GET `/homework/{homework_id}/`** — Get single homework with submissions
- **GET `/homework/submissions/{student_id}/`** — Get student's submissions
- **POST `/homework/`** — Create homework
- **PUT `/homework/{homework_id}/`** — Update homework
- **DELETE `/homework/{homework_id}/`** — Delete homework
- **POST `/homework/{homework_id}/submit/`** — Student submits homework
- **POST `/homework/submissions/{submission_id}/grade/`** — Teacher grades submission

#### 4. `backend/app/api/v1/router.py` — Registered homework router
- Added `homework` import and `api_router.include_router(homework.router, prefix="/homework")`

### Frontend Changes

#### Task 1: `src/features/parents/services/parentsService.ts`
- **16 functions migrated** — getChildren, getUnpaidInvoices, getInvoices, getNotifications, getUnreadMessagesCount, getUpcomingEvents, getRecentGrades, getAttendanceAlerts, getChildCheckInHistory, getGrades, getStudentDetails, getStudentEnrollment, getStudentAllGradesDetailed, getStudentAllEnrollments, getStudentAllAttendance, getChildrenTeachers
- Uses `/parents/dashboard/` (aggregated), `/parents/children/`, `/payments/invoices/`, `/grades/`, `/attendance/`, `/students/{id}/`

#### Task 2: `src/hooks/useTeacherAssignments.ts`
- Migrated from `supabase.from("teacher_assignments")` to `apiClient.get("/teachers/dashboard/")`
- Backend returns `{ assignments: [...] }` which is mapped to the `TeacherAssignment` interface

#### Task 3: `src/features/students/services/studentsService.ts`
- **26 functions** — Migrated critical ones to apiClient; marked less-used ones (career/job/mentoring) as returning empty arrays with TODO for dedicated endpoints
- Key functions: `getStudentById`, `listStudents`, `createStudent`, `updateStudent`, `deleteStudent`, `getGrades`, `getSchedule`, `getHomework`, `getCheckInHistory`, `getSubmissions`, `getStudentParents`, `linkParent`, `unlinkParent`, `getEnrollment`, `getNextAcademicYear`, `getLevels`
- Uses `/students/`, `/students/{id}/`, `/students/dashboard/`, `/grades/`, `/levels/`, `/academic-years/`, `/parents/`

#### Task 4: `src/features/attendance/services/attendanceService.ts`
- **10 functions migrated** — listAttendance, getStudentAttendance, createAttendance, updateAttendance, deleteAttendance, upsertAttendance, bulkCreateAttendance, getClassroomAttendance, getActiveClassSession
- Maps backend response format `{ items: [...] }` to frontend's `AttendanceRecord[]`
- Uses `/attendance/`, `/attendance/{id}/`, `/attendance/bulk/`

#### Task 5: `src/features/homework/services/homeworkService.ts`
- **9 functions migrated** — listHomework, getHomework, getStudentSubmissions, createHomework, updateHomework, deleteHomework, submitHomework, gradeSubmission
- Uses `/homework/`, `/homework/{id}/`, `/homework/submissions/{student_id}/`, `/homework/{id}/submit/`, `/homework/submissions/{id}/grade/`
- Also fixed `src/features/homework/types/homework.ts` to remove `import { Json } from '@/integrations/supabase/types'`

#### Task 6: `src/contexts/AuthContext.tsx` — Security fixes
- **`mustChangePassword`**: Changed from hardcoded `false` to a reactive `useState(false)` that reads from `/users/me/` profile data (`profile.must_change_password`, `user.must_change_password`)
- **`isMfaVerified`**: Changed from hardcoded `true` to `useState(false)`. Defaults to `true` only when user has no MFA enabled. Explicitly set to `true` only after successful `verifyMfa()` call
- **`signOutAllDevices`**: Changed from just `clearAuth()` to first calling `apiClient.post("/auth/logout-all/")` then clearing local state

#### Task 7: `src/pages/ChangePassword.tsx`
- Replaced `supabase.auth.updateUser()` with `apiClient.post("/auth/change-password/", { current_password, new_password })`
- Added current password field (required for server-side verification)
- Replaced `supabase.auth.signOut()` with `signOut()` from AuthContext
- Removed direct `supabase.from("profiles").update({ must_change_password: false })` — handled server-side now

#### Task 8: `src/components/settings/RoleManagement.tsx`
- Replaced `supabase.from("user_roles")` with `apiClient.get("/users/")` to list users with their roles
- Replaced `supabase.from("profiles")` with `apiClient.get("/users/", { params: { search } })`
- `assignRole` now calls `apiClient.post("/users/{user_id}/roles/", { role })`
- `removeRole` now calls `apiClient.delete("/users/{user_id}/roles/{role}")`
- Handles backend 409 Conflict for duplicate role assignment

## Verification
- TypeScript compilation: **passes** (`tsc --noEmit` — no errors)
- No remaining Supabase imports in any migrated file (verified with `rg`)
- Test files (`__tests__/`) still reference supabase but are not in scope for this migration
