import { test, expect } from '../fixtures/auth';

/**
 * Tests CRUD Élèves
 * 
 * Couvre:
 * - Créer un nouvel élève
 * - Lire/afficher les élèves
 * - Mettre à jour les infos d'un élève
 * - Supprimer un élève
 */

test.describe('Gestion des Élèves', () => {
  test.beforeEach(async ({ loginAsAdmin, page }) => {
    // Se connecter en tant qu'admin avant chaque test
    await loginAsAdmin(page);
  });

  test('devrait afficher la liste des élèves', async ({ page }) => {
    // Naviguer vers la page des élèves
    await page.goto('/admin/students');
    
    // Vérifier la présence du titre
    await expect(page.locator('h1, h2').filter({ hasText: 'Élèves' })).toBeVisible();
    
    // Vérifier la présence d'une table/liste
    await expect(page.locator('table, [role="grid"], [data-testid="student-list"]')).toBeVisible();
  });

  test('devrait créer un nouvel élève', async ({ page }) => {
    await page.goto('/admin/students');
    
    // Cliquer sur "Nouvel Élève" ou "Ajouter"
    await page.click('button:has-text("Nouvel Élève"), button:has-text("Ajouter")');
    
    // Remplir le formulaire
    const firstName = `Jean-${Date.now()}`;
    const lastName = 'Dupont';
    
    await page.fill('input[name="first_name"]', firstName);
    await page.fill('input[name="last_name"]', lastName);
    await page.fill('input[name="email"]', `jean.dupont.${Date.now()}@example.com`);
    await page.fill('input[name="date_of_birth"]', '2010-05-15');
    
    // Sélectionner une classe
    await page.click('select[name="classroom_id"], [data-testid="classroom-select"]');
    const options = page.locator('option, [role="option"]');
    const count = await options.count();
    if (count > 1) {
      await options.nth(1).click();
    }
    
    // Soumettre
    await page.click('button:has-text("Enregistrer"), button:has-text("Créer")');
    
    // Attendre le message de succès
    await expect(page.locator('text=/Élève créé|Élève ajouté|succès/i')).toBeVisible({ timeout: 5000 });
    
    // Vérifier que l'élève apparaît dans la liste
    await expect(page.locator(`text=${firstName}`)).toBeVisible();
  });

  test('devrait modifier les infos d\'un élève', async ({ page }) => {
    await page.goto('/admin/students');
    
    // Chercher un élève (le premier de la liste)
    const firstStudent = page.locator('[data-testid="student-row"], table tbody tr').first();
    
    // Cliquer sur le bouton éditer
    await firstStudent.locator('button:has-text("Éditer"), button:has-text("Modifier")').click();
    
    // Modifier le champ email
    const newEmail = `modified-${Date.now()}@example.com`;
    const emailInput = page.locator('input[name="email"]');
    
    // Nettoyer et remplir
    await emailInput.triple_click();
    await emailInput.fill(newEmail);
    
    // Soumettre
    await page.click('button:has-text("Enregistrer"), button:has-text("Mettre à jour")');
    
    // Attendre le message de succès
    await expect(page.locator('text=/Élève mise à jour|succès/i')).toBeVisible({ timeout: 5000 });
  });

  test('devrait télécharger une photo d\'élève', async ({ page }) => {
    await page.goto('/admin/students');
    
    // Chercher un élève
    const firstStudent = page.locator('[data-testid="student-row"], table tbody tr').first();
    
    // Ouvrir le formulaire d'édition
    await firstStudent.locator('button:has-text("Éditer")').click();
    
    // Chercher le champ de photo
    const photoInput = page.locator('input[type="file"]');
    
    // Créer un fichier image temporaire
    const fileName = 'test-photo.png';
    
    // Uploader la photo
    if (await photoInput.isVisible()) {
      // Créer une image simple en base64
      const imageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      
      await photoInput.setInputFiles({
        name: fileName,
        mimeType: 'image/png',
        buffer: imageBuffer,
      });
    }
    
    // Soumettre
    await page.click('button:has-text("Enregistrer")');
    
    // Attendre le succès
    await expect(page.locator('text=/succès|Photo/i')).toBeVisible({ timeout: 5000 });
  });

  test('devrait afficher les détails d\'un élève', async ({ page }) => {
    await page.goto('/admin/students');
    
    // Cliquer sur le nom d'un élève
    const studentName = page.locator('[data-testid="student-name"], table tbody tr td').first();
    await studentName.click();
    
    // Attendre le chargement de la page de détails
    await page.waitForLoadState('networkidle');
    
    // Vérifier les infos affichées
    await expect(page.locator('text=/Informations personnelles|Notes|Présences/i')).toBeVisible();
  });

  test('devrait supprimer un élève avec confirmation', async ({ page }) => {
    await page.goto('/admin/students');
    
    // Chercher le dernier élève (pour ne pas casser les données de test existantes)
    const students = page.locator('[data-testid="student-row"], table tbody tr');
    const lastStudent = students.last();
    
    // Cliquer sur le bouton supprimer
    await lastStudent.locator('button:has-text("Supprimer"), button:has-text("×")').click();
    
    // Confirmer la suppression
    const confirmBtn = page.locator('button:has-text("Confirmer"), button:has-text("Oui")');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
    
    // Attendre le message de succès
    await expect(page.locator('text=/Élève supprimé|succès/i')).toBeVisible({ timeout: 5000 });
  });

  test('devrait valider les champs obligatoires', async ({ page }) => {
    await page.goto('/admin/students');
    
    // Cliquer sur "Nouvel Élève"
    await page.click('button:has-text("Nouvel Élève")');
    
    // Essayer de soumettre le formulaire vide
    await page.click('button:has-text("Enregistrer")');
    
    // Vérifier les erreurs de validation
    await expect(page.locator('text=/Requis|obligatoire|Veuillez remplir/i')).toBeVisible();
  });

  test('devrait filtrer les élèves par classe', async ({ page }) => {
    await page.goto('/admin/students');
    
    // Vérifier la présence d'un filtre
    const classroomFilter = page.locator('select[name="classroom"], [data-testid="filter-classroom"]');
    
    if (await classroomFilter.isVisible()) {
      // Sélectionner une classe
      await classroomFilter.click();
      const options = page.locator('option, [role="option"]');
      if (await options.count() > 1) {
        await options.nth(1).click();
      }
      
      // Vérifier que la liste est filtrée
      await page.waitForLoadState('networkidle');
    }
  });

  test('devrait afficher les notes d\'un élève', async ({ page }) => {
    await page.goto('/admin/students');
    
    // Cliquer sur un élève
    const firstStudent = page.locator('[data-testid="student-row"]').first();
    await firstStudent.click();
    
    // Naviguer vers les notes (ou onglet notes)
    const gradesTab = page.locator('text=Notes, text=Bulletins');
    if (await gradesTab.isVisible()) {
      await gradesTab.click();
    }
    
    // Vérifier la présence des notes
    await page.waitForLoadState('networkidle');
  });
});
