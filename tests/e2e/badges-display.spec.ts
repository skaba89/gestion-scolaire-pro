import { test, expect } from '@playwright/test';

/**
 * PHASE 3A - E2E Tests: Badge Display & UI Interactions
 * Tests badge grid, filtering, sorting, and card interactions
 */

test.describe('Badge System - Display & UI', () => {

  test.beforeEach(async ({ page }) => {
    // Login as student before each test
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'jean.dupont@student.sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    await page.goto('/achievements');
  });

  test('Achievement page loads with hero section and stats', async ({ page }) => {
    // Check hero section
    const hero = page.locator('[data-testid="achievements-hero"]');
    await expect(hero).toBeVisible();
    
    // Check statistics cards
    const totalStat = page.locator('[data-testid="stat-total-badges"]');
    const completionStat = page.locator('[data-testid="stat-completion"]');
    const rariestStat = page.locator('[data-testid="stat-rarest"]');
    
    await expect(totalStat).toBeVisible();
    await expect(completionStat).toBeVisible();
    await expect(rariestStat).toBeVisible();
  });

  test('Badge grid displays with correct responsive layout', async ({ page }) => {
    const grid = page.locator('[data-testid="badge-grid"]');
    await expect(grid).toBeVisible();
    
    // Get computed style to verify grid structure
    const gridStyle = await grid.evaluate(el => 
      window.getComputedStyle(el).gridTemplateColumns
    );
    
    // Should be 4-column layout on desktop
    expect(gridStyle).toMatch(/repeat\(4/);
  });

  test('Filter by badge type works correctly', async ({ page }) => {
    // Get initial badge count
    let badges = page.locator('[data-testid="badge-card"]');
    const initialCount = await badges.count();
    
    // Click performance filter
    await page.click('[data-testid="filter-performance"]');
    
    // Wait for animation
    await page.waitForTimeout(300);
    
    // Get filtered badges
    badges = page.locator('[data-testid="badge-card"]');
    const filteredCount = await badges.count();
    
    // Should have fewer badges
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    
    // Verify all filtered badges are performance type
    const badgeTypes = await badges.evaluateAll(els =>
      els.map(el => el.getAttribute('data-badge-type'))
    );
    
    badgeTypes.forEach(type => {
      expect(type).toBe('PERFORMANCE');
    });
  });

  test('Sort by date (newest first) works', async ({ page }) => {
    // Select date sort
    await page.selectOption('[data-testid="sort-select"]', 'date-newest');
    
    // Wait for sort animation
    await page.waitForTimeout(300);
    
    // Get earned dates
    const badges = page.locator('[data-testid="badge-card"]');
    const dates = await badges.evaluateAll(els =>
      els.map(el => {
        const dateStr = el.getAttribute('data-earned-date');
        return dateStr ? new Date(dateStr).getTime() : 0;
      })
    );
    
    // Verify dates are in descending order (newest first)
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }
  });

  test('Sort by rarity works (legendary to common)', async ({ page }) => {
    // Select rarity sort
    await page.selectOption('[data-testid="sort-select"]', 'rarity');
    
    await page.waitForTimeout(300);
    
    // Get rarities
    const badges = page.locator('[data-testid="badge-card"]');
    const rarities = await badges.evaluateAll(els =>
      els.map(el => el.getAttribute('data-rarity'))
    );
    
    // Map to numeric values for comparison
    const rarityValues: Record<string, number> = {
      'LEGENDARY': 5,
      'EPIC': 4,
      'RARE': 3,
      'UNCOMMON': 2,
      'COMMON': 1
    };
    
    // Verify descending rarity order
    for (let i = 0; i < rarities.length - 1; i++) {
      const current = rarityValues[rarities[i] || ''];
      const next = rarityValues[rarities[i + 1] || ''];
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  test('Badge card displays all information', async ({ page }) => {
    const firstBadge = page.locator('[data-testid="badge-card"]').first();
    
    // Check badge display (SVG)
    const badgeDisplay = firstBadge.locator('[data-testid="badge-display"]');
    await expect(badgeDisplay).toBeVisible();
    
    // Check name
    const name = firstBadge.locator('[data-testid="badge-name"]');
    await expect(name).toBeVisible();
    const nameText = await name.textContent();
    expect(nameText).toBeTruthy();
    
    // Check description
    const description = firstBadge.locator('[data-testid="badge-description"]');
    await expect(description).toBeVisible();
    
    // Check rarity badge
    const rarityBadge = firstBadge.locator('[data-testid="rarity-badge"]');
    await expect(rarityBadge).toBeVisible();
    
    // Check earned date
    const earnedDate = firstBadge.locator('[data-testid="earned-date"]');
    await expect(earnedDate).toBeVisible();
  });

  test('Badge card shows NEW indicator for recent badges', async ({ page }) => {
    // Find a badge with NEW indicator (earned within 7 days)
    const newBadges = page.locator('[data-testid="badge-card"][data-is-new="true"]');
    
    // If there are new badges, verify indicator
    const newCount = await newBadges.count();
    if (newCount > 0) {
      const indicator = newBadges.first().locator('[data-testid="new-indicator"]');
      await expect(indicator).toBeVisible();
      await expect(indicator).toContainText('NEW!');
    }
  });

  test('Locked badges show on Next Badges tab', async ({ page }) => {
    // Click Next Badges tab
    await page.click('[data-testid="tab-next-badges"]');
    
    // Wait for content to load
    await page.waitForTimeout(300);
    
    // Find locked badges
    const lockedBadges = page.locator('[data-testid="badge-card-locked"]');
    const lockedCount = await lockedBadges.count();
    
    // Should have some locked badges
    expect(lockedCount).toBeGreaterThan(0);
    
    // Locked badges should have grayscale effect
    const firstLocked = lockedBadges.first();
    const opacity = await firstLocked.evaluate(el =>
      window.getComputedStyle(el).opacity
    );
    expect(parseFloat(opacity)).toBeLessThan(1);
  });

  test('Locked badge shows unlock requirements', async ({ page }) => {
    // Go to Next Badges tab
    await page.click('[data-testid="tab-next-badges"]');
    await page.waitForTimeout(300);
    
    // Get first locked badge
    const lockedBadge = page.locator('[data-testid="badge-card-locked"]').first();
    
    // Should show hint/requirements
    const hint = lockedBadge.locator('[data-testid="locked-hint"]');
    await expect(hint).toBeVisible();
    
    // Hint should contain requirement text
    const hintText = await hint.textContent();
    expect(hintText).toMatch(/earn|get|achieve|complete/i);
  });

  test('Badge type breakdown shows all 5 types', async ({ page }) => {
    // Check type breakdown section
    const breakdown = page.locator('[data-testid="type-breakdown"]');
    await expect(breakdown).toBeVisible();
    
    // Should show 5 type cards
    const typeCards = breakdown.locator('[data-testid="type-card"]');
    expect(await typeCards.count()).toBe(5);
    
    // Check each type
    const expectedTypes = ['PERFORMANCE', 'ACHIEVEMENT', 'ATTENDANCE', 'PARTICIPATION', 'CERTIFICATION'];
    for (const type of expectedTypes) {
      await expect(breakdown.locator(`[data-badge-type="${type}"]`)).toBeVisible();
    }
  });

  test('Share button opens share menu', async ({ page }) => {
    const firstBadge = page.locator('[data-testid="badge-card"]').first();
    const shareBtn = firstBadge.locator('[data-testid="share-btn"]');
    
    // Click share button
    await shareBtn.click();
    
    // Share menu should appear
    const shareMenu = page.locator('[data-testid="share-menu"]');
    await expect(shareMenu).toBeVisible();
    
    // Should have share options
    const shareOptions = shareMenu.locator('[data-testid="share-option"]');
    expect(await shareOptions.count()).toBeGreaterThan(0);
  });

  test('Copy link share option works', async ({ page }) => {
    const firstBadge = page.locator('[data-testid="badge-card"]').first();
    await firstBadge.locator('[data-testid="share-btn"]').click();
    
    // Click copy link option
    await page.click('[data-testid="share-option-copy"]');
    
    // Should show confirmation
    const confirmation = page.locator('[data-testid="copy-confirmation"]');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(/copied|success/i);
  });

  test('Mobile view shows single column', async ({ browser }) => {
    // Create mobile viewport
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 }
    });
    
    const page = await context.newPage();
    
    // Login and navigate
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'jean.dupont@student.sorbonne.fr');
    await page.fill('[data-testid="password-input"]', 'test_password_123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    await page.goto('/achievements');
    
    // Check grid is single column
    const grid = page.locator('[data-testid="badge-grid"]');
    const gridStyle = await grid.evaluate(el =>
      window.getComputedStyle(el).gridTemplateColumns
    );
    
    // Mobile should be 1 column
    expect(gridStyle).toMatch(/repeat\(1/);
    
    await context.close();
  });
});
