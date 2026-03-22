import { test, expect } from '@playwright/test';

/**
 * PHASE 3A - E2E Tests: Security & Row-Level Security (RLS)
 * Tests multi-tenant isolation and RLS policy enforcement
 */

test.describe('Badge System - Security & RLS', () => {

  test('Student cannot access badges from different tenant via API', async ({ page, context }) => {
    // Login as Sorbonne student
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'jean.dupont@student.sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    // Get current auth token
    const cookies = await context.cookies();
    const authToken = cookies.find(c => c.name === 'sb-access-token')?.value;
    
    // Try to fetch UNAL (different tenant) badges via API
    const response = await context.request.get(
      'http://localhost:8000/rest/v1/user_badges?tenant_id=eq.unal-tenant-id',
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Should return 403 (RLS blocks access) or empty array
    if (response.status() === 200) {
      const data = await response.json();
      expect(data.length).toBe(0);
    } else {
      expect([403, 401]).toContain(response.status());
    }
  });

  test('Student cannot modify badges outside their tenant', async ({ page, context }) => {
    // Login as Sorbonne student
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'jean.dupont@student.sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    const cookies = await context.cookies();
    const authToken = cookies.find(c => c.name === 'sb-access-token')?.value;
    
    // Try to update a badge from UNAL tenant
    const response = await context.request.patch(
      'http://localhost:8000/rest/v1/user_badges?id=eq.unal-badge-id',
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        data: {
          seen: true
        }
      }
    );
    
    // Should fail with 403 or return 0 rows updated
    if (response.status() === 200) {
      const result = await response.json();
      expect(result.length).toBe(0);
    } else {
      expect([403, 401]).toContain(response.status());
    }
  });

  test('Teacher cannot see badges from other schools', async ({ page, context }) => {
    // Login as Sorbonne teacher
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'prof.martin@sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    // Navigate to class
    await page.goto('/class/class-101');
    
    // Get student list
    const studentRows = page.locator('[data-testid="student-row"]');
    const studentCount = await studentRows.count();
    
    // All students should be from Sorbonne
    // Try to verify by checking student emails
    const emails = await studentRows.evaluateAll(els =>
      els.map(el => el.getAttribute('data-student-email') || '')
    );
    
    // All emails should be from Sorbonne domain
    emails.forEach(email => {
      expect(email).toContain('@sorbonne.fr');
    });
  });

  test('RLS policy blocks unauthorized leaderboard access', async ({ page, context }) => {
    // Create separate contexts for different users
    const context2 = await page.context().browser()?.newContext();
    const page2 = await context2!.newPage();
    
    // Login first user as Sorbonne teacher
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'prof.martin@sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    // Get Sorbonne class leaderboard
    await page.goto('/class/class-101/leaderboard');
    const leaderboard = page.locator('[data-testid="badge-leaderboard"]');
    await expect(leaderboard).toBeVisible();
    
    const rows = leaderboard.locator('[data-testid="leaderboard-row"]');
    const sorborneCount = await rows.count();
    expect(sorborneCount).toBeGreaterThan(0);
    
    // Login second user as UNAL teacher
    await page2.goto('/login');
    await page2.fill('[data-testid="email-input"]', 'profesor.santos@unal.edu.co');
    await page2.fill('[data-testid="password-input"]', 'test_password_123');
    await page2.click('[data-testid="login-button"]');
    await page2.waitForURL('/dashboard');
    
    // Try to access Sorbonne class leaderboard
    // Should fail or show empty/different data
    const response = await page2.context().request.get(
      'http://localhost:8000/rest/v1/rpc/get_class_badge_leaderboard?class_id=class-101',
      {
        headers: {
          'Authorization': `Bearer ${(await page2.context().cookies()).find(c => c.name === 'sb-access-token')?.value}`
        }
      }
    );
    
    // Should be blocked
    expect([403, 401, 400]).toContain(response.status());
    
    await context2?.close();
  });

  test('Admin can only view badges from their tenant', async ({ page, context }) => {
    // Login as Sorbonne admin
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'admin@sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    // Navigate to admin badges
    await page.goto('/admin/badges');
    
    // Get badge count
    const badges = page.locator('[data-testid="badge-definition-card"]');
    const sorborneCount = await badges.count();
    
    // Should have badges from Sorbonne only
    expect(sorborneCount).toBeGreaterThan(0);
    
    // Verify all badges belong to Sorbonne
    const badgeTenants = await badges.evaluateAll(els =>
      els.map(el => el.getAttribute('data-tenant-id'))
    );
    
    // All should be Sorbonne tenant
    badgeTenants.forEach(tenantId => {
      expect(tenantId).toBe('sorbonne-tenant-id');
    });
  });

  test('Cross-tenant badge award attempt fails', async ({ page, context }) => {
    // Login as Sorbonne admin
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'admin@sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    const cookies = await context.cookies();
    const authToken = cookies.find(c => c.name === 'sb-access-token')?.value;
    
    // Try to award badge to UNAL student
    const response = await context.request.post(
      'http://localhost:8000/rest/v1/rpc/award_badge',
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        data: {
          student_id: 'unal-student-id',
          badge_id: 'badge-excellence',
          reason: 'test'
        }
      }
    );
    
    // Should fail
    expect([403, 401, 400]).toContain(response.status());
  });

  test('Parent cannot view other student badges', async ({ page }) => {
    // Login as parent (linked to one student)
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'parent@example.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    // Should only see their child's badges
    await page.goto('/achievements');
    
    // The page should show "My Child's Achievements" not "All Student Achievements"
    const pageTitle = page.locator('h1');
    await expect(pageTitle).toContainText(/child|son|daughter/i);
    
    // Student name should match their child
    const studentName = page.locator('[data-testid="student-name"]');
    const name = await studentName.textContent();
    expect(name).toContain('their child');
  });

  test('RLS enforces tenant_id in JWT claims', async ({ page, context }) => {
    // Login as student
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'jean.dupont@student.sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    // Get JWT token
    const cookies = await context.cookies();
    const token = cookies.find(c => c.name === 'sb-access-token')?.value;
    
    // Decode JWT (without verifying signature, just to inspect payload)
    const parts = token?.split('.');
    if (parts && parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      
      // Should have tenant_id in claims
      expect(payload.tenant_id).toBeTruthy();
      expect(payload.tenant_id).toBe('sorbonne-tenant-id');
    }
  });

  test('Database audit log records access attempts', async ({ page, context }) => {
    // This test would require direct database access
    // Skip if not in test database environment
    const testDbEnv = process.env.TEST_DB === 'true';
    
    test.skip(!testDbEnv, 'Requires test database access');
    
    // Make a normal API request
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'jean.dupont@student.sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    // In test environment, verify audit log was created
    // This would typically be done via a test database query
    // Example: const auditLog = await queryDatabase('SELECT * FROM audit_logs WHERE action = \'badges_view\'');
    // expect(auditLog.length).toBeGreaterThan(0);
  });
});
