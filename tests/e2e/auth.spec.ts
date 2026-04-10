import { test, expect } from '../fixtures/auth';

/**
 * Tests d'authentification
 * 
 * Couvre:
 * - Connexion avec identifiants valides
 * - Refus avec identifiants invalides
 * - Déconnexion
 * - Redirection vers login si pas authentifié
 */

test.describe('Authentification', () => {
  test('devrait afficher la page de connexion', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Vérifier la présence des éléments de connexion
    await expect(page.locator('text=Se connecter')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('devrait connecter avec des identifiants valides', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Remplir le formulaire
    await page.fill('input[name="email"]', 'admin@test.local');
    await page.fill('input[name="password"]', 'Password123!');
    
    // Soumettre
    await page.click('button:has-text("Se connecter")');
    
    // Attendre la redirection
    await page.waitForURL('**/admin/dashboard');
    
    // Vérifier que nous sommes connectés
    await expect(page.locator('text=Tableau de Bord')).toBeVisible();
  });

  test('devrait rejeter les identifiants invalides', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Essayer de se connecter avec un mot de passe incorrect
    await page.fill('input[name="email"]', 'admin@test.local');
    await page.fill('input[name="password"]', 'WrongPassword123!');
    await page.click('button:has-text("Se connecter")');
    
    // Attendre le message d'erreur
    const errorMsg = page.locator('text=/Identifiants invalides|Email ou mot de passe incorrect/');
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
    
    // Rester sur la page de login
    expect(page.url()).toContain('/auth/login');
  });

  test('devrait rediriger vers login si pas authentifié', async ({ page }) => {
    // Essayer d'accéder au dashboard sans être connecté
    await page.goto('/admin/dashboard');
    
    // Devrait être redirigé vers login
    await page.waitForURL('**/auth/login');
    expect(page.url()).toContain('/auth/login');
  });

  test('devrait déconnecter l\'utilisateur', async ({ authenticatedPage }) => {
    // On est dans authenticatedPage (déjà connecté)
    await expect(authenticatedPage.locator('text=Tableau de Bord')).toBeVisible();
    
    // Cliquer sur le bouton de déconnexion
    // (chemin dépend de votre UI)
    await authenticatedPage.click('[data-testid="user-menu"]');
    await authenticatedPage.click('text=Déconnexion');
    
    // Attendre la redirection vers login
    await authenticatedPage.waitForURL('**/auth/login');
    expect(authenticatedPage.url()).toContain('/auth/login');
  });

  test('devrait afficher une erreur après 5 tentatives échouées', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Faire 5 tentatives échouées
    for (let i = 0; i < 5; i++) {
      await page.fill('input[name="email"]', 'admin@test.local');
      await page.fill('input[name="password"]', 'WrongPassword123!');
      await page.click('button:has-text("Se connecter")');
      
      // Attendre le message d'erreur
      await page.waitForTimeout(1000);
    }
    
    // Vérifier le message de compte verrouillé
    const lockedMsg = page.locator('text=/Compte temporairement verrouillé|Trop de tentatives/');
    await expect(lockedMsg).toBeVisible({ timeout: 5000 });
  });

  test('devrait permettre l\'inscription d\'un nouvel utilisateur', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Cliquer sur le lien d'inscription
    await page.click('text=Pas encore de compte');
    
    // Remplir le formulaire d'inscription
    const uniqueEmail = `test-${Date.now()}@example.com`;
    await page.fill('input[name="email"]', uniqueEmail);
    await page.fill('input[name="password"]', 'Password123!');
    await page.fill('input[name="first_name"]', 'Jean');
    await page.fill('input[name="last_name"]', 'Dupont');
    
    // Soumettre
    await page.click('button:has-text("S\'inscrire")');
    
    // Attendre la confirmation
    await expect(page.locator('text=/Email de confirmation|Vérifiez votre email/i')).toBeVisible();
  });

  test('devrait permettre la réinitialisation du mot de passe', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Cliquer sur "Mot de passe oublié"
    await page.click('text=Mot de passe oublié');
    
    // Entrer l'email
    await page.fill('input[name="email"]', 'admin@test.local');
    await page.click('button:has-text("Réinitialiser")');
    
    // Vérifier le message de confirmation
    await expect(page.locator('text=/Email envoyé|Vérifiez votre boîte mail/i')).toBeVisible();
  });

  test('différentes routes devraient rediriger selon le rôle', async ({ page, loginAs }) => {
    // Se connecter comme enseignant
    await loginAs(page, 'teacher@test.local', 'Password123!');
    
    // Essayer d'accéder au dashboard admin
    await page.goto('/admin/dashboard');
    
    // Devrait être redirigé vers le tableau de bord enseignant
    await page.waitForURL('**/teacher/**');
    expect(page.url()).toContain('/teacher/');
  });
});
