# PHASE 3A: E2E Testing Guide

## Overview

Comprehensive end-to-end test suite for SchoolFlow Pro Badge System using Playwright. Tests cover:
- ✅ Authentication & Access Control
- ✅ Badge Display & UI Interactions
- ✅ Security & RLS Enforcement
- ✅ Realtime Notifications
- ✅ Admin Operations
- ✅ Performance & Load

**Test Files Created:**
- `tests/e2e/badges-auth.spec.ts` - 7 tests
- `tests/e2e/badges-display.spec.ts` - 11 tests  
- `tests/e2e/badges-security.spec.ts` - 8 tests
- `tests/e2e/badges-notifications.spec.ts` - 10 tests
- `tests/e2e/global-setup.ts` - Environment setup
- `tests/e2e/global-teardown.ts` - Cleanup

**Total: 36+ comprehensive test cases**

---

## Installation

### 1. Install Playwright

```bash
npm install -D @playwright/test @types/node
```

### 2. Install Browsers

```bash
npx playwright install
```

### 3. Verify Installation

```bash
npx playwright --version
```

---

## Setup & Prerequisites

### Docker Containers Must Be Running

```bash
# Start all services
docker-compose up -d

# Verify containers
docker-compose ps

# Check logs if issues
docker-compose logs -f
```

**Required Services:**
- PostgreSQL (port 5432)
- PostgREST (port 8000)  
- Kong Gateway (port 8000)
- GoTrue Auth (built-in)

### Frontend Development Server

```bash
# Terminal 1: Start Vite dev server
npm run dev

# Should be running on http://localhost:3000
```

### Test Data

Database should be pre-seeded with:
- ✅ Sorbonne tenant
- ✅ UNAL tenant
- ✅ Test users (teacher, student, admin, parent)
- ✅ 25 badge definitions
- ✅ Sample badge awards

---

## Running Tests

### Run All Tests

```bash
# All tests
npx playwright test

# Expected: 36+ tests passing
# Time: ~3-5 minutes
```

### Run Specific Test File

```bash
# Authentication tests only
npx playwright test tests/e2e/badges-auth.spec.ts

# Display tests
npx playwright test tests/e2e/badges-display.spec.ts

# Security tests
npx playwright test tests/e2e/badges-security.spec.ts

# Notification tests
npx playwright test tests/e2e/badges-notifications.spec.ts
```

### Run Specific Test

```bash
# Run one test by name
npx playwright test -g "Student can view own badges"

# Run tests matching pattern
npx playwright test -g "Authentication"
```

### Run by Browser

```bash
# Chromium only
npx playwright test --project=chromium

# Firefox only
npx playwright test --project=firefox

# Safari/WebKit only
npx playwright test --project=webkit

# Mobile Chrome
npx playwright test --project=mobile-chrome

# Mobile Safari
npx playwright test --project=mobile-safari
```

### Debug Mode

```bash
# Interactive debug mode (step through code)
npx playwright test --debug

# Headed mode (see browser)
npx playwright test --headed

# Slow motion (1 second per action)
npx playwright test --slow-mo=1000

# Combine: headed + debug
npx playwright test --headed --debug
```

### Generate & View Report

```bash
# Run tests and generate HTML report
npx playwright test

# View report
npx playwright show-report

# Opens at: http://localhost:9322 (or similar)
```

---

## Test Organization

### Test Structure

Each test file follows this pattern:

```typescript
test.describe('Feature - Section', () => {
  
  test.beforeEach(async ({ page }) => {
    // Setup before each test
    await loginAsUser(page);
  });
  
  test('Test case description', async ({ page }) => {
    // Arrange
    await page.goto('/path');
    
    // Act
    await page.click('[data-testid="button"]');
    
    // Assert
    await expect(page.locator('[data-testid="result"]')).toBeVisible();
  });
});
```

### Test Selectors

All tests use `data-testid` attributes for reliability:

```typescript
// Login
[data-testid="email-input"]
[data-testid="password-input"]
[data-testid="login-button"]

// Badges
[data-testid="badge-card"]
[data-testid="badge-grid"]
[data-testid="badge-display"]
[data-testid="badge-name"]

// Navigation
[data-testid="achievements-page"]
[data-testid="leaderboard"]
[data-testid="dashboard"]
```

