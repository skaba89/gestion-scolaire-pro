# Guide de Reprise d'Activité (DRP) : SchoolFlow Pro

Ce document définit les procédures nécessaires pour garantir la continuité des services éducatifs et la protection des données en cas de sinistre technique majeur.

## 💾 1. Stratégie de Sauvegarde

### Base de Données (PostgreSQL)
Il est impératif d'utiliser `pg_dump` pour des extractions quotidiennes.
- **Commande recommandée** :
  ```bash
  docker exec -t schoolflow-db pg_dump -U postgres > backup_$(date +%Y%m%d).sql
  ```
- **Rétention** :
  - 7 derniers jours (Quotidiens)
  - 4 dernières semaines (Hebdomadaires)
  - 12 derniers mois (Mensuels)

### Fichiers (Storage)
Le dossier `storage-data` défini dans le volume Docker contient tous les documents administratifs et académiques. Un backup par synchronisation (`rsync`) vers un stockage distant sécurisé est requis.

---

## 🔄 2. Procédure de Restauration (Disaster Recovery)

En cas de perte totale du serveur :

1.  **Réinstallation de l'OS** (Linux recommandé).
2.  **Restauration des sources** : Cloner le dépôt et restaurer le fichier `.env` sécurisé.
3.  **Démarrage de l'infrastructure** :
    ```bash
    docker compose up -d
    ```
4.  **Injection des données** :
    ```bash
    cat backup_latest.sql | docker exec -i schoolflow-db psql -U postgres
    ```
5.  **Vérification de l'intégrité** : Consulter le Dashboard Ministry pour valider que les agrégats sont corrects.

---

## 🛡️ 3. Continuité Haute Disponibilité (HA)

Pour les déploiements nationaux à forte charge :
- **Réplication** : Utiliser un mode "Hot Standby" pour la base de données.
- **Load Balancing** : Déployer plusieurs instances du service `supabase-kong` derrière un équilibreur de charge matérielle institutionnel.

---

## 📞 4. Contacts d'Urgence
- **Équipe DevOps Régionale** : [Numéro/Email]
- **Support Niveau 3 (Souveraineté)** : admin@schoolflow.example.com
