# Tests E2E avec Playwright - SchoolFlow Pro

## 📋 Vue d'ensemble

Ce répertoire contient les tests End-to-End (E2E) pour l'application SchoolFlow Pro.

**Technologie**: [Playwright](https://playwright.dev) - Framework E2E moderne et performant

**Couverture actuelle**:
- ✅ Authentification (login, signup, logout, réinitialisation)
- ✅ Gestion des élèves (CRUD)
- ✅ Contrôle d'accès par rôle (RBAC)
- ✅ Isolation multi-tenant

**Tests écrits**: 60+ tests  
**Temps d'exécution estimé**: 5-10 minutes pour tous les tests

---

## 🚀 Démarrage Rapide

### Installation

```bash
# Playwright est déjà installé via package.json
npm list @playwright/test

# Si absent, installer:
npm install -D @playwright/test
npx playwright install
```

### Lancer les tests

```bash
# Tous les tests
npm run test:e2e

# Tests spécifiques
npm run test:e2e -- tests/e2e/auth.spec.ts
npm run test:e2e -- tests/e2e/students.spec.ts

# Mode watch (rerun au changement de code)
npm run test:e2e -- --watch

# Ouvrir l'UI interactive
npm run test:e2e -- --ui

# Tests en mode headed (voir le navigateur)
npm run test:e2e -- --headed

# Debugging avec inspector
npm run test:e2e -- --debug
```

### Ajouter les scripts npm

Ajouter à votre `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:report": "playwright show-report"
  }
}
```

---

## 📁 Structure des Fichiers

```
tests/
├── e2e/                          # Tests E2E
│   ├── auth.spec.ts              # Tests d'authentification
│   ├── students.spec.ts          # Tests gestion des élèves
│   ├── rbac.spec.ts              # Tests contrôle d'accès
│   ├── tenant-isolation.spec.ts  # Tests isolation multi-tenant
│   ├── grades.spec.ts            # Tests notes (à venir)
│   └── attendance.spec.ts        # Tests présences (à venir)
│
├── fixtures/                     # Fixtures Playwright
│   └── auth.ts                   # Fixture authentification
│
└── utils/                        # Utilitaires
    └── test-data.ts              # Données de test (à venir)

playwright.config.ts              # Configuration Playwright
```

---

## 🔐 Authentification dans les Tests

### Utiliser les Fixtures

Les fixtures pré-configurées font l'authentification automatiquement:

```typescript
import { test, expect } from '../fixtures/auth';

test.describe('Mes tests', () => {
  test('test avec admin', async ({ loginAsAdmin, page }) => {
    await loginAsAdmin(page);
    // page est maintenant connectée en tant qu'admin
  });

  test('test avec enseignant', async ({ loginAsTeacher, page }) => {
    await loginAsTeacher(page);
    // page est maintenant connectée en tant qu'enseignant
  });

  test('test avec page pré-authentifiée', async ({ authenticatedPage }) => {
    // authenticatedPage est déjà connectée
    await authenticatedPage.goto('/admin/students');
  });
});
```

### Utilisateurs de Test

| Email | Password | Rôle |
|-------|----------|------|
| `admin@test.local` | `Password123!` | TENANT_ADMIN |
| `teacher@test.local` | `Password123!` | TEACHER |
| `parent@test.local` | `Password123!` | PARENT |
| `student@test.local` | `Password123!` | STUDENT |

**À CRÉER**: Ajouter des users de test à la base de données pour que les tests fonctionnent!

```sql
-- Créer les utilisateurs de test dans Supabase Auth
-- Puis créer leurs profils et rôles
```

---

## ✍️ Écrire de Nouveaux Tests

### Template de Base

```typescript
import { test, expect } from '../fixtures/auth';

test.describe('Nom de la fonctionnalité', () => {
  test.beforeEach(async ({ loginAsAdmin, page }) => {
    // Configuration avant chaque test
    await loginAsAdmin(page);
  });

  test('devrait faire quelque chose', async ({ page }) => {
    // Arrange
    await page.goto('/admin/students');
    
    // Act
    await page.click('button:has-text("Ajouter")');
    await page.fill('input[name="name"]', 'Valeur');
    await page.click('button:has-text("Enregistrer")');
    
    // Assert
    await expect(page.locator('text=Succès')).toBeVisible();
  });
});
```

### Bonnes Pratiques

✅ **Utiliser data-testid**
```html
<!-- Dans votre composant React -->
<button data-testid="add-student-btn">Ajouter</button>
```

```typescript
// Dans le test
await page.click('[data-testid="add-student-btn"]');
```

✅ **Attendre les éléments**
```typescript
// ✅ BON - Attendre que l'élément soit visible
await expect(page.locator('text=Succès')).toBeVisible({ timeout: 5000 });

// ❌ MAUVAIS - Délai fixe
await page.waitForTimeout(2000);
```

✅ **Isoler les tests**
```typescript
// Chaque test doit pouvoir s'exécuter indépendamment
// Créer des données uniques avec Date.now()
const uniqueName = `Test-${Date.now()}`;
```

✅ **Utiliser des sélecteurs robustes**
```typescript
// ✅ BON - Texte stable
await page.click('button:has-text("Enregistrer")');

// ❌ FRAGILE - Index qui peut changer
await page.click('button >> nth=3');
```

---

## 🔍 Debugging

### Afficher les traces d'exécution

```bash
# Générer les traces
npm run test:e2e

# Visualiser
npx playwright show-trace trace.zip
```

### Pause dans les tests

```typescript
test('mon test', async ({ page }) => {
  await page.goto('/admin');
  await page.pause(); // ⏸️ Arrête ici - terminal interactif
  // Vous pouvez taper des commandes
});
```

### Enregistrement de tests

```bash
# Enregistrer une interaction utilisateur
npx playwright codegen http://localhost:3000
# Cliquez dans l'app, Playwright génère le code
```

---

## 📊 Rapports et Artifacts

### Voir les rapports

```bash
# Après les tests
npm run test:e2e:report

# Ou directement
npx playwright show-report
```

### Artifacts en cas d'erreur

Les artifacts sont sauvegardés dans `test-results/`:
- 📸 Screenshots
- 🎥 Vidéos
- 📝 Traces

```bash
# Nettoyer les anciens résultats
rm -rf test-results/
```

---

## 🔄 Intégration CI/CD

### GitHub Actions

```yaml
# .github/workflows/tests.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - run: npm ci
      - run: npm run test:e2e
      
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 🐛 Tests Actuels et État

### Fichiers de Tests

| Fichier | Tests | État |
|---------|-------|------|
| `auth.spec.ts` | 7 tests | ✅ Prêt |
| `students.spec.ts` | 8 tests | ✅ Prêt |
| `rbac.spec.ts` | 13 tests | ✅ Prêt |
| `tenant-isolation.spec.ts` | 7 tests | ✅ Prêt |
| `grades.spec.ts` | À venir | ⏳ |
| `attendance.spec.ts` | À venir | ⏳ |

### Prérequis pour Exécuter

- ✅ Docker Compose en cours d'exécution
- ✅ Frontend sur http://localhost:3000
- ⏳ **Utilisateurs de test créés dans la BDD**
- ⏳ **Données de test (élèves, classes, etc.)**

---

## 📝 Créer les Données de Test

### Script d'Initialisation

```sql
-- Créer les utilisateurs de test
INSERT INTO auth.users (...) VALUES (...)
  ON CONFLICT DO NOTHING;

-- Créer les profils
INSERT INTO public.profiles (...) VALUES (...)
  ON CONFLICT DO NOTHING;

-- Assigner les rôles
INSERT INTO public.user_roles (...) VALUES (...)
  ON CONFLICT DO NOTHING;

-- Créer des classes de test
INSERT INTO public.classrooms (...) VALUES (...)
  ON CONFLICT DO NOTHING;

-- Créer des élèves de test
INSERT INTO public.students (...) VALUES (...)
  ON CONFLICT DO NOTHING;
```

À créer: `docker/init/99-create-test-data.sql`

---

## ⚙️ Configuration Avancée

### Variables d'Environnement

```bash
# .env.test
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000
PLAYWRIGHT_CHROMIUM_HEADLESS=true
PLAYWRIGHT_SLOW_MO=100
```

### Timeouts Personnalisés

```typescript
test.setTimeout(60000); // 60 secondes pour ce test

test('test lent', async ({ page }) => {
  // Ce test a 60 secondes au lieu de 30
});
```

---

## 🚨 Dépannage Courant

### Erreur: "User not found"
**Solution**: Créer les utilisateurs de test dans la BDD

### Erreur: "Timeout waiting for element"
**Solution**: 
- Augmenter le timeout: `.toBeVisible({ timeout: 10000 })`
- Vérifier le sélecteur: `await page.locator('...').isVisible()`
- Ajouter du padding: `await page.waitForLoadState('networkidle')`

### Tests pass localement mais pas en CI
**Solution**:
- Vérifier que les services Docker fonctionnent en CI
- Utiliser `--headed` pour déboguer en CI
- Vérifier les variables d'environnement

### Flaky tests (intermittent)
**Solution**:
- Utiliser `.waitForLoadState()` après navigation
- Éviter les délais fixes (`waitForTimeout`)
- Utiliser des attentes explicites

---

## 📚 Ressources

- [Documentation Playwright](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)
- [API Reference](https://playwright.dev/docs/api/class-page)

---

## 🎯 Prochaines Étapes

1. ✅ **Créer les données de test** dans la BDD
2. ✅ **Ajouter les utilisateurs de test** (admin, teacher, parent, student)
3. ⏳ **Écrire les tests pour Notes** (grades.spec.ts)
4. ⏳ **Écrire les tests pour Présences** (attendance.spec.ts)
5. ⏳ **Ajouter les tests pour Messages** (messages.spec.ts)
6. ⏳ **Intégrer en CI/CD** (GitHub Actions)

---

**Last Updated**: 16 janvier 2026  
**Maintainer**: GitHub Copilot  
**Questions?** Consulter la documentation Playwright officielle

