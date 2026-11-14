# Administrer les modules d'un établissement

Dans **Administration → Paramètres → Modules pédagogiques**, l'administrateur
choisit le profil de son établissement parmi les neuf types du catalogue. Les
niveaux proposés à la création sont modifiables ; un changement de profil ne
remplace jamais les niveaux ni les données déjà enregistrées.

1. Choisir un profil, puis ajuster les interrupteurs. Les dépendances ajoutées
   ou retirées apparaissent dans le brouillon avant validation.
2. Cliquer **Prévisualiser les changements** : aucune donnée n'est modifiée.
   Vérifier les activations et désactivations proposées, notamment pour les
   établissements historiques encore en mode de compatibilité.
3. Cliquer **Appliquer cet aperçu**. Le serveur vérifie les permissions, les
   dépendances et la révision. Si un collègue a modifié la configuration,
   recharger puis préparer un nouvel aperçu ; aucun écrasement automatique.
4. Consulter le **Journal d'audit** depuis cet écran. Les actions
   `INITIALIZE_EDUCATION_MODULES` et `CONFIGURE_EDUCATION_MODULES` indiquent
   l'auteur, la date, le profil, la révision et les modules modifiés.

Le socle commun reste actif : authentification, utilisateurs, établissements,
sécurité, finances, notifications/communication, audit et reporting. Activer un
module n'accorde pas de permissions supplémentaires. Les enseignants, parents
et élèves conservent leurs rôles et périmètres existants.

Désactiver un module retire ses entrées de navigation et bloque ses API métier,
y compris les alias concernés. Les notes, inscriptions, paiements, emprunts et
comptes existants sont conservés. Le reporting du socle garde l'accès autorisé
aux historiques. La réactivation restaure l'accès selon les droits existants.
Les abonnements et quotas continuent à s'appliquer séparément.

Les profils « mixte » et « professionnel » sont créables, avec un seul dossier
administratif par établissement. Ce premier lot n'autorise pas encore des
politiques différentes selon le cycle ni des permissions individuelles par cycle.
L'évaluation par compétences reste indisponible. Les périodes du catalogue sont
indicatives ; elles ne modifient pas le calcul existant des bulletins sur 20.

Une erreur de chargement masque les pages optionnelles ; les réglages ne sont
pas enregistrés dans le cache hors ligne. Après une désactivation pendant une
coupure, le serveur refuse les nouvelles opérations à la reconnexion. Les
brouillons refusés suivent la rétention existante de l'outbox (24 heures après
résolution) ; le lot ne constitue pas un archivage permanent des brouillons.
