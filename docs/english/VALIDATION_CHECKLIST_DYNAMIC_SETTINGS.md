# ✅ Checklist de Validation - Système de Paramètres Dynamiques

**Date**: Janvier 20, 2025  
**Version**: 1.0  
**Status**: Ready for Validation

---

## 🎯 Purpose

Cette checklist permet à n'importe qui de vérifier que le système de paramètres dynamiques fonctionne correctement. Suivez les étapes dans l'ordre et cochez les cases au fur et à mesure.

**Durée estimée**: 30-45 minutes
**Rôle requis**: SUPER_ADMIN ou TENANT_ADMIN

---

## 📋 Section 1: Vérifications Techniques

### Build Verification

- [ ] **Build réussi sans erreurs**
  ```bash
  npm run build
  # Résultat attendu: "built in 1m 32s" (zéro erreurs)
  ```
  **Notes**: Ignorer les avertissements circulaires et les chunks > 1MB

- [ ] **Dev server démarre**
  ```bash
  npm run dev
  # Résultat attendu: "VITE v5.4.19 ready in 1677 ms"
  ```
  **Notes**: Accessible sur http://localhost:8080

- [ ] **Pas d'erreurs TypeScript**
  ```bash
  npx tsc --noEmit
  # Résultat attendu: 0 erreurs
  ```

- [ ] **Code change detection fonctionne**
  - Modifier un fichier (ex: ajouter console.log)
  - Le hot reload du navigateur fonctionne
  - Pas besoin de recharger manuellement

---

### Import & Export Verification

- [ ] **useSettings hook exporte correctement**
  ```bash
  # src/hooks/useSettings.ts existe
  # Exports: useSettings, useSetting, TenantSettingsSchema, DEFAULT_SETTINGS
  ```

- [ ] **BrandingSettings component exporte**
  ```bash
  # src/components/settings/BrandingSettings.tsx existe
  # Export: BrandingSettings (function)
  ```

- [ ] **SystemSettings component exporte**
  ```bash
  # src/components/settings/SystemSettings.tsx existe
  # Export: SystemSettings (function)
  ```

- [ ] **Settings page imports correctement**
  ```bash
  # src/pages/admin/Settings.tsx
  # Imports BrandingSettings et SystemSettings sans erreur
  ```

---

## 📱 Section 2: Vérifications Interface (UI)

### Settings Page Navigation

- [ ] **Page de paramètres accessible**
  - Connectez-vous en tant qu'admin
  - Allez à `http://localhost:8080/admin/settings`
  - Page charge sans erreur

- [ ] **Tous les onglets visibles**
  - [ ] Establishment (tab 1)
  - [ ] Branding (tab 2) ← NOUVEAU
  - [ ] Grading (tab 3)
  - [ ] Attendance (tab 4)
  - [ ] System (tab 5) ← NOUVEAU
  - [ ] ... (autres onglets)

- [ ] **Onglet "Branding" fonctionne**
  - Cliquez sur l'onglet "Identité Visuelle"
  - Contenu s'affiche sans erreur
  - 4 sections visibles: Logo, Couleurs, Noms, Affichage

- [ ] **Onglet "System" fonctionne**
  - Cliquez sur l'onglet "Système"
  - Contenu s'affiche sans erreur
  - 5 groupes visibles: Localisation, Horaires, Finance, Fonctionnalités, Assiduité

---

### Branding Tab - Logo Upload

- [ ] **Zone d'upload visible**
  - Texture pointillée avec texte "Glissez-déposez"
  - Bouton de sélection visible

- [ ] **Upload via clic fonctionne**
  - Cliquez sur la zone
  - Sélecteur de fichier s'ouvre
  - Choisissez une image (PNG ou JPG)
  - Image se charge

- [ ] **Upload via drag & drop fonctionne**
  - Glissez une image sur la zone
  - Image se charge sans erreur

- [ ] **Validation de fichier fonctionne**
  - Essayer d'uploader un fichier non-image (doc, pdf, etc.)
  - Message d'erreur s'affiche
  - Fichier refusé

- [ ] **Validation de taille fonctionne**
  - Essayer d'uploader une image > 5MB
  - Message d'erreur s'affiche
  - Fichier refusé

