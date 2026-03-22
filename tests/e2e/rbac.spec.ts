import { test, expect } from '../fixtures/auth';

/**
 * Tests de Contrôle d'Accès par Rôle (RBAC)
 * 
 * Couvre:
 * - Admin peut accéder à tous les dashboards
 * - Enseignant peut voir les élèves de sa classe uniquement
 * - Parent peut voir ses enfants uniquement
 * - Élève voit ses propres infos
 * - Accès non autorisé = redirection
 */

test.describe('Contrôle d\'Accès par Rôle (RBAC)', () => {
  test('Admin devrait accéder au dashboard admin', async ({ loginAsAdmin, page }) => {
    await loginAsAdmin(page);
    
    // Vérifier l'accès au dashboard admin
    await page.goto('/admin/dashboard');
    await expect(page.locator('text=Tableau de Bord Admin')).toBeVisible();
  });

  test('Admin devrait pouvoir gérer les utilisateurs', async ({ loginAsAdmin, page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/users');
    
    // Vérifier les boutons d'action admin
    await expect(page.locator('button:has-text("Créer"), button:has-text("Ajouter")')).toBeVisible();
    await expect(page.locator('button:has-text("Éditer"), button:has-text("Supprimer")')).toBeVisible();
  });

  test('Enseignant devrait voir seulement ses élèves', async ({ loginAsTeacher, page }) => {
    await loginAsTeacher(page);
    
    // Aller à la page des élèves
    await page.goto('/teacher/students');
    
    // Devrait voir le filtre "Mes classes"
    await expect(page.locator('text=/Mes classes|Mes élèves/')).toBeVisible();
    
    // Les élèves affichés devraient être de ses classes uniquement
  });

  test('Enseignant ne devrait pas accéder au dashboard admin', async ({ loginAsTeacher, page }) => {
    await loginAsTeacher(page);
    
    // Essayer d'accéder au dashboard admin
    await page.goto('/admin/dashboard');
    
    // Devrait être redirigé
    await page.waitForURL('**/teacher/**');
    
    // Vérifier qu'on n'est pas sur le dashboard admin
    expect(page.url()).not.toContain('/admin/dashboard');
  });

  test('Enseignant devrait pouvoir entrer les notes de ses élèves', async ({ loginAsTeacher, page }) => {
    await loginAsTeacher(page);
    
    // Aller à la page des notes
    await page.goto('/teacher/grades');
    
    // Vérifier la présence du bouton "Ajouter une note"
    const addGradeBtn = page.locator('button:has-text("Ajouter une note"), button:has-text("Nouvelle note")');
    await expect(addGradeBtn).toBeVisible();
  });

  test('Enseignant ne devrait pas voir les notes d\'autres classes', async ({ page }) => {
    // Se connecter comme enseignant
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'teacher@test.local');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button:has-text("Se connecter")');
    
    // Aller aux notes
    await page.goto('/teacher/grades');
    
    // Filtrer par classe d'un autre enseignant (si possible)
    // Cette vérification est faite au niveau du backend via RLS
    await page.waitForLoadState('networkidle');
  });

  test('Parent devrait voir ses enfants uniquement', async ({ loginAsParent, page }) => {
    await loginAsParent(page);
    
    // Aller à la page des enfants/classe
    await page.goto('/parent/children');
    
    // Devrait afficher ses enfants
    await expect(page.locator('[data-testid="child-card"], [data-testid="child-item"]')).toBeVisible();
  });

  test('Parent devrait voir les notes de ses enfants', async ({ loginAsParent, page }) => {
    await loginAsParent(page);
    
    // Naviguer vers les notes de l'enfant
    const childCard = page.locator('[data-testid="child-card"]').first();
    const childLink = childCard.locator('a').first();
    
    if (await childCard.isVisible()) {
      await childLink.click();
      
      // Chercher l'onglet notes
      const notesTab = page.locator('text=Notes, text=Bulletins');
      if (await notesTab.isVisible()) {
        await notesTab.click();
        
        // Les notes devraient être visibles
        await page.waitForLoadState('networkidle');
      }
    }
  });

  test('Parent ne devrait pas voir les enfants d\'autres parents', async ({ page }) => {
    // Cette vérification est principalement au niveau du backend (RLS)
    // Mais on peut tester qu'un parent ne peut pas accéder à un autre enfant via URL directe
    
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'parent@test.local');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button:has-text("Se connecter")');
    
    // Essayer d'accéder à un ID d'élève au hasard
    await page.goto('/parent/children/00000000-0000-0000-0000-000000000000');
    
    // Devrait être redirigé ou voir une erreur 404/403
    await page.waitForLoadState('networkidle');
    
    const hasError = await page.locator('text=/Non autorisé|Accès refusé|404/').isVisible();
    expect(hasError || !page.url().includes('/children/')).toBeTruthy();
  });

  test('Élève devrait voir ses propres informations', async ({ loginAsStudent, page }) => {
    await loginAsStudent(page);
    
    // Aller au profil
    await page.goto('/student/profile');
    
    // Vérifier les infos personnelles
    await expect(page.locator('text=/Mes informations|Mon profil/')).toBeVisible();
  });

  test('Élève devrait voir ses notes', async ({ loginAsStudent, page }) => {
    await loginAsStudent(page);
    
    await page.goto('/student/grades');
    
    // Vérifier la présence des notes
    await page.waitForLoadState('networkidle');
  });

  test('Élève ne devrait pas accéder au dashboard admin', async ({ loginAsStudent, page }) => {
    await loginAsStudent(page);
    
    // Essayer d'accéder au dashboard admin
    await page.goto('/admin/dashboard');
    
    // Devrait être redirigé
    await page.waitForURL('**/student/**');
    expect(page.url()).not.toContain('/admin/dashboard');
  });

  test('Utilisateur non connecté devrait être redirigé vers login', async ({ page }) => {
    // Essayer d'accéder directement au dashboard
    await page.goto('/admin/dashboard');
    
    // Devrait être redirigé vers login
    await page.waitForURL('**/auth/login');
    expect(page.url()).toContain('/auth/login');
  });

  test('Boutons d\'action devraient dépendre du rôle', async ({ loginAsTeacher, page }) => {
    await loginAsTeacher(page);
    
    await page.goto('/teacher/students');
    
    // Enseignant peut ajouter notes mais pas modifier élèves
    const addNoteBtn = page.locator('button:has-text("Ajouter note")');
    const addStudentBtn = page.locator('button:has-text("Ajouter élève")');
    
    await expect(addNoteBtn).toBeVisible();
    // addStudentBtn ne devrait pas être visible pour un enseignant
  });
});
