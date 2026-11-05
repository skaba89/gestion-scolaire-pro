# Relevé officiel parent — 2026-11-05

## Défaut reproduit

La fiche enfant calculait toutes les moyennes dans le navigateur à partir de
notes et d'inscriptions chargées séparément, puis envoyait le nom de l'école,
l'identité, les années et les moyennes à `POST /parents/transcript/generate/`.
Cette route n'existait pas. Le bouton tournait puis affichait une erreur ; le
client aurait en outre pu modifier les valeurs d'un document d'apparence
officielle.

Tests avant correctif : 4 échecs backend, 4 échecs frontend. Un scénario 404
était vert uniquement parce que la route était absente ; il ne constituait pas
une preuve fonctionnelle.

## Contrat corrigé

- Le client envoie uniquement `{ student_id }`.
- Le serveur exige `grades:read`, résout l'établissement courant et vérifie le
  rattachement parent-enfant sur l'élève réel du même tenant.
- Les années proviennent des inscriptions de l'enfant et doivent posséder des
  périodes dans le même établissement.
- La réponse PDF réutilise `transcripts.build_transcript_data`, le même calcul
  que `GET /transcripts/{student_id}/` : matières identifiées par UUID,
  coefficients, seuil académique, moyennes non arrondies prématurément et ECTS.
- Les valeurs de base sont échappées avant rendu ; WeasyPrint produit un vrai
  `application/pdf`. Aucun HTML n'est écrit dans une nouvelle fenêtre.
- Une panne SQL renvoie 503 et une panne de rendu 500 ; aucun faux document
  vide n'est annoncé comme réussi.

## Preuves locales avant PR

- Relevé parent ciblé : 5 réussites SQLite, 1 test PostgreSQL réservé au CI.
- Relevés et calculs associés : 53 réussites, 14 exclusions SQLite documentées.
- Frontend service + écran : 13 réussites.
- TypeScript : 174 erreurs préexistantes, référence 178, aucune nouvelle erreur.
- ESLint global : 0 erreur, 1 899 avertissements préexistants (1 916 avant).
- Contrat OpenAPI : 648 opérations ; 46 écarts distincts, contre 47 avant.
- Matrice : `ChildDetail.tsx` passe de DÉFECTUEUX à À VÉRIFIER ; l'écart restant
  vient de `getStudentEnrollment`, méthode partagée et hors de ce lot.

Le test PostgreSQL réel doit encore confirmer le PDF et la moyenne historique
sur le HEAD exact de la PR. Les résultats CI seront ajoutés à la PR ; ils ne
sont pas anticipés ici.

## Limites et retour arrière

- Le document couvre les années pour lesquelles l'enfant possède une
  inscription et l'établissement au moins une période. Une année préparée sans
  période n'est pas imprimée.
- La politique de consentement parent pour un élève majeur reste à définir ; le
  contrôle actuel est le rattachement familial existant.
- Archivage, signature électronique, QR de vérification et cache offline du PDF
  restent hors périmètre.
- Aucun schéma ni migration. Retour arrière : restaurer l'application au commit
  de base ; aucun downgrade de base de données n'est nécessaire.
- Aucun déploiement de production n'est autorisé par ce lot.
