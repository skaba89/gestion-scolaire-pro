# 📱 ÉTAPE 9-10: Tests Mobile & Performance

**Durée estimée:** 2-3 heures  
**Objectif:** Tests build mobile et performance globale  
**Date:** 26 janvier 2026

---

## 📋 Résumé ÉTAPE 9-10

### ÉTAPE 9: Build Mobile
- ✅ Générer APK Android
- ✅ Générer IPA iOS (optionnel)
- ✅ Tester app mobile sur appareil/émulateur
- ✅ Vérifier synchronisation données

### ÉTAPE 10: Performance & Finales
- ✅ Tests charges (100+ utilisateurs)
- ✅ Performance temps de réponse
- ✅ Tests sécurité avancés
- ✅ Rapport final de test

---

## 🧪 ÉTAPE 9: Build Mobile

### 9.1: Préparer Build Android (APK)

**Prérequis:**
```
✅ Android SDK installé (ou l'être)
✅ Java JDK installé
✅ Capacitor CLI: npm install -g @capacitor/cli
```

**Vérifier Capacitor:**
```bash
cd c:\Users\cheic\Documents\EduSchool\schoolflow-pro
npx capacitor --version
```

Attendu: `@capacitor/cli 6.x.x`

**Vérifications:**
```
[ ] Capacitor CLI accessible
[ ] Version 6.x ou supérieure
[ ] Node modules installés
```

---

### 9.2: Générer Build Web Optimisé

**Avant de créer APK, créer build web:**

```bash
npm run build
```

Attendu:
```
✅ Build réussi
✅ Fichiers dist/ générés
✅ Pas d'erreurs TypeScript
```

**Vérifications:**
```
[ ] Build sans erreurs
[ ] dist/ contient index.html
[ ] Assets optimisés
[ ] Taille raisonnable (< 5MB gzip)
```

**Résultats:**
```
✅ Build web OK
✅ Prêt pour mobile
```

---

### 9.3: Synchroniser avec Capacitor Android

**Copier build dans Android:**

```bash
npx capacitor copy android
```

Attendu:
```
✅ Fichiers copiés
✅ Pas d'avertissements critiques
```

**Vérifications:**
```
[ ] Commande exécutée
[ ] Pas d'erreurs
[ ] Android/app/src/main/assets/public contient fichiers
```

---

### 9.4: Générer APK Unsigned

**Ouvrir Android Studio (ou utiliser gradle):**

**Option A: Android Studio**
```
1. Ouvrir android/ dossier
2. Attendre indexation
3. Build → Generate Signed Bundle / APK
4. APK Release (unsigned)
5. Générer
```

**Option B: Terminal Gradle**
```bash
cd c:\Users\cheic\Documents\EduSchool\schoolflow-pro\android
.\gradlew assembleRelease
```

Attendu:
```
✅ APK généré: android/app/release/app-release-unsigned.apk
✅ Taille: 10-20 MB
```

**Vérifications:**
```
[ ] APK généré
[ ] Fichier existe
[ ] Taille normale (10-50 MB)
```

**Résultats:**
```
✅ APK unsigned généré
✅ Prêt pour test
```

---

### 9.5: Tester sur Émulateur Android

**Ouvrir l'émulateur:**

```bash
# Vérifier appareils disponibles
adb devices

# Lancer émulateur (si pas actif)
emulator -avd [NOM_AVD] -netdelay none -netspeed full
```

**Installer APK:**

```bash
adb install -r android/app/release/app-release-unsigned.apk
```

Attendu:
```
✅ Installation réussie
✅ "Success" message
```

**Vérifications:**
```
[ ] APK installé
[ ] App visible sur émulateur
[ ] Icon affiché
```

---

### 9.6: Tester App Mobile

**Lancer l'app sur émulateur:**

**Tests à effectuer:**

1. **Démarrage:**
   ```
   [ ] App se lance
   [ ] Splash screen affichée (optionnel)
   [ ] Pas de crash
   ```

2. **Écran de connexion:**
   ```
   [ ] Interface bien dimensionnée
   [ ] Champs saisis facilement
   [ ] Clavier virtuel s'affiche
   [ ] Bouton "Connexion" tapable
   ```

3. **Connexion:**
   ```
   Email: admin@sorbonne.fr
   Mot de passe: Sorbonne@2025!
   
   [ ] Connexion réussie
   [ ] Pas de timeout
   [ ] Dashboard affiché
   ```

4. **Navigation Mobile:**
   ```
   [ ] Menu burger accessible
   [ ] Sections glissables
   [ ] Bouttons tapables (padding OK)
   [ ] Pas de défilement horizontal involontaire
   ```

5. **Affichage Responsive:**
   ```
   [ ] Texte lisible (pas trop petit)
   [ ] Images redimensionnées
   [ ] Tableaux scrollables (mobile)
   [ ] Pas d'overlaps
   ```