---

## Test Categories

### 1. Authentication Tests (badges-auth.spec.ts)

✅ Student can view own badges  
✅ Teacher can access student badges  
✅ Student cannot access other student badges  
✅ Admin can view all badges  
✅ Unauthenticated user redirected to login  
✅ Expired session shows login again  

**Expected Result:** 7/7 passing

### 2. Display & UI Tests (badges-display.spec.ts)

✅ Achievement page loads with hero and stats  
✅ Badge grid displays responsive layout  
✅ Filter by badge type  
✅ Sort by date (newest first)  
✅ Sort by rarity (legendary to common)  
✅ Badge card shows all information  
✅ New badge indicator visible  
✅ Locked badges show on Next Badges tab  
✅ Locked badge shows unlock requirements  
✅ Type breakdown shows all 5 types  
✅ Share button opens menu  
✅ Mobile view shows single column  

**Expected Result:** 12/12 passing

### 3. Security & RLS Tests (badges-security.spec.ts)

✅ Student cannot access other tenant badges via API  
✅ Student cannot modify badges outside tenant  
✅ Teacher cannot see badges from other schools  
✅ RLS blocks unauthorized leaderboard access  
✅ Admin can only view badges from their tenant  
✅ Cross-tenant badge award attempt fails  
✅ Parent cannot view other student badges  
✅ RLS enforces tenant_id in JWT claims  

**Expected Result:** 8/8 passing

### 4. Notification Tests (badges-notifications.spec.ts)

✅ Notification displays when badge awarded  
✅ Notification auto-dismisses after 8 seconds  
✅ Dismiss button removes notification  
✅ Share badge from notification  
✅ Multiple notifications queue properly  
✅ Notification shows correct badge icon  
✅ Progress bar countdown visible  
✅ Notification persists on hover  
✅ Offline/resync handling  
✅ Keyboard accessibility  

**Expected Result:** 10/10 passing

---

## Test Results & Reports

### Console Output

Tests print real-time progress:

```
✓ badges-auth.spec.ts (7 tests)
✓ badges-display.spec.ts (12 tests)
✓ badges-security.spec.ts (8 tests)
✓ badges-notifications.spec.ts (10 tests)

Passed: 37 tests
Failed: 0 tests
Time: 4m 23s
```

### HTML Report

Generated in `playwright-report/index.html`

Features:
- Test results with status (pass/fail)
- Screenshots on failure
- Video recordings of failed tests
- Timeline of actions
- Browser console logs

### CI Integration

For GitHub Actions:

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        # ... service config

    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - run: npm ci
      - run: npx playwright install --with-deps
      
      - run: npm run dev &
      - run: npx playwright test
      
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Debugging Failed Tests

### 1. Run in Headed Mode

```bash
# See the browser while test runs
npx playwright test --headed --project=chromium
```

### 2. Use Slow Motion

```bash
# Slow down each action by 2 seconds
npx playwright test --slow-mo=2000
```

### 3. Debug Single Test

```bash
# Stop at each step, inspect state
npx playwright test -g "Student can view" --debug
```

**Debug UI Controls:**
- Step over (next action)
- Step into
- Step out
- Continue
- Pause/Resume

### 4. Check Screenshots

```bash
# After test failure, screenshot saved to:
# playwright-report/[testname].png
```

### 5. Common Issues

#### Issue: "Browser timeout"
```bash
# Increase timeout
TEST_TIMEOUT=60000 npx playwright test
```

#### Issue: "Test data not found"
```bash
# Seed database first
npm run db:seed

# Then run tests
npx playwright test
```

#### Issue: "Element not found"
- Check `data-testid` attribute exists in component
- Verify page actually loads to that element
- Wait longer with `waitForTimeout()`
- Use `waitFor({ state: 'visible' })`

#### Issue: "Cross-browser failures"
- Tests may behave differently in Firefox/Safari
- Check browser-specific issues in test results
- Some APIs (like `navigator.share`) only work in certain browsers

---

## Performance Benchmarks

Expected test execution times:

```
badges-auth.spec.ts:          ~45 seconds
badges-display.spec.ts:       ~60 seconds
badges-security.spec.ts:      ~55 seconds
badges-notifications.spec.ts: ~65 seconds

TOTAL:                        ~4-5 minutes
```

