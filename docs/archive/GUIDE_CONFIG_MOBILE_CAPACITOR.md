# 📱 Guide de Configuration Mobile Capacitor
## Build iOS & Android pour SchoolFlow Pro

**Date**: 26 Janvier 2026  
**Version Capacitor**: 8.0.0  
**Support**: iOS 14+, Android 6+ (API 21+)

---

## 🎯 Objectif

Créer versions mobiles natives (iOS + Android) de SchoolFlow Pro avec:
- ✅ Interface responsive
- ✅ Notifications push
- ✅ Mode offline
- ✅ Accès caméra (QR codes)
- ✅ Accès calendrier
- ✅ Accès permissions système

---

## 📋 PRÉ-REQUIS

### Pour Android:
```
- Android Studio 2022.1+
- Android SDK API level 21+
- Emulateur ou téléphone Android
- Java JDK 11+
- Gradle 7.0+
```

### Pour iOS (sur Mac):
```
- Xcode 14.0+
- iOS 14.0+ (SDK)
- iPhone Simulator ou appareil iOS
- CocoaPods 1.13+
```

### Tous:
```
- Node.js v18+
- npm 9+
- Capacitor CLI 8.0+
```

**Vérifier installation:**
```bash
node --version    # v18.x.x
npm --version     # 9.x.x
npx cap --version # 8.0.0
java -version     # openjdk 11.x
```

---

## 🚀 PHASE 1: Setup Initial

### 1.1 Vérifier Configuration Capacitor

**Fichier actuel:**
```bash
cat capacitor.config.ts
```

**Doit contenir:**
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.30c804519432458db1b9b7ab99faf7c5',
  appName: 'SchoolFlow Pro',
  webDir: 'dist',
  server: {
    url: 'http://localhost:8080', // IMPORTANT: Dev local
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a2e',
      showSpinner: true,
      spinnerColor: '#6366f1'
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1a1a2e'
    },
    Keyboard: {
      resize: 'body'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile'
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  }
};
```

### 1.2 Build Web

**Créer la version web optimisée:**
```bash
cd c:\Users\cheic\Documents\EduSchool\schoolflow-pro

# Nettoyer
rm -rf dist/
rm -rf ios/
rm -rf android/

# Build
npm run build

# Vérifier
ls -la dist/
# Doit avoir index.html, css/, js/, etc.
```

**Vérifier build:**
```bash
# La taille doit être < 5MB
du -sh dist/

# Output attendu: 3.9M dist/
```

### 1.3 Initialiser Capacitor

```bash
# Ajouter platforms
npx cap add android
npx cap add ios

# Vérifier
ls -la
# android/ et ios/ doivent être créés
```

### 1.4 Copier Assets

```bash
# Copier fichiers web dans les apps
npx cap copy

# Vérifier
ls -la android/app/src/main/assets/public/
ls -la ios/App/App/public/
# index.html doit être présent
```

---

## 📱 PHASE 2: Build Android

### 2.1 Configuration Android Studio

**Option 1: Ouvrir via CLI**
```bash
npx cap open android

# Android Studio doit ouvrir
# Espérer le projet: "android/"
```

**Option 2: Ouvrir manuellement**
```bash
# Ouvrir Android Studio
# File → Open
# Sélectionner: c:\...\schoolflow-pro\android
# Attendre indexation (2-5 min)
```

### 2.2 Configuration Build

**Dans Android Studio:**

1. **Build Configuration**
   - Ouvrir `android/build.gradle`
   - Vérifier `compileSdk 33`
   - Vérifier `minSdk 21`
   - Vérifier `targetSdk 33`

2. **App Signing (Debug)**
   - Android Studio génère automatique
   - Fichier: `~/.android/debug.keystore`
   - Alias: `android` / `androidkey`
   - Password: `android`

3. **Dépendances**
   - Sync Gradle (Android Studio le fait auto)
   - Attendre que Gradle finish

### 2.3 Build Debug APK

**Via Android Studio:**
```
1. Menu: Build → Build Bundle(s)/APK(s) → Build APK(s)
2. Attendre build (3-5 min)
3. APK généré: android/app/build/outputs/apk/debug/app-debug.apk
4. Notification: "APK(s) generated successfully"
```

**Via Terminal (Gradle):**
```bash
cd android
./gradlew assembleDebug
cd ..

# Output: android/app/build/outputs/apk/debug/app-debug.apk (5-10 MB)
```

### 2.4 Installer sur Appareil/Émulateur

**Prérequis:**
- Émulateur Android lancé OU téléphone branché USB
- USB Debug activé (si téléphone)

**Installer:**
```bash
# Via ADB
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Ou via Android Studio:
# 1. Select device (émulateur ou téléphone)
# 2. Run → Run 'app'
# 3. Attendre build + install + launch
```

**Vérifier Installation:**
```bash
# Lister apps installées
adb shell pm list packages | grep schoolflow