6. **Fonctionnalités Clés:**
   ```
   [ ] Voir les classes (navigation)
   [ ] Voir les utilisateurs (liste scrollable)
   [ ] Afficher détails (modal/page)
   [ ] Retour fonctionne (back button)
   ```

7. **Performance Mobile:**
   ```
   [ ] Pas de lags/stuttering
   [ ] Transition fluide
   [ ] Temps chargement < 3s par écran
   [ ] Batterie/CPU raisonnable (pas chauffage)
   ```

8. **Connectivité:**
   ```
   [ ] Synchronise avec backend
   [ ] Données à jour
   [ ] Pas de CORS errors
   [ ] WebSocket connecté (si realtime)
   ```

**Résultats:**
```
✅ App fonctionnelle sur mobile
✅ Interface responsive
✅ Performance acceptable
✅ Pas de crashs
```

---

### 9.7: Build iOS (Optionnel)

**Si on Mac/iOS disponible:**

```bash
npx capacitor copy ios
npx capacitor open ios
```

**Puis Xcode:**
```
1. Ouvrir ios/ dans Xcode
2. Sélectionner target device
3. Créer signing certificate
4. Build → Archive
5. Générer IPA
```

**Tests similaires à Android**

---

## 🧪 ÉTAPE 10: Performance & Finales

### 10.1: Test de Charge (Utilisateurs Multiples)

**Objectif:** Simuler 100+ utilisateurs simultanés

**Outil: Apache JMeter ou Locust**

**Installation (Python Locust):**

```bash
pip install locust
```

**Créer locustfile.py:**

```python
from locust import HttpUser, task, between

class SchoolFlowUser(HttpUser):
    wait_time = between(1, 3)
    
    @task
    def login(self):
        self.client.post("/auth/v1/token", json={
            "email": "admin@sorbonne.fr",
            "password": "Sorbonne@2025!"
        })
    
    @task
    def list_students(self):
        self.client.get("/rest/v1/students?select=*")
    
    @task
    def list_grades(self):
        self.client.get("/rest/v1/grades?select=*")
```

**Lancer test:**

```bash
locust -f locustfile.py -u 100 -r 10 -t 5m -H http://localhost:8000
```

**Paramètres:**
- `-u 100`: 100 utilisateurs
- `-r 10`: 10 utilisateurs/sec
- `-t 5m`: 5 minutes
- `-H`: Host API

**Résultats attendus:**

```
Metrics:
  - Response time (p50): < 200ms
  - Response time (p95): < 500ms
  - Response time (p99): < 1000ms
  - Error rate: < 1%
  - Requests/sec: > 100
  - Throughput stable
```

**Vérifications:**
```
[ ] Test lancé sans crash serveur
[ ] Temps réponse acceptable
[ ] Pas d'erreurs 500
[ ] Database à jour après test
[ ] Pas de memory leak
```

**Résultats:**
```
✅ Serveur supporte 100+ utilisateurs
✅ Performance stable
✅ Pas de dégradation
```

---

### 10.2: Test de Performance Temps Réel

**Navigateur desktop avec DevTools (F12):**

**Network Tab:**

```
1. Ouvrir http://localhost:3000
2. Connexion: admin@sorbonne.fr
3. Naviguer vers Students
4. Observer Network tab:

Métrique           | Attendu    | Réel
────────────────────────────────────────
DOMContentLoaded   | < 2s      | [ms]
Load               | < 3s      | [ms]
API /students      | < 500ms   | [ms]
JS bundle          | < 2MB     | [MB]
Total page         | < 500KB   | [KB]
```

**Performance Tab:**

```
1. Ouvrir Performance tab
2. Enregistrer action: Cliquer Students
3. Analyser:

Métrique           | Attendu    | Réel
────────────────────────────────────────
First Paint       | < 1s      | [ms]
First Contentful  | < 1.5s    | [ms]
Largest Element   | < 2.5s    | [ms]
Cumulative Shift  | < 0.1     | [score]
Interaction Ready | < 3s      | [ms]
```

**Vérifications:**
```
[ ] Toutes les métriques acceptables
[ ] Pas de long tasks (> 50ms)
[ ] GPU utilisé (si disponible)
[ ] Memory pas en fuite
```

**Résultats:**
```
✅ Performance web dans les normes
✅ Pas de bottleneck identifié
```

---

### 10.3: Test Sécurité de Base

**HTTPS/SSL:**

```
[ ] Backend utilise HTTPS sur :8443
[ ] Certificat auto-signé accepté (dev)
[ ] Pas de warnings de sécurité
```

**CORS:**

```
[ ] Frontend :3000 peut requêter :8000
[ ] Pas d'erreurs CORS
[ ] Preflight OK
```