### Performance Tips

1. **Parallel Execution** (default)
   - 4 workers = faster
   - Set `workers: 1` for CI stability

2. **Reduce Timeouts** in CI
   ```bash
   CI=true npx playwright test  # 2 retries
   ```

3. **Run Specific Tests**
   ```bash
   npx playwright test tests/e2e/badges-auth.spec.ts  # Just auth
   ```

---

## Component Testing Checklist

Before running E2E tests, verify components have `data-testid`:

### Pages
- [ ] `/achievements` - All selectors
- [ ] `/admin/badges` - All admin selectors
- [ ] `/class/:id` - Student rows
- [ ] `/profile` - Badge section

### Components
- [ ] `BadgeCard` - Badge display selectors
- [ ] `BadgeGrid` - Grid & filter selectors
- [ ] `BadgeNotification` - Notification selectors
- [ ] `ClassBadgeLeaderboard` - Leaderboard selectors

### Forms
- [ ] Award badge form
- [ ] Filter form
- [ ] Sort select

---

## Advanced Testing

### Mock Data Fixtures

Create test data fixtures for consistency:

```typescript
// tests/e2e/fixtures/badge-data.ts
export const testBadges = [
  {
    id: 'badge-excellence',
    name: 'Excellence',
    type: 'PERFORMANCE',
    rarity: 'EPIC'
  },
  // ... more badges
];

export const testUsers = [
  {
    email: 'jean.dupont@student.sorbonne.fr',
    password: 'test_password_123',
    role: 'STUDENT'
  },
  // ... more users
];
```

### Database Seeding

```typescript
// tests/e2e/helpers/db.ts
export async function seedTestData() {
  // Insert test data into database
  await db.query('INSERT INTO badges_definitions...');
}

export async function cleanupTestData() {
  // Remove test data
  await db.query('DELETE FROM badges_definitions...');
}
```

### API Mocking

Mock API responses if needed:

```typescript
test('Badge award with network error', async ({ page }) => {
  // Intercept and mock API response
  await page.route('**/api/badges/award', route => {
    route.abort('failed');
  });
  
  // Test error handling
  await page.goto('/admin/badges');
  await page.click('[data-testid="award-btn"]');
  
  // Should show error message
  await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
});
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'npm'
      
      - run: npm ci
      
      - run: npx playwright install --with-deps
      
      - run: docker-compose up -d
        env:
          CI: true
      
      - run: npm run build
      
      - run: npm run dev &
      
      - run: npx playwright test
        env:
          CI: true
      
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

---

## Success Criteria

✅ **PHASE 3A COMPLETE when:**

1. All 36+ tests pass locally
2. All 36+ tests pass in CI/CD
3. No flaky tests (consistent pass rate)
4. HTML report generated successfully
5. Screenshots/videos captured for failures
6. Performance benchmarks met (<5 min total)
7. Security tests all passing
8. RLS enforcement verified
9. Realtime notifications working
10. Cross-browser tests passing

---

## Next Steps

After PHASE 3A E2E Testing:

➡️ **PHASE 3b: Load Testing** - 1000+ badges, 100+ concurrent users
➡️ **PHASE 3c: Mobile Testing** - iOS/Android Capacitor
➡️ **PHASE 3d: Security Audit** - Penetration testing
➡️ **PHASE 3e: Deployment** - Production setup

---

## Support

### Documentation
- [Playwright Docs](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [API Reference](https://playwright.dev/docs/api/class-test)

### Commands Reference
```bash
# List all test
npx playwright test --list

# Run tests matching pattern
npx playwright test -g "pattern"

# Run specific file
npx playwright test path/to/file.spec.ts

# Debug mode
npx playwright test --debug

# Headed mode
npx playwright test --headed

# Slow motion
npx playwright test --slow-mo=1000

# Generate report
npx playwright show-report

# Update screenshots
npx playwright test --update-snapshots

# Clear cache
rm -rf .playwright
```

---

**PHASE 3A: E2E Testing Guide Complete** ✅

Created: January 26, 2026  
Test Count: 36+ comprehensive tests  
Estimated Runtime: 4-5 minutes  
Status: Ready for execution
