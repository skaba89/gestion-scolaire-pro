-- =============================================================================
-- SchoolFlow Pro — E2E Test Seed  (v2 — colonnes vérifiées)
-- Idempotent: ON CONFLICT DO NOTHING. UUIDs hex valides uniquement.
-- =============================================================================

SET session_replication_role = 'replica';

-- ─── TENANTS ──────────────────────────────────────────────────────────────────

INSERT INTO tenants (id, name, slug, type, country, currency, timezone, email, is_active, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111',
   'Test School', 'test-school', 'SCHOOL', 'FR', 'EUR', 'Europe/Paris',
   'contact@testschool.local', true, NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222',
   'Sorbonne Test', 'sorbonne', 'UNIVERSITY', 'FR', 'EUR', 'Europe/Paris',
   'contact@sorbonne.fr', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── USERS ────────────────────────────────────────────────────────────────────

INSERT INTO users (id, tenant_id, keycloak_id, email, username, first_name, last_name, is_active, is_verified, created_at, updated_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'admin@test.local', 'admin_test', 'Admin', 'Test', true, true, NOW(), NOW()),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'teacher@test.local', 'teacher_test', 'Jean', 'Dupont', true, true, NOW(), NOW()),

  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'parent@test.local', 'parent_test', 'Marie', 'Dupont', true, true, NOW(), NOW()),

  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'student@test.local', 'student_test', 'Pierre', 'Dupont', true, true, NOW(), NOW()),

  ('ee000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'ee000000-0000-0000-0000-000000000001',
   'admin@sorbonne.fr', 'admin_sorbonne', 'Admin', 'Sorbonne', true, true, NOW(), NOW()),

  ('ee000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'ee000000-0000-0000-0000-000000000002',
   'prof.martin@sorbonne.fr', 'prof_martin', 'Martin', 'Prof', true, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── USER ROLES ───────────────────────────────────────────────────────────────

INSERT INTO user_roles (id, tenant_id, user_id, role, created_at, updated_at)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TENANT_ADMIN', NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'TEACHER',      NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'PARENT',       NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'STUDENT',      NOW(), NOW()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'ee000000-0000-0000-0000-000000000001', 'TENANT_ADMIN', NOW(), NOW()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'ee000000-0000-0000-0000-000000000002', 'TEACHER',      NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ─── ACADEMIC YEARS ───────────────────────────────────────────────────────────

INSERT INTO academic_years (id, tenant_id, name, start_date, end_date, is_current, created_at, updated_at)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111',
   '2025-2026', '2025-09-01', '2026-06-30', true, NOW(), NOW()),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', '22222222-2222-2222-2222-222222222222',
   '2025-2026', '2025-09-01', '2026-06-30', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── LEVELS ───────────────────────────────────────────────────────────────────

INSERT INTO levels (id, tenant_id, name, code, order_index, created_at, updated_at)
VALUES
  ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sixième',   '6EME', 1, NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Cinquième', '5EME', 2, NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Quatrième', '4EME', 3, NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Troisième', '3EME', 4, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── SUBJECTS ─────────────────────────────────────────────────────────────────

INSERT INTO subjects (id, tenant_id, name, code, created_at, updated_at)
VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Mathématiques',      'MATH', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Français',            'FR',   NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Anglais',             'EN',   NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Histoire-Géographie', 'HG',   NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Sciences Physiques',  'SP',   NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'SVT',                 'SVT',  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── CLASSROOMS ───────────────────────────────────────────────────────────────

INSERT INTO classes (id, tenant_id, name, level_id, academic_year_id, capacity, created_at, updated_at)
VALUES
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '6ème A', 'f0000000-0000-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 30, NOW(), NOW()),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '6ème B', 'f0000000-0000-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 28, NOW(), NOW()),
  ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '5ème A', 'f0000000-0000-0000-0000-000000000002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 32, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── TERMS ────────────────────────────────────────────────────────────────────

INSERT INTO terms (id, tenant_id, academic_year_id, name, start_date, end_date, sequence_number, created_at, updated_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Trimestre 1', '2025-09-01', '2025-12-20', 1, NOW(), NOW()),
  ('20000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Trimestre 2', '2026-01-05', '2026-03-28', 2, NOW(), NOW()),
  ('30000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Trimestre 3', '2026-04-07', '2026-06-30', 3, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── STUDENTS ─────────────────────────────────────────────────────────────────

INSERT INTO students (
  id, tenant_id, registration_number, first_name, last_name,
  date_of_birth, gender, address, city, level, class_name, academic_year,
  status, parent_name, parent_phone, parent_email, created_at, updated_at
) VALUES
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'STU-2025-0001', 'Jean', 'Dupont', '2010-05-15', 'MALE',
   '123 Rue de la Paix', 'Paris', 'Sixième', '6ème A', '2025-2026',
   'ACTIVE', 'Marie Dupont', '+33600000001', 'parent@test.local', NOW(), NOW()),

  ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'STU-2025-0002', 'Marie', 'Martin', '2011-03-20', 'FEMALE',
   '456 Avenue des Champs', 'Lyon', 'Sixième', '6ème A', '2025-2026',
   'ACTIVE', 'Paul Martin', '+33600000002', 'paul.martin@example.com', NOW(), NOW()),

  ('d0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'STU-2025-0003', 'Luc', 'Bernard', '2009-11-08', 'MALE',
   '789 Bd Haussmann', 'Marseille', 'Cinquième', '5ème A', '2025-2026',
   'ACTIVE', 'Claire Bernard', '+33600000003', 'claire.bernard@example.com', NOW(), NOW()),

  -- Sorbonne tenant (isolation tests)
  ('d0000000-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222',
   'SOR-2025-0001', 'Sophie', 'Leclerc', '2000-07-14', 'FEMALE',
   '10 Rue Victor Hugo', 'Paris', 'Licence 1', 'L1-INFO', '2025-2026',
   'ACTIVE', 'Henri Leclerc', '+33600000010', 'henri.leclerc@example.com', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── ATTENDANCE SAMPLES ───────────────────────────────────────────────────────

INSERT INTO attendance (id, tenant_id, student_id, date, status, subject_id, classroom_id, created_at, updated_at)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
   'd0000000-0000-0000-0000-000000000001', CURRENT_DATE - 1, 'PRESENT',
   'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
   'd0000000-0000-0000-0000-000000000001', CURRENT_DATE - 2, 'ABSENT',
   'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
   'd0000000-0000-0000-0000-000000000002', CURRENT_DATE - 1, 'PRESENT',
   'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', NOW(), NOW())
ON CONFLICT DO NOTHING;

SET session_replication_role = 'origin';

-- ─── Summary ──────────────────────────────────────────────────────────────────
SELECT 'tenants'      AS tbl, COUNT(*) FROM tenants
UNION ALL SELECT 'users',        COUNT(*) FROM users
UNION ALL SELECT 'user_roles',   COUNT(*) FROM user_roles
UNION ALL SELECT 'academic_years', COUNT(*) FROM academic_years
UNION ALL SELECT 'levels',       COUNT(*) FROM levels
UNION ALL SELECT 'subjects',     COUNT(*) FROM subjects
UNION ALL SELECT 'classes',      COUNT(*) FROM classes
UNION ALL SELECT 'terms',        COUNT(*) FROM terms
UNION ALL SELECT 'students',     COUNT(*) FROM students
UNION ALL SELECT 'attendance',   COUNT(*) FROM attendance;
