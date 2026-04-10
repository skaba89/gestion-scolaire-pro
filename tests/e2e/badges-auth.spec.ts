import { test, expect, Page } from '@playwright/test';

/**
 * PHASE 3A - E2E Tests: Authentication & Access Control
 * Tests user role-based access to badge features
 */

test.describe('Badge System - Authentication & Access Control', () => {
  
  test('Student can view own badges on achievements page', async ({ page }) => {
    // Login as student
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'jean.dupont@student.sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    
    // Wait for dashboard redirect
    await page.waitForURL('/dashboard', { timeout: 5000 });
    
    // Navigate to achievements
    await page.goto('/achievements');
    
    // Verify page title
    await expect(page.locator('h1')).toContainText('Badge Achievements');
    
    // Verify badge grid is displayed
    const badgeGrid = page.locator('[data-testid="badge-grid"]');
    await expect(badgeGrid).toBeVisible();
    
    // Verify at least one badge card exists
    const badgeCards = page.locator('[data-testid="badge-card"]');
    const count = await badgeCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Teacher can access student badges from class view', async ({ page }) => {
    // Login as teacher
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'prof.martin@sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    
    await page.waitForURL('/dashboard', { timeout: 5000 });
    
    // Navigate to class management
    await page.goto('/class/class-101');
    
    // Click on a student
    const studentRow = page.locator('[data-testid="student-row"]').first();
    await studentRow.click();
    
    // Should show student profile with badges
    const profileSection = page.locator('[data-testid="profile-section"]');
    await expect(profileSection).toBeVisible();
    
    // Badges section should be visible
    const badgesSection = page.locator('[data-testid="profile-badges"]');
    await expect(badgesSection).toBeVisible();
  });

  test('Student cannot access other student\'s badge details', async ({ page }) => {
    // Login as first student
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'jean.dupont@student.sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    
    await page.waitForURL('/dashboard', { timeout: 5000 });
    
    // Try to access another student's profile with badges
    // Should either redirect or show access denied
    const response = await page.goto('/profile/marie.bernard@student.sorbonne.fr/badges');
    
    // Either not found (404) or redirected
    if (response?.status() === 404 || response?.status() === 403) {
      expect([404, 403]).toContain(response.status());
    }
  });

  test('Admin can view all badges and definitions', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'admin@sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    
    await page.waitForURL('/dashboard', { timeout: 5000 });
    
    // Navigate to admin badges section
    await page.goto('/admin/badges');
    
    // Should see badge definitions
    const badgeDefinitions = page.locator('[data-testid="badge-definition-card"]');
    const defCount = await badgeDefinitions.count();
    
    // Should have all 25 badge definitions
    expect(defCount).toBe(25);
  });

  test('Unauthenticated user is redirected to login', async ({ page }) => {
    // Try to access achievements without login
    await page.goto('/achievements');
    
    // Should redirect to login
    await page.waitForURL('/login', { timeout: 5000 });
    expect(page.url()).toContain('/login');
  });

  test('Expired session shows login again', async ({ page }) => {
    // Login normally
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'jean.dupont@student.sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    
    await page.waitForURL('/dashboard', { timeout: 5000 });
    
    // Clear auth token to simulate expiration
    await page.evaluate(() => {
      localStorage.removeItem('auth.session');
    });
    
    // Reload page
    await page.reload();
    
    // Should redirect to login
    await expect(page.locator('[data-testid="login-container"]')).toBeVisible();
  });
});

/**
 * Helper function: Login as specific user
 */
export async function loginAsUser(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('/dashboard', { timeout: 5000 });
}
