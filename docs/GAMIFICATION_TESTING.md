# Guide de Test - Système d'Automatisation de la Gamification

## Vue d'ensemble

Ce guide vous aide à tester le système d'automatisation de la gamification pour vous assurer que tout fonctionne correctement.

---

## Prérequis

Avant de commencer les tests, assurez-vous que :

1. ✅ Les migrations ont été appliquées
2. ✅ L'Edge Function `process-gamification-event` est déployée
3. ✅ Les règles par défaut sont initialisées
4. ✅ Vous avez au moins un étudiant dans votre base de données

---

## Tests Manuels via l'Interface

### 1. Accéder à la Page de Test

1. Aller dans **Admin → Gamification Test** (si ajoutée au menu)
2. Ou utiliser l'URL directe : `/admin/gamification-test`

### 2. Test : Excellence Académique (Note ≥ 18)

**Objectif** : Vérifier qu'une note de 18/20 ou plus attribue +50 points

**Étapes** :
1. Sélectionner "📝 Note ajoutée" comme type d'événement
2. Entrer l'ID d'un étudiant existant
3. Définir la note à 18 ou plus
4. Cliquer sur "Déclencher l'événement"

**Résultat attendu** :
- ✅ Message : "1 règle(s) appliquée(s)"
- ✅ Détail : "Excellence Académique" → +50 points
- ✅ Vérifier dans la base : `SELECT * FROM point_transactions WHERE student_id = 'ID' ORDER BY created_at DESC LIMIT 1;`

### 3. Test : Note Parfaite (20/20)

**Objectif** : Vérifier qu'une note de 20/20 attribue +100 points

**Étapes** :
1. Sélectionner "🎯 Note parfaite (20/20)"
2. Entrer l'ID de l'étudiant
3. Cliquer sur "Déclencher l'événement"

**Résultat attendu** :
- ✅ Message : "1 règle(s) appliquée(s)"
- ✅ Détail : "Perfectionniste" → +100 points

### 4. Test : Présence Quotidienne

**Objectif** : Vérifier que marquer une présence attribue +5 points

**Étapes** :
1. Sélectionner "✅ Présence"
2. Entrer l'ID de l'étudiant
3. Cliquer sur "Déclencher l'événement"

**Résultat attendu** :
- ✅ Message : "1 règle(s) appliquée(s)"
- ✅ Détail : "Présence Quotidienne" → +5 points

### 5. Test : Assiduité Exemplaire (30 jours)

**Objectif** : Vérifier qu'une série de 30 jours de présence attribue un badge

**Étapes** :
1. Sélectionner "🔥 Série de présences"
2. Entrer l'ID de l'étudiant
3. Définir "Jours consécutifs" à 30
4. Cliquer sur "Déclencher l'événement"

**Résultat attendu** :
- ✅ Message : "1 règle(s) appliquée(s)"
- ✅ Détail : "Assiduité Exemplaire" → Badge
- ✅ Vérifier dans la base : `SELECT * FROM user_badges WHERE user_id = 'ID' ORDER BY earned_date DESC LIMIT 1;`

### 6. Test : Prévention des Doublons

**Objectif** : Vérifier qu'un même événement n'est traité qu'une seule fois

**Étapes** :
1. Déclencher n'importe quel événement (ex: note de 18)
2. **Réutiliser exactement le même `event_id`** (modifier le code temporairement)
3. Déclencher à nouveau

**Résultat attendu** :
- ✅ Message : "Event already processed"
- ✅ Aucune nouvelle transaction de points créée

---

## Tests via SQL

### Test 1 : Vérifier les Règles Actives

```sql
SELECT 
  name, 
  event_type, 
  reward_type, 
  reward_value, 
  is_active 
FROM gamification_rules 
WHERE tenant_id = 'VOTRE-TENANT-ID' 
  AND is_active = true
ORDER BY priority DESC;
```

**Résultat attendu** : Au moins 5-6 règles actives

### Test 2 : Vérifier les Événements Traités

```sql
SELECT 
  event_type, 
  student_id, 
  rules_applied, 
  created_at 
FROM gamification_event_log 
WHERE tenant_id = 'VOTRE-TENANT-ID' 
ORDER BY created_at DESC 
LIMIT 10;
```