- [ ] **Image preview s'affiche**
  - Après upload réussi
  - Image visible dans la zone
  - Dimensions correctes (~200x200 px)

---

### Branding Tab - Color Customization

- [ ] **Color picker pour couleur primaire**
  - Cliquez sur le carré de couleur primaire
  - Palette s'ouvre
  - Choisissez une couleur
  - Couleur change dans le preview

- [ ] **Hex color input fonctionne**
  - Entrez un code hex valide (ex: #FF0000)
  - Couleur change
  - Format #RRGGBB accepté

- [ ] **Color picker pour couleur secondaire**
  - Cliquez sur le carré de couleur secondaire
  - Palette s'ouvre
  - Choisissez une couleur
  - Couleur change

- [ ] **Color picker pour couleur accentuation**
  - Cliquez sur le carré de couleur accentuation
  - Palette s'ouvre
  - Choisissez une couleur
  - Couleur change

- [ ] **Preview en live fonctionne**
  - Section "Aperçu" montre les couleurs
  - Updates en temps réel au fur et à mesure des changements
  - Pas besoin de cliquer "Enregistrer" pour voir le preview

---

### Branding Tab - Name Configuration

- [ ] **Champ "Nom" fonctionne**
  - Effacez le nom actuel
  - Entrez un nouveau nom (ex: "Ma Nouvelle École")
  - Texte s'enregistre

- [ ] **Champ "Nom officiel" fonctionne**
  - Entrez un nom officiel (ex: "Ma Nouvelle École Internationale")
  - Texte s'enregistre
  - Peut être différent du nom court

- [ ] **Toggle "Afficher le texte du logo" fonctionne**
  - Cliquez le toggle ON
  - Preview montre le texte à côté du logo
  - Cliquez le toggle OFF
  - Preview cache le texte (logo uniquement)

---

### Branding Tab - Save & Reset

- [ ] **Bouton "Enregistrer" fonctionne**
  - Modifiez au moins un paramètre
  - Bouton "Enregistrer" devient actif (pas grisé)
  - Cliquez "Enregistrer"
  - Toast vert apparaît: "Branding mis à jour avec succès!"

- [ ] **Bouton "Réinitialiser" fonctionne**
  - Modifiez un paramètre
  - Cliquez "Réinitialiser"
  - Formulaire revient à l'état d'avant vos changements
  - Toast bleu apparaît

- [ ] **Loading state pendant save**
  - Modifiez un paramètre
  - Cliquez "Enregistrer"
  - Spinner/loader s'affiche brièvement
  - "Enregistrer" s'affiche comme désactivé pendant le save

---

### System Tab - Localization

- [ ] **Sélecteur de langue fonctionne**
  - Ouvrez le dropdown "Langue"
  - 5+ options visibles
  - Choisissez une langue
  - Valeur change

- [ ] **Sélecteur de timezone fonctionne**
  - Ouvrez le dropdown "Fuseau horaire"
  - 8+ options visibles (UTC+2, UTC+8, etc.)
  - Choisissez un timezone
  - Valeur change

- [ ] **Champ locale fonctionne**
  - Entrez un code locale (ex: en-US, fr-FR)
  - Texte s'enregistre

---

### System Tab - Schedule

- [ ] **Sélecteur "Heure début journée" fonctionne**
  - Cliquez sur le champ time picker
  - Sélectionnez une heure (ex: 08:00)
  - Valeur change

- [ ] **Sélecteur "Heure fin journée" fonctionne**
  - Cliquez sur le champ time picker
  - Sélectionnez une heure (ex: 16:00)
  - Valeur change

- [ ] **Champ "Durée séance de classe" fonctionne**
  - Entrez un nombre (ex: 50)
  - Valeur change

- [ ] **Champ "Durée pauses" fonctionne**
  - Entrez un nombre (ex: 10)
  - Valeur change

---

### System Tab - Finance

- [ ] **Sélecteur devise fonctionne**
  - Ouvrez dropdown "Devise"
  - Options: USD, EUR, GBP, CAD, AUD (5+ options)
  - Choisissez une devise
  - Valeur change

- [ ] **Sélecteur année fiscale fonctionne**
  - Ouvrez dropdown "Année fiscale"
  - Options: JAN-DEC, APR-MAR, AUG-JUL, etc.
  - Choisissez une option
  - Valeur change

---

### System Tab - Features

- [ ] **Toggle notifications fonctionne**
  - Cliquez le toggle ON
  - Toggle passe en bleu/actif
  - Cliquez OFF
  - Toggle passe en gris/inactif

- [ ] **Toggle API access fonctionne**
  - Même comportement que notifications

- [ ] **Toggle advanced analytics fonctionne**
  - Même comportement que notifications

- [ ] **Toggle AI features fonctionne**
  - Même comportement que notifications

---

### System Tab - Attendance

- [ ] **Toggle auto-mark absence fonctionne**
  - Cliquez ON/OFF
  - Toggle change d'état

- [ ] **Toggle require justification fonctionne**
  - Cliquez ON/OFF
  - Toggle change d'état

---

### System Tab - Save & Reset

- [ ] **Bouton "Enregistrer" fonctionne**
  - Modifiez au moins un paramètre système
  - Bouton "Enregistrer" s'active
  - Cliquez "Enregistrer"
  - Toast vert: "Paramètres système mis à jour avec succès!"

- [ ] **Bouton "Réinitialiser" fonctionne**
  - Modifiez des paramètres
  - Cliquez "Réinitialiser"
  - Valeurs reviennent à l'état initial

---

## 🔄 Section 3: Vérifications de Données

### Database & Persistence

- [ ] **Modifications sauvegardées en DB**
  - Modifiez un paramètre (ex: logo)
  - Cliquez "Enregistrer"
  - Actualisez la page (F5 ou Ctrl+R)
  - Le paramètre est toujours modifié
  - **Non** revenué à la valeur d'avant

- [ ] **Real-time sync fonctionne**
  - Ouvrez deux onglets du navigateur (Admin page)
  - Dans l'onglet 1: Modifiez un paramètre et "Enregistrez"
  - Dans l'onglet 2: Vérifiez que la modification apparaît en < 5 secondes
  - Pas besoin de refresh manuel

- [ ] **Settings column en JSONB**
  - Vérifier en DB (optionnel):
    ```sql
    SELECT settings FROM tenants WHERE id = '...' LIMIT 1;
    # Devrait contenir: {"logo_url": "...", "primary_color": "...", etc.}
    ```

---

### Default Values

- [ ] **DEFAULT_SETTINGS utilisés**
  - Créez une nouvelle école de test
  - Allez à settings
  - Tous les champs ont des valeurs par défaut (non vides)
  - Pas de messages d'erreur "undefined"

---

## 🎨 Section 4: Vérifications de Composants

### TenantBranding Component

- [ ] **Logo dynamique s'affiche**
  - Changez le logo en Branding settings
  - Cliquez "Enregistrer"
  - Allez à une page avec TenantBranding (ex: accueil)
  - Nouveau logo visible
  - Pas de recharge de page

- [ ] **Nom dynamique s'affiche**
  - Changez le nom en Branding settings
  - Cliquez "Enregistrer"
  - Allez à une page avec TenantBranding
  - Nouveau nom visible

- [ ] **Fallback fonctionne**
  - Si pas de custom logo, icon par défaut s'affiche
  - Si pas de nom, "EduManager" par défaut s'affiche

---

### Autres Composants

- [ ] **Existing pages chargent**
  - Dashboard
  - Grades page
  - Students page
  - Attendance page
  - Finance page
  - Pas d'erreurs

- [ ] **No console errors**
  - Ouvrir DevTools (F12)
  - Console tab
  - Pas de rouge errors (warnings OK)
  - Naviguer sur différentes pages
  - Toujours pas d'erreurs

---

## 🔐 Section 5: Vérifications de Sécurité

### Access Control

- [ ] **Seuls admins accèdent à settings**
  - Connectez-vous en STUDENT
  - Essayez d'accéder à `/admin/settings`
  - Accès refusé (redirect ou 403)

- [ ] **TEACHER ne peut pas accéder**
  - Connectez-vous en TEACHER
  - Essayez `/admin/settings`
  - Accès refusé

- [ ] **TENANT_ADMIN peut accéder**
  - Connectez-vous en TENANT_ADMIN
  - Allez à `/admin/settings`
  - Page charge normalement

---

### File Upload Security

- [ ] **EXE files refusés**
  - Essayez d'uploader un .exe ou script
  - Message d'erreur: "Format d'image invalide"

- [ ] **PDF files refusés**
  - Essayez d'uploader un PDF
  - Message d'erreur

- [ ] **Very large files refusés**
  - Créez/trouvez une image > 10MB
  - Message d'erreur: "Fichier trop volumineux"

---

## ⚡ Section 6: Vérifications de Performance

### Load Times

- [ ] **Settings page charge < 2 secondes**
  - DevTools → Network tab
  - Reload `/admin/settings`
  - Temps total < 2 secondes

- [ ] **Save operation < 1 seconde**
  - Modifiez un paramètre
  - Cliquez "Enregistrer"
  - Toast apparaît en < 1 seconde

- [ ] **Real-time update < 5 secondes**
  - 2 onglets ouverts
  - Modifiez en onglet 1
  - Onglet 2 met à jour en < 5 secondes

---

### Memory Usage

- [ ] **Pas de memory leak**
  - Ouvrir DevTools → Memory
  - Prendre un heap snapshot initial
  - Naviguer settings page 10 fois
  - Prendre un heap snapshot
  - Mémoire pas duplée

---

## 📚 Section 7: Vérifications de Documentation

- [ ] **DYNAMIC_SETTINGS_SYSTEM_GUIDE.md existe**
  - À la racine du projet
  - 4000+ lignes
  - Contient architecture, code examples, troubleshooting

- [ ] **GUIDE_ADMIN_PARAMETRES.md existe**
  - À la racine du projet
  - 2500+ lignes
  - Guide complet pour admins

- [ ] **DYNAMIC_SETTINGS_IMPLEMENTATION_SUMMARY.md existe**
  - À la racine du projet
  - 1500+ lignes
  - Executive summary et checklist

- [ ] **FILES_STRUCTURE_AND_DOCUMENTATION.md existe**
  - À la racine du projet
  - Structure des fichiers

- [ ] **GETTING_STARTED_DYNAMIC_SETTINGS.md existe**
  - À la racine du projet
  - Navigation et quick start

---

## 🚀 Section 8: Final Validation

### Sign-off

- [ ] **Tous les tests réussis**
  - Cochez au moins 80% des items ci-dessus

- [ ] **Pas de blockers majeurs**
  - Issues trouvées sont mineures ou documentées

- [ ] **Documentation complète**
  - Tous les 5 guides existent
  - Sont lisibles et corrects

- [ ] **Production ready approval**
  - Code: ✅
  - Tests: ✅
  - Documentation: ✅
  - Security: ✅

---

## 📝 Notes & Observations

Utilisez cet espace pour noter les problèmes ou observations:

```
[Note 1]
Date: _________
Issue: ________________________________
Severity: Critical / Major / Minor / Info
Status: Blocker / Cosmetic / FYI
Solution: _____________________________

[Note 2]
...
```

---

## ✍️ Sign-off

| Rôle | Nom | Date | Signature | Status |
|------|-----|------|-----------|--------|
| QA Engineer | _____ | _____ | _____ | ✅ / ❌ |
| Dev Lead | _____ | _____ | _____ | ✅ / ❌ |
| Product Owner | _____ | _____ | _____ | ✅ / ❌ |

---

## 📊 Résultats

- **Tests réussis**: ____ / 100+
- **Blockers**: ____
- **Majors**: ____
- **Minors**: ____
- **Info**: ____

**Overall Status**:
- [ ] ✅ PASS - Ready for production
- [ ] ⚠️ PASS WITH NOTES - Ready but document issues
- [ ] ❌ FAIL - Not ready, issues to fix

**Recommendation**: ___________________

---

**Version**: 1.0  
**Date de création**: Janvier 20, 2025  
**Durée de validation**: ~45 minutes  
**Rôles requis**: QA + Dev + Product Owner
