# PHASE 3b: Load Testing - Plan & Exécution

**Date:** January 27, 2026  
**Status:** IN PROGRESS ⏳  
**Objectif:** Tester la performance du système Badge avec 1000+ badges et 100+ utilisateurs concurrents

---

## 📊 PHASE 3b: Structure

### Étape 1: Préparer les données de test (1000+ badges)
### Étape 2: Configurer l'outil de load testing (k6)
### Étape 3: Exécuter les tests de charge
### Étape 4: Analyser les résultats
### Étape 5: Documenter les recommendations

---

## 🎯 Objectifs de Performance

| Métrique | Cible | Approche |
|----------|-------|----------|
| **Page Load** | < 1s | Vite + compression |
| **API Latency** | < 200ms | PostgREST optimization |
| **Badge Query** | < 100ms | Index database |
| **Concurrent Users** | 100+ | Connection pooling |
| **Memory Usage** | < 512MB | Efficient queries |
| **DB Connections** | < 20 | PgBouncer pool |

---

## 📝 Étapes de PHASE 3b

### ✅ Étape 1: Préparer les données test

Créer 1000+ définitions de badges (au lieu des 25 actuelles):

```bash
# Script pour insérer des badges supplémentaires
psql -U postgres -d postgres -h localhost << EOF
-- Insérer 975 badges supplémentaires (25 existent déjà = 1000 total)
WITH badge_batch AS (
  SELECT 
    'badge-' || i as id,
    'Badge #' || i as name,
    'Description du badge #' || i as description,
    ARRAY['PERFORMANCE', 'ACHIEVEMENT', 'ATTENDANCE', 'PARTICIPATION', 'CERTIFICATION'][((i-1) % 5) + 1] as type,
    ARRAY['Circle', 'Ribbon', '3D', 'Minimalist', 'Animated'][((i-1) % 5) + 1] as template,
    ARRAY['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'][((i-1) % 5) + 1] as rarity,
    jsonb_build_object(
      'min_grade', 80 + (i % 20),
      'min_days_active', 10 + (i % 30)
    ) as requirements,
    'sorbonne-tenant-id' as tenant_id,
    'active' as status,
    NOW() as created_at
  FROM generate_series(26, 1000) AS t(i)
)
INSERT INTO badges_definitions 
(id, name, description, type, template, rarity, requirements, tenant_id, status, created_at)
SELECT * FROM badge_batch
ON CONFLICT (id) DO NOTHING;

SELECT COUNT(*) FROM badges_definitions;
EOF
```

### ✅ Étape 2: Configurer k6 pour Load Testing

**Installer k6:**
```bash
# Windows: via Chocolatey
choco install k6

# OU télécharger de https://github.com/grafana/k6/releases
```

### ✅ Étape 3: Scripts de test charge

**Créer: `load-tests/badges-load.js`**

```javascript
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Métriques personnalisées
const errorRate = new Rate('errors');
const badgeLoadTime = new Trend('badge_load_time');
const badgeListTime = new Trend('badge_list_time');
const requestCount = new Counter('requests');
const activeUsers = new Gauge('active_users');

// Configuration
const BASE_URL = 'http://localhost:8000';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY4Njc3Mzk3LCJleHAiOjIwODQwMzczOTd9.cy_NIuDqX_LcCTwokeNqXUyD4G8dNi12NfTLCo2s72M';

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp-up to 10 users
    { duration: '1m', target: 50 },    // Ramp-up to 50 users
    { duration: '2m', target: 100 },   // Ramp-up to 100 users
    { duration: '1m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 0 },    // Ramp-down
  ],
  thresholds: {
    errors: ['rate<0.1'],                    // Error rate must be < 10%
    badge_load_time: ['p(95)<500'],          // 95% of requests < 500ms
    badge_list_time: ['p(95)<1000'],         // List requests < 1s
  },
};

export default function () {
  activeUsers.add(1);
  
  group('Get Badge List', () => {
    const startTime = new Date();
    const res = http.get(
      `${BASE_URL}/rest/v1/badges_definitions?limit=100`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }
    );
    const duration = new Date() - startTime;
    
    badgeListTime.add(duration);
    requestCount.add(1);
    
    check(res, {
      'status is 200': (r) => r.status === 200,
      'has body': (r) => r.body.length > 0,
      'response time < 1s': (r) => duration < 1000,
    }) || errorRate.add(1);
  });

  group('Get Single Badge', () => {
    const badgeId = `badge-${Math.floor(Math.random() * 1000) + 1}`;
    const res = http.get(
      `${BASE_URL}/rest/v1/badges_definitions?id=eq.${badgeId}`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }
    );
    
    badgeLoadTime.add(res.timings.duration);
    requestCount.add(1);
    
    check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500,
    }) || errorRate.add(1);
  });

  sleep(1);
  activeUsers.add(-1);
}
```

### ✅ Étape 4: Exécuter les tests

```bash
# Run basic load test
k6 run load-tests/badges-load.js

# Run with summary output
k6 run --summary-export=load-tests/summary.json load-tests/badges-load.js

# Run with verbose output
k6 run --vus 50 --duration 30s load-tests/badges-load.js
```

### ✅ Étape 5: Analyser les résultats

Les métriques clés à analyser:
- **Error Rate** - Doit être < 10%
- **P95 Latency** - Doit être < 500ms
- **Throughput** - Requêtes/sec
- **Memory Growth** - Doit rester stable
- **CPU Usage** - Doit rester < 80%

---

## 🔧 Optimisations À Appliquer

### 1. Database Indexing
```sql
-- Optimiser les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_badges_tenant_id ON badges_definitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_tenant_id ON user_badges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_badge_unlock_logs_user_id ON badge_unlock_logs(user_id);
```

### 2. Query Optimization
```sql
-- Utiliser EXPLAIN ANALYZE pour identifier les slow queries
EXPLAIN ANALYZE 
SELECT * FROM badges_definitions 
WHERE tenant_id = 'sorbonne-tenant-id' 
LIMIT 100;
```

### 3. Cache Strategy
- Redis pour les badges definitions (rarement changent)
- In-memory cache pour les utilisateur badges (invalidation basée sur events)
- HTTP caching headers

### 4. Connection Pooling
- PgBouncer déjà configuré
- Pool size: 20 connexions max
- Mode: transaction pooling

---

## 📈 Métriques Attendues

Après optimisation:

| Métrique | Avec 100 users | Avec 1000 users |
|----------|---|---|
| Page Load Time | 500-800ms | 800-1200ms |
| API Latency | 50-100ms | 100-200ms |
| Error Rate | < 1% | < 5% |
| DB Connections Used | 10-15 | 18-20 |
| Memory (Backend) | 180MB | 250MB |
| CPU Usage | 30-40% | 60-70% |

---

## 🚀 Prochaines Étapes

1. **Créer les données test** (1000 badges)
2. **Installer k6** sur la machine
3. **Exécuter load tests** avec 100 utilisateurs
4. **Analyser les résultats**
5. **Appliquer optimisations**
6. **Re-tester** et valider
7. **Documenter les findings**

---

## ✅ Success Criteria

PHASE 3b est complète quand:

✅ 1000+ badges en base de données  
✅ K6 load tests exécutés avec succès  
✅ Système stable sous 100 utilisateurs concurrents  
✅ Error rate < 5%  
✅ P95 latency < 1s  
✅ Rapport de performance généré  
✅ Optimisations documentées  

---

**Status:** Ready to begin execution  
**Estimated Duration:** 60-90 minutes  
**Next Phase:** PHASE 3c - Mobile Testing