**Résultat attendu** : Liste des événements récemment traités

### Test 3 : Vérifier les Points Attribués

```sql
SELECT 
  pt.student_id,
  pt.points,
  pt.reason,
  pt.created_at,
  s.first_name,
  s.last_name
FROM point_transactions pt
JOIN students s ON s.id = pt.student_id
WHERE pt.reference_type = 'gamification_rule'
  AND pt.tenant_id = 'VOTRE-TENANT-ID'
ORDER BY pt.created_at DESC
LIMIT 10;
```

**Résultat attendu** : Transactions de points avec raison "Règle automatique: ..."

### Test 4 : Vérifier les Badges Attribués

```sql
SELECT 
  ub.user_id,
  bd.name as badge_name,
  ub.earned_date,
  s.first_name,
  s.last_name
FROM user_badges ub
JOIN badges_definitions bd ON bd.id = ub.badge_definition_id
JOIN students s ON s.id = ub.user_id
WHERE ub.tenant_id = 'VOTRE-TENANT-ID'
ORDER BY ub.earned_date DESC
LIMIT 10;
```

---

## Tests d'Intégration

### Test avec Création de Note Réelle

1. Aller dans votre interface de gestion des notes
2. Créer une nouvelle note ≥ 18 pour un étudiant
3. Vérifier immédiatement dans **Gamification → Points Manager** que les points ont été attribués

**Note** : Cela nécessite d'avoir intégré les helpers `onGradeAdded()` dans votre composant de création de notes.

### Test avec Marquage de Présence

1. Aller dans votre interface de gestion des présences
2. Marquer un étudiant comme présent
3. Vérifier que +5 points ont été attribués

---

## Dépannage

### Problème : Aucune règle appliquée

**Causes possibles** :
1. Les règles ne sont pas actives
   - **Solution** : `UPDATE gamification_rules SET is_active = true WHERE tenant_id = 'ID';`
2. Les conditions ne sont pas remplies
   - **Solution** : Vérifier les conditions JSON dans la table `gamification_rules`
3. L'événement a déjà été traité
   - **Solution** : Utiliser un nouvel `event_id` unique

### Problème : Erreur "Edge Function not found"

**Cause** : L'Edge Function n'est pas déployée

**Solution** :
```bash
supabase functions deploy process-gamification-event
```

### Problème : Erreur de permissions (RLS)

**Cause** : Les policies RLS bloquent l'accès

**Solution temporaire (DEV uniquement)** :
```sql
ALTER TABLE gamification_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE gamification_event_log DISABLE ROW LEVEL SECURITY;
```

**Solution permanente** : Vérifier que l'utilisateur a le bon `tenant_id` dans son profil

---

## Checklist de Validation

Avant de considérer le système comme prêt pour la production :

- [ ] ✅ Test "Excellence Académique" réussi
- [ ] ✅ Test "Perfectionniste" réussi
- [ ] ✅ Test "Présence Quotidienne" réussi
- [ ] ✅ Test "Assiduité Exemplaire" réussi
- [ ] ✅ Test de prévention des doublons réussi
- [ ] ✅ Vérification des logs dans `gamification_event_log`
- [ ] ✅ Vérification des points dans `point_transactions`
- [ ] ✅ Vérification des badges dans `user_badges`
- [ ] ✅ Test d'intégration avec création de note réelle
- [ ] ✅ Performance acceptable (< 500ms par événement)

---

## Prochaines Étapes

Une fois tous les tests validés :

1. **Intégrer les triggers** dans vos composants de production
2. **Configurer les webhooks** pour une automatisation complète
3. **Créer des règles personnalisées** adaptées à votre établissement
4. **Former les administrateurs** à l'utilisation de l'interface

---

## Support

Pour toute question ou problème :
- Consulter le [Guide de Déploiement](file:///c:/Users/cheic/Documents/EduSchool/schoolflow-pro/docs/GAMIFICATION_DEPLOYMENT.md)
- Consulter le [Walkthrough](file:///C:/Users/cheic/.gemini/antigravity/brain/16a38927-7f73-4f8e-9c1b-c4c1858b373d/walkthrough.md)
- Vérifier les logs de l'Edge Function : `supabase functions logs process-gamification-event`