**JWT:**

```
[ ] Token JWT valide
[ ] Signature correcte
[ ] Expiration appropriée (15 min?)
[ ] Refresh token fonctionne
```

**SQL Injection:**

```
Essayez: Email input: ' OR '1'='1
Résultat: ❌ Injection échouée (protection OK)
```

**CSRF:**

```
[ ] Tokens CSRF présents
[ ] Validés avant édition
[ ] Pas accessible cross-origin
```

**Vérifications:**
```
[ ] HTTPS OK
[ ] CORS OK
[ ] JWT OK
[ ] SQL Injection bloquée
[ ] CSRF protection active
```

**Résultats:**
```
✅ Sécurité basique implémentée
✅ Pas de vulnerabilités évidentes
```

---

### 10.4: Test Offline (PWA)

**Connecté - Remplir cache:**

```
1. Ouvrir http://localhost:3000
2. Naviguer différentes pages
3. Attendre service worker actif
4. Vérifier "ServiceWorker" dans DevTools
```

**Offline - Tester app:**

```
DevTools → Network → Offline
1. Tester page déjà chargée (doit fonctionner)
2. Tester nouvelle page (peut être cache ou error)
3. Tenter connexion (offline, devrait msg)
```

**Attendu:**
```
✅ Pages en cache affichées offline
✅ Message "Vous êtes offline" visible
❌ Impossible de modifier données offline (ou queue)
```

**Vérifications:**
```
[ ] Service worker enregistré
[ ] Cache populated
[ ] Page accessible offline
[ ] Message utilisateur clair
```

**Résultats:**
```
✅ PWA fonctionnelle
✅ Offline experience acceptable
```

---

## 📊 Checklist ÉTAPE 9-10

```
ÉTAPE 9: MOBILE
[ ] Build web généré (npm run build)
[ ] APK généré sans erreurs
[ ] APK installé sur émulateur
[ ] App se lance sans crash
[ ] Interface responsive
[ ] Navigation fonctionne
[ ] Connexion réussie
[ ] Performance mobile OK
[ ] iOS build (optionnel)

ÉTAPE 10: PERFORMANCE
[ ] Test charge 100+ users OK
[ ] Response time < 500ms
[ ] Error rate < 1%
[ ] Metrics web acceptables
[ ] Pas de memory leaks
[ ] Sécurité basique OK
[ ] HTTPS/CORS/JWT OK
[ ] PWA offline OK

FINAL:
[ ] Aucun crash majeur
[ ] Performance acceptable
[ ] Sécurité basique OK
[ ] App mobile fonctionnelle
[ ] Prêt pour production (recommandation)
```

---

## 📝 Rapport Final ÉTAPE 9-10

```markdown
# Rapport Final: ÉTAPE 9-10 Tests Mobile & Performance

## Résumé Exécutif
- Date: 26 janvier 2026
- Durée totale tests: [HEURES]
- APK généré: ✅/❌
- Performance: ✅/❌
- Prêt production: ✅/❌

## ÉTAPE 9: Mobile
- APK Build: ✅/❌
  Taille: [MB]
  Erreurs: [NOTES]
  
- Installation: ✅/❌
  Appareil: Émulateur Android 13
  Erreurs: [NOTES]
  
- Tests App:
  [ ] Démarrage: ✅/❌
  [ ] Connexion: ✅/❌
  [ ] Navigation: ✅/❌
  [ ] Performance: ✅/❌
  [ ] Aucun crash: ✅/❌

## ÉTAPE 10: Performance
- Test charge:
  Utilisateurs: 100
  Durée: 5 min
  Erreurs: [%]
  Response time p95: [ms]
  
- Performance web:
  DOMContentLoaded: [ms]
  Load: [ms]
  FCP: [ms]
  LCP: [ms]
  
- Sécurité:
  HTTPS: ✅/❌
  CORS: ✅/❌
  JWT: ✅/❌
  SQL Injection: ✅ Bloqué
  
- PWA:
  Service Worker: ✅/❌
  Cache: ✅/❌
  Offline: ✅/❌

## Problèmes Trouvés
1. [DESCRIPTION]
   Sévérité: Critique/Majeur/Mineur
   Solution: [NOTES]

2. [AUTRES PROBLÈMES]

## Recommandations
[ ] Passage en production
[ ] Optimisations supplémentaires
[ ] Security audit externe
[ ] Load testing augmenté

## Conclusion
[RÉSUMÉ GLOBAL - Qualité de l'app, prêt ou pas]
```

---

## 🎯 Prochaine Étape

**APRÈS ÉTAPE 10:** Déploiement en production (hors scope)

---

**Estimé: 2-3 heures | Tests complets mobile/perf | Rapport final!** 🚀