# Output: app.lovable.30c804519432458db1b9b7ab99faf7c5
```

### 2.5 Tester Android App

**Sur l'appareil:**

```
✅ Splash screen: "SchoolFlow Pro" 2 sec
✅ Login page chargée
✅ Input email visible
✅ Input password visible (masked)
✅ Bouton "Se connecter" visible + cliquable
✅ Taper email: admin@sorbonne.fr
✅ Taper password: Sorbonne@2025!
✅ Cliquer "Se connecter"
✅ Spinner chargement visible
✅ Dashboard Admin chargé (< 3 sec)
✅ "Université de Paris Sorbonne" en header
✅ Menu hamburger fonctionne
✅ Navigation menu items cliquables
✅ Orientation portrait ✓
✅ Basculer landscape → layout adapté
✅ Back button Android fonctionne
✅ Scrolling fluide
✅ Touches responsives
✅ Pas de crash
```

---

## 🍎 PHASE 3: Build iOS

### 3.1 Configuration Xcode (sur Mac)

**Option 1: Via CLI**
```bash
npx cap open ios

# Xcode doit ouvrir avec ios/App/App.xcworkspace
```

**Option 2: Ouvrir manuellement**
```bash
# Ouvrir Finder
# Aller à: schoolflow-pro/ios/App
# Double-cliquer: App.xcworkspace (PAS App.xcodeproj!)
```

### 3.2 Configuration Build

**Dans Xcode:**

1. **Select Target**
   - Left sidebar: Sélectionner "App"
   - Tab "General"

2. **Signing & Capabilities**
   - Team: Votre compte Apple Developer (si certificat)
   - Bundle Identifier: `app.lovable.30c804519432458db1b9b7ab99faf7c5`
   - Version: `1.0.0`
   - Build: `1`

3. **Build Settings**
   - iOS Deployment Target: `14.0`
   - Swift Language Version: `5.9`

### 3.3 Build iOS Simulator

**Via Xcode:**
```
1. Select device: iPhone 14 (ou autre)
2. Product → Build (Cmd+B)
3. Attendre build (5-10 min)
4. Output: "Build Succeeded"
5. Product → Run (Cmd+R)
6. App lance dans simulator
```

**Via Terminal (Recommended):**
```bash
cd ios/App

# Build pour simulator
xcodebuild -workspace App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath build

# Attendre build
# Output: build/Build/Products/Debug-iphonesimulator/App.app
```

### 3.4 Build iOS Device (Production)

**Prérequis:**
- Apple Developer Account
- Distribution Certificate
- Provisioning Profile

**Build Pour Appareil:**
```bash
cd ios/App

# Build pour device
xcodebuild -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build

# Attendre build
```

**Générer IPA:**
```bash
cd ios/App

xcodebuild -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build \
  -archivePath build/App.xcarchive \
  archive

xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist export.plist \
  -exportPath ipa

# Output: ipa/App.ipa
```

### 3.5 Tester iOS App

**Sur simulator/appareil:**

```
✅ Splash screen: "SchoolFlow Pro" 2 sec
✅ Login page chargée
✅ Input email visible + keyboard
✅ Input password visible (masked)
✅ Bouton "Se connecter"
✅ Taper credentials
✅ Cliquer "Se connecter"
✅ Dashboard chargé
✅ "Université de Paris Sorbonne" affichée
✅ Navigation menu
✅ Orientation portrait ✓
✅ Rotation landscape ✓
✅ Safe area respectée (notch)
✅ Dynamic Island (si iPhone 14+ pro)
✅ Gesture swipe back fonctionne
✅ Status bar adaptée
✅ Performance fluide
✅ Pas de crash
```

---

## 🔄 PHASE 4: Development Loop

### 4.1 Développement Local

**Pour tester changements localement:**

```bash
# Terminal 1: Dev web server
npm run dev

# Terminal 2: Sync avec app mobile
npx cap sync

# Terminal 3: Ouvrir app sur device
npx cap open android   # ou ios
```

**Workflow:**
```
1. Modifier code React
2. Save fichier → hot reload web (localhost:8080)
3. npm run build (si nécessaire)
4. npx cap sync (copier assets à app)
5. Recharger app mobile (Cmd+R ou Ctrl+R)
```

### 4.2 Live Reload (Optional)

**Configurer Live Reload:**

```typescript
// capacitor.config.ts
const config: CapacitorConfig = {
  server: {
    url: 'http://192.168.1.100:8080',  // IP locale
    cleartext: true
  }
};
```

**Démarrer:**
```bash
# Terminal: Dev web
npm run dev

# Sur mobile:
# App rafraîchit automatiquement quand code change
```

---

## 📦 PHASE 5: Release Build

### 5.1 Android Release (APK + Bundle)

**Build Release APK:**
```bash
cd android

# Créer release key (1ère fois)
keytool -genkey -v -keystore release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias release

# Signer APK
./gradlew assembleRelease \
  -Pandroid.injected.signing.store.file=release.keystore \
  -Pandroid.injected.signing.store.password=<password> \
  -Pandroid.injected.signing.key.alias=release \
  -Pandroid.injected.signing.key.password=<password>

