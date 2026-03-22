# Guide Administrateur - Système de Paramètres Dynamiques

## 📋 Table des matières

1. [Accès à la page de paramètres](#accès)
2. [Onglet Identité Visuelle (Branding)](#branding)
3. [Onglet Système](#système)
4. [Onglet Établissement](#établissement)
5. [Onglet Notation](#notation)
6. [Onglet Assiduité](#assiduité)
7. [FAQ et Dépannage](#faq)

---

## <a id="accès"></a>1. Accès à la Page de Paramètres

### Chemin d'accès

1. **Connectez-vous** en tant qu'administrateur
2. **Cliquez** sur "Tableau de bord Admin" (dashboard)
3. **Sélectionnez** "Paramètres" dans le menu gauche
4. Vous verrez plusieurs onglets en haut de la page

### Rôles autorisés

Seuls les rôles suivants peuvent accéder à la page de paramètres:
- **SUPER_ADMIN** - Administrateur système (tous les privilèges)
- **TENANT_ADMIN** - Administrateur de l'établissement (peut modifier ses paramètres)

---

## <a id="branding"></a>2. Onglet Identité Visuelle (Branding)

Cet onglet vous permet de personnaliser l'apparence de votre établissement.

### 2.1 Télécharger un Logo

**Étapes:**
1. Cliquez sur l'onglet "Identité Visuelle"
2. Scroll jusqu'à la section "Logo"
3. **Option A (Clic)** - Cliquez sur la zone pointillée pour ouvrir le sélecteur de fichier
4. **Option B (Drag & drop)** - Glissez-déposez un fichier image directement
5. Sélectionnez votre image (PNG, JPG, WebP, etc.)
6. L'image s'affiche en aperçu
7. Cliquez sur "Enregistrer" pour confirmer

**Spécifications:**
- **Taille maximale**: 5 MB
- **Format acceptés**: PNG, JPG, WebP, GIF
- **Dimensions recommandées**: 500x500 pixels (carré)
- **Ratio d'aspect**: 1:1 (carré) de préférence

**Après upload:**
- Logo remplace le logo par défaut partout dans l'application
- Visible dans l'en-tête des pages
- Visible dans TenantBranding sur chaque page
- Les anciennes données restent inchangées (compatibilité)

### 2.2 Personnaliser les Couleurs

La page affiche une section "Couleurs" avec trois champs:

**Couleur primaire** (exemple: #3B82F6)
- Utilisée pour les boutons, en-têtes, éléments importants
- Format: Code hex (ex: #FF0000 pour rouge)

**Couleur secondaire** (exemple: #6366F1)
- Utilisée pour les accents secondaires
- Crée une cohérence avec la couleur primaire

**Couleur accentuation** (exemple: #EC4899)
- Utilisée pour les éléments d'attention (avertissements, confirmations)
- Contraste avec les deux couleurs principales

**Comment changer une couleur:**
1. Cliquez sur le carré de couleur (color picker)
2. Une palette s'ouvre
3. Sélectionnez la couleur désirée OU
4. Entrez le code hex directement dans le champ texte
5. Cliquez en dehors du picker pour fermer
6. L'aperçu se met à jour en temps réel

**Format des codes couleurs:**
```
#RRGGBB où:
RR = Valeur rouge (00-FF)
GG = Valeur verte (00-FF)
BB = Valeur bleue (00-FF)

Exemples:
#FF0000 = Rouge pur
#00FF00 = Vert pur
#0000FF = Bleu pur
#FFFFFF = Blanc
#000000 = Noir
#808080 = Gris
```

### 2.3 Configurer le Nom de l'Établissement

**Champ "Nom":**
- Nom court utilisé pour l'affichage
- Exemple: "École Moderne" ou "EM"
- Visible dans le logo/en-tête des pages
- Caractères recommandés: < 30 caractères

**Champ "Nom officiel":**
- Nom complet pour les documents formels
- Exemple: "École Moderne Internationale"
- Utilisé dans les certificats, rapports imprimés
- Caractères recommandés: < 100 caractères

### 2.4 Affichage du Logo

**Paramètre "Afficher le texte du logo":**
- Cochez pour afficher le nom à côté du logo
- Décochez pour afficher uniquement le logo
- Utile si votre logo contient déjà le texte du nom

**Aperçu en direct:**
- La section "Aperçu" montre comment les paramètres s'affichent
- Montre le logo, les couleurs, et le texte choisis
- Se met à jour automatiquement au fur et à mesure de vos modifications

### 2.5 Sauvegarder les Modifications

En bas de la section Branding:
1. Vérifiez vos modifications dans l'aperçu
2. Cliquez sur le bouton "Enregistrer" (couleur primaire)
3. Une notification apparaît: "Branding mis à jour avec succès!"
4. Les changements s'appliquent immédiatement à toute l'application

**Si erreur:**
- Cliquez sur "Réinitialiser" pour annuler les modifications
- Vérifiez la taille du fichier (< 5 MB)
- Vérifiez le format de l'image (PNG, JPG, etc.)
- Consultez [FAQ](#faq) pour plus d'aide

---

## <a id="système"></a>3. Onglet Système

Cet onglet configure les paramètres système de votre établissement.

### 3.1 Localisation

**Langue:**
- Options: Français, English, Español, Deutsch, Português
- Affecte l'interface de l'application
- Les utilisateurs peuvent aussi changer leur langue personnelle

**Fuseau horaire:**
- Sélectionnez le fuseau horaire de votre région
- Affecte l'affichage de l'heure dans l'application
- Options:
  - UTC-5 (America/New_York - New York/Toronto)
  - UTC-6 (America/Chicago - Chicago/Mexico)
  - UTC+0 (Europe/London - Royaume-Uni)
  - UTC+1 (Europe/Paris - Paris/Berlin)
  - UTC+2 (Africa/Cairo - Afrique du Nord)
  - UTC+5:30 (Asia/Kolkata - Inde)
  - UTC+8 (Asia/Shanghai - Asie du Sud-Est)
  - UTC+12 (Pacific/Auckland - Nouvelle-Zélande)

**Locale:**
- Code pour le formatage des dates et heures
- Exemple: "fr-FR" pour format français
- Affecte: Dates, heures, nombres, monnaies

### 3.2 Horaires Scolaires

**Heure de début de journée:**
- Format: HH:MM (24h)
- Exemple: 08:00 pour 8h du matin
- Utilisé pour les calculs de présence/absence

**Heure de fin de journée:**
- Format: HH:MM (24h)
- Exemple: 16:00 pour 4h de l'après-midi
- Utilisé pour marquer la fin de la journée

**Durée d'une séance de classe:**
- En minutes (ex: 50, 60, 90)
- Utilisé pour planifier les horaires
- Affecte la durée des cours

**Durée des pauses entre séances:**
- En minutes (ex: 10, 15, 30)
- Utilisé pour planifier les horaires
- Crée les espaces entre les cours

**Exemple:**
```
Début: 08:00
Fin: 16:00
Durée séance: 50 minutes
Pause: 10 minutes

Emploi du temps:
08:00-08:50 - Cours 1
08:50-09:00 - Pause
09:00-09:50 - Cours 2
09:50-10:00 - Pause
...
```

### 3.3 Finance

**Devise:**
- Sélectionnez la devise monétaire de votre établissement
- Options: USD ($), EUR (€), GBP (£), CAD (C$), AUD (A$)
- Affecte l'affichage des montants dans les modules de finance
- Utilisé dans les factures, paiements, etc.

**Année fiscale:**
- Sélectionnez le calendrier fiscal
- Options:
  - **JAN-DEC**: Janvier à Décembre (année civile)
  - **APR-MAR**: Avril à Mars (fiscal traditionnel UK)
  - **AUG-JUL**: Août à Juillet (universitaire)
  - **SEP-AUG**: Septembre à Août (universitaire commune)
  - **JUL-JUN**: Juillet à Juin (universitaire Asie)

**Utilisé pour:**
- Rapports financiers
- Budgets annuels
- Planification scolaire

### 3.4 Fonctionnalités

Activez ou désactivez les fonctionnalités pour votre établissement:

**Notifications:**
- Activé: Les utilisateurs reçoivent les notifications
- Désactivé: Pas de notifications (utile en phase de test)

**Accès API:**
- Activé: Les applications tierces peuvent se connecter
- Désactivé: API fermée aux externes

**Analyses avancées:**
- Activé: Rapports détaillés et statistiques avancées
- Désactivé: Rapports basiques uniquement

**Fonctionnalités IA:**
- Activé: Assistant IA, suggestions, analyse prédictive
- Désactivé: Pas de fonctionnalités basées sur l'IA

### 3.5 Assiduité

**Marquer automatiquement les absents:**
- Activé: Marquer absent automatiquement après l'heure de début
- Désactivé: Manuel uniquement

**Exiger une justification:**
- Activé: L'absence requiert une raison
- Désactivé: Absence enregistrée sans raison

### 3.6 Sauvegarder les Modifications

1. Modifiez les paramètres souhaités
2. Cliquez sur "Enregistrer" (bouton en bas)
3. Notification de succès apparaît
4. Changements appliqués immédiatement

---

## <a id="établissement"></a>4. Onglet Établissement

Configurez les informations de base de votre établissement:
- Nom
- Type (école, lycée, université, etc.)
- Email de contact
- Téléphone
- Adresse
- Site web

---

## <a id="notation"></a>5. Onglet Notation

Configurez le système de notation:
- Barème de notation
- Note minimale de passage
- Utiliser notes lettres (A, B, C, etc.)
- Afficher le classement des élèves
- Afficher la moyenne de classe

---

## <a id="assiduité"></a>6. Onglet Assiduité

Configurez le suivi de la présence:
- Politique d'absence
- Justifications requises
- Rapports d'assiduité

---

## <a id="faq"></a>7. FAQ et Dépannage

### Q: Le logo ne s'affiche pas après l'upload

**R:** Vérifiez que:
1. Le fichier est un format d'image valide (PNG, JPG, WebP)
2. La taille du fichier est < 5 MB
3. Actualisez la page (F5 ou Ctrl+R)
4. Videz le cache du navigateur (Ctrl+Shift+Delete)
5. Vérifiez la console du navigateur pour les erreurs (F12)

### Q: Mes modifications ne s'affichent pas immédiatement

**R:** Les modifications sont appliquées en temps réel dans:
- Votre session actuelle (immédiat)
- Autres sessions/onglets (2-5 secondes via synchronisation)

Si plus de 5 secondes:
1. Actualisez la page
2. Videz le cache (Ctrl+Shift+Delete)
3. Vérifiez votre connexion Internet

### Q: Puis-je changer le logo sans changer d'autres paramètres?

**R:** Oui! Vous pouvez modifier un paramètre à la fois:
1. Modifiez juste le logo
2. Cliquez "Enregistrer"
3. D'autres paramètres restent inchangés

### Q: Que se passe-t-il si j'annule avec "Réinitialiser"?

**R:** Le bouton "Réinitialiser":
- Annule toutes les modifications **non sauvegardées** dans la section actuelle
- Ne supprime **pas** les paramètres sauvegardés précédemment
- Restaure juste le formulaire à son état lors du chargement de la page

### Q: Quel fuseau horaire dois-je choisir?

**R:** Choisissez le fuseau horaire où se trouve votre établissement:
- **France, Belgique, Suisse**: Europe/Paris
- **Royaume-Uni**: Europe/London
- **Allemagne, Autriche**: Europe/Berlin
- **USA Est**: America/New_York
- **USA Centre**: America/Chicago
- **Inde**: Asia/Kolkata
- **Asie du Sud-Est**: Asia/Shanghai
- **Nouvelle-Zélande**: Pacific/Auckland

### Q: Puis-je revenir à la configuration par défaut?

**R:** Pour revenir aux paramètres par défaut:
1. Notez les paramètres actuels (capture d'écran)
2. Cliquez "Réinitialiser" (ceci annule juste les modifs non sauvegardées)
3. Pour revenir vraiment en arrière, modifiez chaque paramètre manuellement
4. Ou contactez le support technique (SUPER_ADMIN)

### Q: Mes couleurs ne s'affichent pas correctement

**R:** Vérifiez le format des codes hex:
- Doit commencer par # (ex: #FF0000)
- 6 caractères après # (RR, GG, BB)
- Caractères valides: 0-9, A-F

Exemples valides:
- ✅ #FF0000 (rouge)
- ✅ #ff0000 (rouge, minuscules OK)
- ❌ #FFFF (incomplet)
- ❌ #GGGGGG (G non valide)

### Q: Le bouton "Enregistrer" est grisé

**R:** Le bouton est grisé si:
- Aucun changement n'a été fait
- Données en train d'être sauvegardées (isUpdating)
- Erreur de validation

Solution:
1. Modifiez au moins un paramètre
2. Attendez la fin de la sauvegarde précédente
3. Vérifiez les messages d'erreur

### Q: Combien de temps les modifications prennent-elles effet?

**R:** Les modifications s'appliquent:
- **Immédiatement**: Dans votre session (< 1 seconde)
- **Très vite**: Dans les autres sessions (2-5 secondes via synchro temps réel)
- **Maximum**: Tous les utilisateurs voient les changements en < 5 secondes

### Q: Puis-je télécharger à nouveau sans supprimer l'ancien logo?

**R:** Oui, télécharger un nouveau logo:
1. Remplace automatiquement l'ancien
2. L'ancien fichier reste en stockage (optimisation)
3. Aucune suppression manuelle nécessaire

### Q: Y a-t-il des rôles qui peuvent modifier partiellement les paramètres?

**R:** Actuellement:
- **SUPER_ADMIN**: Accès complet
- **TENANT_ADMIN**: Accès complet à ses paramètres

Les autres rôles (TEACHER, STUDENT, etc.) n'ont pas accès.

Contact support pour autres configurations.

### Q: Où mes changements sont-ils sauvegardés?

**R:** Les modifications sont sauvegardées:
- **Base de données**: Colonne `tenants.settings` (format JSONB)
- **Cache local**: 5 minutes pour performance
- **Supabase**: Synchronisation temps réel activée
- **Persistance**: Vos changements sont permanents

---

## 📞 Support

Si vous avez besoin d'aide:
1. Consultez cette documentation
2. Visitez la section FAQ ci-dessus
3. Contactez votre administrateur système
4. Ou consultez le guide technique (DYNAMIC_SETTINGS_SYSTEM_GUIDE.md)

**Dernière mise à jour**: Janvier 2025  
**Version**: 1.0
