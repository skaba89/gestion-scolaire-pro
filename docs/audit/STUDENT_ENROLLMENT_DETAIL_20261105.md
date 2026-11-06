# Inscription individuelle élève — 2026-11-05

## Défaut reproduit

Deux services frontend appelaient `GET /students/{student_id}/enrollment/`,
mais aucune opération backend ne correspondait à ce contrat. La fiche enfant
ne pouvait donc pas afficher de façon fiable la classe et l'année scolaire.
Elle assimilait en plus toute erreur HTTP, y compris une panne 503, à une
absence d'inscription.

Avant correctif : 7 échecs sur 10 tests backend et 2 échecs sur 30 tests
frontend ciblés. Trois scénarios 404 étaient faussement verts uniquement parce
que la route entière était absente.

## Contrat corrigé

- La route renvoie l'inscription demandée avec `classrooms`, `levels` et
  `academic_years`, conformément au contrat réellement consommé.
- Toutes les lectures sont limitées à l'établissement courant. La classe, le
  niveau et l'année doivent appartenir au même tenant ; l'année de la classe
  doit aussi correspondre à celle de l'inscription.
- Le personnel habilité lit les élèves du tenant. Un parent ne lit que ses
  enfants liés. Un élève ou ancien élève ne lit que sa propre fiche. Le rôle
  `STUDENT` n'obtient aucune permission globale supplémentaire.
- Une inscription absente renvoie 404, une panne SQL renvoie 503. Les services
  frontend convertissent uniquement un vrai 404 en `null` et propagent les
  autres erreurs.
- Les clés React Query de la fiche enfant incluent désormais le tenant ; une
  indisponibilité de l'inscription est affichée avec une alerte visible.

## Preuves locales avant PR

- Route et autorisations : 11 tests réussis.
- Régression élèves, parents et rôles : 48 réussites, 12 exclusions SQLite
  documentées.
- Services et fiche enfant : 33 tests frontend réussis.
- Frontend complet : 505 tests réussis dans 87 fichiers ; build de production
  réussi.
- TypeScript : 174 erreurs préexistantes ; cliquet abaissé de 178 à 174 puis
  revérifié à 174/174, aucune nouvelle erreur.
- ESLint global : 0 erreur, 1 899 avertissements préexistants.
- i18n : aucune clé française bloquante manquante.
- Contrat OpenAPI : 649 opérations ; 45 écarts distincts contre 46 avant,
  47 occurrences, 21 URL dynamiques non vérifiables.
- Matrice statique : 14 pages DÉFECTUEUSES, 23 À VÉRIFIER, 107 NON VÉRIFIÉES,
  3 avec parcours E2E et 24 non routées. Neuf pages quittent « À VÉRIFIER » ;
  `admin/Students.tsx` rejoint les pages avec parcours E2E.

Les résultats PostgreSQL et les six jobs du HEAD exact seront ajoutés à la PR ;
ils ne sont pas anticipés ici.

## Limites et retour arrière

- L'analyse de matrice reste statique : « NON VÉRIFIÉ » ne signifie pas que le
  comportement entier de la page a été recetté.
- La route sélectionne l'inscription la plus récente de l'année courante pour
  le statut demandé ; la normalisation historique des doublons reste un sujet
  de qualité de données distinct.
- Aucun schéma ni migration. Retour arrière applicatif uniquement.
- Aucun déploiement de production n'est autorisé par ce lot.