cd ..
# Output: android/app/build/outputs/apk/release/app-release.apk
```

**Build Android App Bundle (pour Google Play):**
```bash
cd android
./gradlew bundleRelease
cd ..
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### 5.2 iOS Release (IPA)

**Build Release IPA:**
```bash
cd ios/App

# Build archive
xcodebuild -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -archivePath build/App.xcarchive \
  archive

# Export IPA
xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist export.plist \
  -exportPath ipa

cd ../..
# Output: ios/App/ipa/App.ipa (~40-50 MB)
```

---

## 🔌 PHASE 6: Plugins & Fonctionnalités

### 6.1 Permissions (Android + iOS)

**Android: AndroidManifest.xml**
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_CALENDAR" />
<uses-permission android:name="android.permission.WRITE_CALENDAR" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**iOS: Info.plist**
```xml
<!-- ios/App/App/Info.plist -->
<key>NSCameraUsageDescription</key>
<string>SchoolFlow Pro utilise votre caméra pour scanner des codes QR</string>

<key>NSCalendarsUsageDescription</key>
<string>SchoolFlow Pro accède à votre calendrier pour synchroniser l'emploi du temps</string>

<key>NSLocalNetworkUsageDescription</key>
<string>SchoolFlow Pro se connecte au serveur local</string>
```

### 6.2 Push Notifications

**Android: google-services.json**
```
1. Google Firebase Console
2. Project: SchoolFlow Pro
3. Download google-services.json
4. Placer: android/app/google-services.json
```

**iOS: GoogleService-Info.plist**
```
1. Google Firebase Console
2. Download GoogleService-Info.plist
3. Ajouter à Xcode: ios/App/App/GoogleService-Info.plist
4. Targets → App → Build Phases → Copy Bundle Resources
```

### 6.3 QR Code Scanner

**Installer plugin:**
```bash
npm install @zxing/library

# Pour Capacitor:
npm install @capacitor-community/barcode-scanner
npx cap sync
```

**Usage dans composant:**
```tsx
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';

async function scanQRCode() {
  const result = await BarcodeScanner.scan();
  console.log('QR Code:', result.value);
}
```

---

## 🛠️ TROUBLESHOOTING

### Android Issues

**Problème: "Could not find gradle.properties"**
```bash
# Solution:
cd android
./gradlew clean
./gradlew build
cd ..
```

**Problème: "Unsupported class-file format"**
```bash
# Solution: Java version issue
java -version  # Doit être 11+
export JAVA_HOME=/path/to/java11
```

**Problème: "Gradle sync failed"**
```bash
# Solution:
cd android
./gradlew --refresh-dependencies
cd ..
# Relancer Android Studio
```

### iOS Issues

**Problème: "Pod install failed"**
```bash
# Solution:
cd ios/App
rm -rf Pods/
pod install --repo-update
cd ../..
```

**Problème: "Sigining certificate not found"**
```bash
# Solution:
# Xcode → Preferences → Accounts
# Login compte Apple
# Team ID doit être visible
```

**Problème: "Swift compilation error"**
```bash
# Solution:
# Build Settings → Swift Language Version → Swift 5.9
# Product → Clean Build Folder (Cmd+Shift+K)
# Product → Build (Cmd+B)
```

---

## 📊 Checklist Final

```
PRÉ-BUILD:
- [ ] npm run build réussit
- [ ] dist/ créé sans erreurs
- [ ] < 5MB total size
- [ ] Tous les assets dans dist/

ANDROID:
- [ ] Android Studio installé
- [ ] SDK API 21+ installé
- [ ] Émulateur fonctionne
- [ ] APK généré (debug)
- [ ] APK installé sur appareil
- [ ] App lance correctement
- [ ] Login fonctionne
- [ ] Dashboard affichée
- [ ] Pas de crash

iOS (sur Mac):
- [ ] Xcode 14+ installé
- [ ] iOS 14+ SDK installé
- [ ] Simulator fonctionne
- [ ] IPA généré
- [ ] App lance dans simulator
- [ ] Login fonctionne
- [ ] Dashboard affichée
- [ ] Pas de crash

TESTS MOBILES:
- [ ] Splash screen OK
- [ ] Login responsive
- [ ] Dashboard responsive
- [ ] Navigation fluide
- [ ] Offline mode marche
- [ ] Push notif OK
- [ ] Performance < 5 sec
- [ ] Pas d'erreurs console
- [ ] Orientation adapté
- [ ] Touch responsive

RELEASE:
- [ ] APK release signé
- [ ] IPA release signé
- [ ] Versions incrementées
- [ ] Changelog préparé
- [ ] Privacy policy OK
- [ ] Terms of Service OK
```

---

## 📚 Ressources

- [Capacitor Docs](https://capacitorjs.com/)
- [Android Developer](https://developer.android.com/)
- [Apple Developer](https://developer.apple.com/)
- [Firebase Setup](https://firebase.google.com/)

---

**✅ Configuration Mobile Prête!**

Procédez à PHASE 2 (Build Android) ou PHASE 3 (Build iOS).
