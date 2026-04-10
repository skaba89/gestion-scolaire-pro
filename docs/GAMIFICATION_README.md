# 🎮 Système d'Automatisation de la Gamification

## Vue d'ensemble

Le système d'automatisation de la gamification permet d'attribuer **automatiquement** des points et des badges aux étudiants en fonction de leurs performances académiques, de leur assiduité et de leur engagement.

## ✨ Fonctionnalités

- ✅ **Règles configurables** : Créez des règles personnalisées via l'interface admin
- ✅ **Attribution automatique** : Points et badges attribués en temps réel
- ✅ **6 types d'événements** : Notes, présences, devoirs, améliorations, etc.
- ✅ **Prévention des doublons** : Chaque événement n'est traité qu'une seule fois
- ✅ **Règles par défaut** : 6 règles prêtes à l'emploi
- ✅ **Interface de test** : Page dédiée pour tester vos règles

## 🚀 Démarrage Rapide

### 1. Appliquer les Migrations

**Via Dashboard Supabase** :
1. Aller sur [app.supabase.com](https://app.supabase.com) → SQL Editor
2. Exécuter les migrations dans l'ordre :
   - `20260216210000_create_gamification_rules.sql`
   - `20260216210100_seed_default_gamification_rules.sql`

**Via CLI** :
```bash
supabase db push
```

### 2. Déployer l'Edge Function

```bash
supabase functions deploy process-gamification-event
```

### 3. Initialiser les Règles

Dans SQL Editor :
```sql
SELECT seed_default_gamification_rules('votre-tenant-id');
```

### 4. Tester

1. Aller dans **Admin → Gamification → Règles Auto**
2. Vérifier que les règles sont actives
3. Utiliser la page de test (si configurée) pour simuler des événements

## 📋 Règles Par Défaut

| Règle | Événement | Condition | Récompense |
|-------|-----------|-----------|------------|
| Excellence Académique | Note ajoutée | score ≥ 18 | +50 points |
| Perfectionniste | Note parfaite | score = 20 | +100 points |
| Présence Quotidienne | Présence | - | +5 points |
| Devoir à Temps | Devoir rendu | avant deadline | +10 points |
| Amélioration Continue | Amélioration | +5 points vs dernière | +25 points |
| Assiduité Exemplaire | Série présences | 30 jours consécutifs | Badge |

## 🔧 Utilisation

### Interface Admin

**Créer une règle** :
1. Admin → Gamification → Règles Auto
2. Cliquer sur "Nouvelle Règle"
3. Remplir le formulaire :
   - Nom : "Mention Très Bien"
   - Événement : "Note ajoutée"
   - Conditions : `{"min_score": 16}`
   - Récompense : Points → 75
4. Valider

**Gérer les règles** :
- Activer/désactiver avec le switch
- Supprimer si nécessaire
- Modifier la priorité

### Intégration dans le Code

**Exemple : Déclencher lors de l'ajout d'une note**

```typescript
import { onGradeAdded } from "@/lib/gamification-triggers";

// Après avoir créé une note
await onGradeAdded(
  gradeId,
  tenantId,
  studentId,
  score,
  subjectId
);
```

**Autres helpers disponibles** :
- `onAttendanceMarked()` : Pour les présences
- `onHomeworkSubmitted()` : Pour les devoirs

Voir [gamification-integration-examples.ts](src/lib/gamification-integration-examples.ts) pour plus d'exemples.

## 📁 Structure des Fichiers

```
📦 Gamification Automation
├── 📂 supabase/migrations/
│   ├── 20260216210000_create_gamification_rules.sql
│   └── 20260216210100_seed_default_gamification_rules.sql
├── 📂 supabase/functions/
│   └── process-gamification-event/index.ts
├── 📂 src/lib/
│   ├── gamification-rules-service.ts
│   ├── gamification-triggers.ts
│   └── gamification-integration-examples.ts
├── 📂 src/components/gamification/
│   └── GamificationRulesManager.tsx
├── 📂 src/pages/admin/
│   ├── Gamification.tsx (modifié)
│   └── GamificationTest.tsx
└── 📂 docs/
    ├── GAMIFICATION_DEPLOYMENT.md
    └── GAMIFICATION_TESTING.md
```

## 🧪 Tests

### Page de Test Interactive

Accéder à `/admin/gamification-test` pour :
- Simuler des événements
- Tester vos règles en temps réel
- Visualiser les résultats
- Accéder aux scénarios suggérés

### Tests SQL

```sql
-- Vérifier les règles actives
SELECT name, event_type, reward_type, reward_value 
FROM gamification_rules 
WHERE is_active = true;

-- Vérifier les événements traités
SELECT * FROM gamification_event_log 
ORDER BY created_at DESC LIMIT 10;

-- Vérifier les points attribués
SELECT * FROM point_transactions 
WHERE reference_type = 'gamification_rule' 
ORDER BY created_at DESC LIMIT 10;
```

## 📚 Documentation

- **[Guide de Déploiement](docs/GAMIFICATION_DEPLOYMENT.md)** : Instructions détaillées pour le déploiement
- **[Guide de Test](docs/GAMIFICATION_TESTING.md)** : Procédures de test complètes
- **[Exemples d'Intégration](src/lib/gamification-integration-examples.ts)** : Code d'exemple

## 🔍 Dépannage

### Aucune règle appliquée

**Causes** :
- Règles inactives → Activer dans l'interface
- Conditions non remplies → Vérifier les conditions JSON
- Événement déjà traité → Utiliser un nouvel `event_id`

**Solution** :
```sql
UPDATE gamification_rules SET is_active = true WHERE tenant_id = 'ID';
```

### Edge Function non trouvée

**Cause** : Fonction non déployée

**Solution** :
```bash
supabase functions deploy process-gamification-event
```

### Erreur de permissions

**Cause** : RLS bloque l'accès

**Solution** : Vérifier que l'utilisateur a le bon `tenant_id` dans son profil

## 🎯 Prochaines Étapes

1. **Webhooks automatiques** : Configurer les triggers de base de données
2. **Constructeur visuel** : Interface sans JSON pour les conditions
3. **Analytics** : Dashboard des règles les plus déclenchées
4. **Notifications** : Alerter les étudiants lors de l'attribution

## 📝 Notes Importantes

- Les événements sont traités de manière **atomique**
- La prévention des doublons est **automatique**
- Les règles sont évaluées par **ordre de priorité**
- Les logs sont conservés dans `gamification_event_log`

## 🤝 Support

Pour toute question :
- Consulter la documentation dans `/docs`
- Vérifier les logs : `supabase functions logs process-gamification-event`
- Tester via la page de test interactive

---

**Version** : 1.0.0  
**Date** : 2026-02-16  
**Statut** : ✅ Prêt pour la production
