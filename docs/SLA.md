# Accord de niveau de service (SLA) — Academy Guinéenne

Ce document définit les engagements de service pour les établissements
abonnés à Academy Guinéenne. Il s'applique aux offres Standard, Premium et
Enterprise (voir grille tarifaire) ; l'offre Starter bénéficie d'un support
best-effort sans engagement de délai contractuel.

## 1. Disponibilité

| Offre | Disponibilité mensuelle cible | Fenêtre de maintenance |
|---|---|---|
| Starter | Best-effort | Annoncée 48h à l'avance |
| Standard | 99,0 % | Annoncée 48h à l'avance |
| Premium | 99,5 % | Annoncée 72h à l'avance, hors heures de classe |
| Enterprise | 99,9 % | Sur accord contractuel spécifique |

La disponibilité est mesurée sur `/health/ready` (base de données, cache,
stockage tous connectés) hors fenêtres de maintenance planifiées et hors
cas de force majeure (coupure réseau/électrique nationale, catastrophe
naturelle).

## 2. Support et délais de réponse

| Sévérité | Définition | Standard | Premium | Enterprise |
|---|---|---|---|---|
| Critique (P1) | Plateforme inaccessible, perte de données | 4h ouvrées | 2h ouvrées | 1h, 7j/7 |
| Majeur (P2) | Fonctionnalité clé indisponible (paiement, bulletin) | 1 jour ouvré | 4h ouvrées | 2h ouvrées |
| Mineur (P3) | Anomalie sans blocage | 3 jours ouvrés | 1 jour ouvré | 4h ouvrées |
| Question / demande | Support fonctionnel | 3 jours ouvrés | 1 jour ouvré | 1 jour ouvré |

Heures ouvrées : lundi-vendredi, 8h-18h (Africa/Conakry), hors jours
fériés guinéens. Enterprise bénéficie d'une astreinte 24h/7j pour les
incidents P1 uniquement.

## 3. Sauvegarde et reprise après sinistre

- Sauvegarde automatique quotidienne, chiffrée, avec vérification
  d'intégrité (checksum) avant publication — voir `docs/BACKUP_SETUP.md`.
- Rétention : 30 jours glissants (Standard/Premium), 90 jours (Enterprise).
- Objectif de délai de restauration (RTO) : 4h pour un incident isolé,
  24h pour un sinistre majeur nécessitant une reconstruction complète.
- Objectif de perte de données maximale (RPO) : 24h (dernière sauvegarde
  quotidienne réussie).
- Procédure de restauration documentée et testée : `docs/DRP_GUIDE.md`.

## 4. Sécurité et isolation des données

- Chaque établissement dispose d'un espace isolé (multi-tenant), aucune
  donnée n'est partagée entre établissements — voir
  `docs/SECURITY_MODEL.md` pour le détail technique.
- Aucune suppression physique des données de paiement — traçabilité
  complète et permanente.
- Notification de toute violation de données avérée sous 72h, conformément
  aux standards RGPD, même si l'établissement n'est pas basé en Europe.

## 5. Ce qui n'est PAS couvert par ce SLA

- Perte de connexion internet locale de l'établissement.
- Erreur de saisie ou de configuration par le personnel de l'établissement.
- Utilisation de navigateurs non supportés (versions obsolètes).
- Interruption due à une intégration tierce (passerelle de paiement,
  service SMS) hors du contrôle direct de Academy Guinéenne — un
  contournement (paiement manuel vérifié) reste disponible dans tous les
  cas.

## 6. Crédits de service

En cas de non-respect de la disponibilité contractuelle sur un mois donné
(hors exclusions ci-dessus), un crédit est appliqué sur la facture
suivante : 5 % du montant mensuel par tranche de 0,5 point de disponibilité
manquante, plafonné à 50 % de la facture mensuelle. Le crédit s'applique
sur demande écrite du client dans les 30 jours suivant l'incident.

## 7. Évolution

Ce SLA peut être révisé avec un préavis de 30 jours pour les abonnements
en cours ; les modifications s'appliquent au renouvellement pour les
contrats à durée déterminée.
