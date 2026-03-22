import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Fixture pour l'authentification
 * 
 * Permet de tester les fonctionnalités sans avoir à se reconnecter à chaque fois
 */

type AuthFixture = {
  authenticatedPage: Page;
  loginAs: (page: Page, email: string, password: string) => Promise<void>;
  loginAsAdmin: (page: Page) => Promise<void>;
  loginAsTeacher: (page: Page) => Promise<void>;
  loginAsParent: (page: Page) => Promise<void>;
  loginAsStudent: (page: Page) => Promise<void>;
};

export const test = base.extend<AuthFixture>({
  authenticatedPage: async ({ page }, use) => {
    // Se connecter avant chaque test
    await page.goto('/auth/login');
    
    // Utiliser les identifiants de test
    await page.fill('input[name="email"]', 'admin@test.local');
    await page.fill('input[name="password"]', 'Password123!');
    
    await page.click('button:has-text("Se connecter")');
    
    // Attendre la redirection vers le dashboard
    await page.waitForURL('**/admin/dashboard');
    
    await use(page);
  },

  loginAs: async ({ page }, use) => {
    const login = async (email: string, password: string) => {
      await page.goto('/auth/login');
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button:has-text("Se connecter")');
      
      // Attendre que la connexion soit complète
      await page.waitForLoadState('networkidle');
    };
    
    await use(login);
  },

  loginAsAdmin: async ({ loginAs }, use) => {
    const loginAdmin = async (page: Page) => {
      await loginAs(page, 'admin@test.local', 'Password123!');
      await page.waitForURL('**/admin/dashboard');
    };
    
    await use(loginAdmin);
  },

  loginAsTeacher: async ({ loginAs }, use) => {
    const loginTeacher = async (page: Page) => {
      await loginAs(page, 'teacher@test.local', 'Password123!');
      await page.waitForURL('**/teacher/dashboard');
    };
    
    await use(loginTeacher);
  },

  loginAsParent: async ({ loginAs }, use) => {
    const loginParent = async (page: Page) => {
      await loginAs(page, 'parent@test.local', 'Password123!');
      await page.waitForURL('**/parent/dashboard');
    };
    
    await use(loginParent);
  },

  loginAsStudent: async ({ loginAs }, use) => {
    const loginStudent = async (page: Page) => {
      await loginAs(page, 'student@test.local', 'Password123!');
      await page.waitForURL('**/student/dashboard');
    };
    
    await use(loginStudent);
  },
});

export { expect } from '@playwright/test';
