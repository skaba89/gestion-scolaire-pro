# État de préparation commerciale — SchoolFlow Pro

Document de référence pour l'équipe commerciale. Reflète l'état réel du
produit à date, pas une promesse marketing.

## 1. Produit

SchoolFlow Pro est une plateforme SaaS de gestion scolaire et
universitaire pensée pour les réalités africaines : multi-établissements,
mobile-first, faible connexion, paiements locaux (Mobile Money, Orange
Money, Wave), supervision institutionnelle et reporting national.

## 2. Cible

- Écoles privées (primaire, collège, lycée).
- Universités et grandes écoles (mode université déjà pris en charge : ECTS, relevés de notes multi-périodes).
- À moyen terme : institutions publiques et ministères de l'éducation (roadmap, voir `docs/MINISTRY_DASHBOARD_READINESS.md`).

## 3. Fonctionnalités clés

- Gestion élèves, enseignants, classes, matières, présences, notes, bulletins.
- Facturation, paiements (manuel + Mobile Money/Orange Money/Wave via CinetPay/PayTech), reçus numérotés.
- Portail parent, dashboard direction, import Excel élèves.
- Multi-tenant strict (isolation vérifiée par tests), JWT + MFA, RLS PostgreSQL.
- 5 langues (français par défaut), PWA installable.

## 4. Ce qui est prêt (vendable dès aujourd'hui)

- Onboarding établissement (jusqu'à l'étape 3/4 vérifiée automatiquement — la signature manuscrite finale reste à valider manuellement une fois par un humain).
- Gestion élèves/enseignants/classes/notes/présences.
- Paiement manuel contrôlé, reçu numéroté, annulation tracée, historique, relance impayés, dashboard financier, export CSV.
- Import Excel élèves (modèle, aperçu, validation, rapport).
- Dashboard direction (élèves à risque, impayés, présence, notes).
- Portail parent.
- Sécurité : logout-all fonctionnel, MFA, RLS, aucune fuite de donnée personnelle publique connue.

## 5. Ce qui est en bêta

- Paiement en ligne (Mobile Money/Orange Money/Wave) : codé et sécurisé (signature webhook vérifiée) mais jamais exercé avec un compte marchand réel — à valider avec le premier client payant en ligne.
- Reporting institutionnel/ministère : agrégats nationaux et régionaux fonctionnels et testés ; préfecture/commune non construites.
- Dashboard direction : quelques KPI marginaux non branchés (nombre de cours actifs, collègues) — n'affecte pas l'argumentaire principal.

## 6. Ce qui n'est pas encore prêt

- Import Excel Enseignants/Parents (le mapping de colonnes existe pour les enseignants, mais aucun endpoint fonctionnel).
- Alertes automatiques (5xx, paiement échoué, import échoué, backup échoué) — tout se surveille manuellement à ce jour.
- Rôles institutionnels préfecture/commune/université (roadmap 90 jours).
- Monitoring par tenant ventilé (les données existent en partie, pas de dashboard support unifié).

## 7. Offre pilote

Gratuite ou à tarif préférentiel, 4 à 8 semaines, sans engagement — voir
le modèle complet dans `docs/CONTRAT_PILOTE.md`. Objectif : valider
l'adéquation produit avant tout engagement commercial ferme.

## 8. Offre école privée

Starter / Standard / Premium selon la taille de l'établissement (jusqu'à
50 / 300 / 1000 élèves respectivement) — grille tarifaire visible
directement sur la landing page publique de la plateforme.

## 9. Offre université

Couverte par l'offre Premium ou une offre Enterprise sur-mesure selon la
taille — le mode université (ECTS, structure académique générique,
relevé de notes multi-périodes) est déjà fonctionnel et testé.

## 10. Offre ministère

Positionnement Enterprise, en construction — ne pas vendre de promesse
ferme sur les fonctionnalités préfecture/commune tant qu'elles ne sont
pas livrées (voir roadmap `docs/MINISTRY_DASHBOARD_READINESS.md`).

## 11. Prérequis techniques

- Connexion internet (même faible/instable — la plateforme retente automatiquement les requêtes en lecture sur coupure réseau).
- Navigateur récent (Chrome, Firefox, Safari, Edge).
- Aucune installation cliente requise (SaaS pur), PWA installable en option sur mobile.

## 12. Support

Voir `docs/SUPPORT_RUNBOOK.md` pour les procédures opérationnelles.
Niveaux de support détaillés dans `docs/SLA.md` selon l'offre souscrite.

## 13. Formation

Non formalisée dans cette phase — recommandation : une session initiale
d'1/2 journée pour le secrétariat/administration (import des données,
prise en main du dashboard), une session courte pour les enseignants
(présence, notes), aucune formation nécessaire côté parents (portail
auto-explicatif).

## 14. Sauvegarde

Sauvegarde automatique quotidienne, chiffrée, vérifiée par checksum
avant publication — voir `docs/BACKUP_SETUP.md` et `docs/DRP_GUIDE.md`.
Rétention selon l'offre (voir `docs/SLA.md`).

## 15. Sécurité

Multi-tenant strict (RLS PostgreSQL + filtrage applicatif systématique),
JWT avec révocation immédiate (logout/logout-all vérifiés en conditions
réelles), MFA disponible, aucune donnée personnelle exposée publiquement
(vérifié et corrigé lors de l'audit dynamique le plus récent). Détail
complet dans `docs/SECURITY_MODEL.md`.

**Point de vigilance à ne jamais oublier en négociation commerciale** :
le rôle PostgreSQL de production doit être vérifié comme non-
superutilisateur avant tout engagement à grande échelle (sinon RLS ne
protège pas réellement en production) — point technique interne, jamais
à évoquer devant un client, mais à faire vérifier par l'équipe technique
avant signature d'un contrat à fort volume.

## 16. SLA recommandé

Voir `docs/SLA.md` — disponibilité 99% (Standard) à 99.9% (Enterprise),
délais de support par sévérité, RTO 4h/RPO 24h.

## 17. Questions fréquentes

**Nos données sont-elles isolées des autres écoles ?**
Oui — chaque établissement a son propre espace, techniquement isolé
(vérifié par des dizaines de tests automatisés qui prouvent qu'aucune
fuite n'est possible entre établissements).

**Peut-on payer par Mobile Money ?**
Oui pour le paiement des frais scolaires par les parents (Orange Money,
Wave via agrégateur) — en cours de validation avec le premier client
réel. Le paiement manuel contrôlé fonctionne dès aujourd'hui sans aucune
restriction.

**Que se passe-t-il si on veut migrer nos données existantes ?**
L'import Excel des élèves est prêt et testé. L'import enseignants/parents
est sur la roadmap courte — nous accompagnons la migration au cas par
cas en attendant.

**Peut-on essayer avant de payer ?**
Oui, 30 jours d'essai Pro complet sans carte bancaire à l'inscription.

**Que se passe-t-il si internet coupe pendant l'utilisation ?**
Les lectures échouées sont automatiquement retentées ; les actions qui
modifient des données (paiement, inscription) ne sont jamais rejouées
automatiquement pour éviter tout doublon — l'utilisateur relance
manuellement si besoin.
