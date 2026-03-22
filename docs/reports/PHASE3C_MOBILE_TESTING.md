# PHASE 3c: Mobile Testing - Capacitor Implementation

**Status:** 🚀 IN PROGRESS  
**Date:** January 27, 2026  
**Objective:** Validate PWA and native app builds (iOS/Android) with real device testing

---

## 🎯 PHASE 3c Objectives

| Objective | Status | Notes |
|-----------|--------|-------|
| **Install Capacitor CLI** | ⏳ PENDING | v6.x with iOS/Android sync |
| **Configure Capacitor** | ⏳ PENDING | capacitor.config.ts setup |
| **Build optimized PWA** | ⏳ PENDING | Production build with Vite |
| **Sync Capacitor projects** | ⏳ PENDING | iOS + Android native projects |
| **iOS build & signing** | ⏳ PENDING | Xcode configuration |
| **Android build & signing** | ⏳ PENDING | Android Studio APK generation |
| **Device testing** | ⏳ PENDING | Real device functionality validation |
| **Performance profiling** | ⏳ PENDING | Mobile metrics collection |
| **Offline mode testing** | ⏳ PENDING | Service worker + Workbox caching |
| **Push notifications** | ⏳ PENDING | Firebase Cloud Messaging setup |

---

## 📱 Mobile Stack

### Frontend (Capacitor Bridge)
- **Framework:** React 18 + TypeScript + Vite
- **Capacitor:** v6.x (bridges web code to native APIs)
- **Plugins:** Camera, Geolocation, Push, Storage, Biometric
- **Build Target:** iOS 14+, Android API 24+

### Native Platforms
- **iOS:** Xcode 15+, Swift 5.9+
- **Android:** Android Studio Koala, API 24-35

### PWA Features
- **Offline:** Service Worker + Workbox 24h cache
- **Installation:** Add to home screen, app-like experience
- **Capabilities:** Camera access, notifications, biometrics
- **Storage:** IndexedDB for local data sync

---

## 🛠️ Installation & Configuration

### Step 1: Install Capacitor CLI
```bash
npm install -g @capacitor/cli@6.x
npm install @capacitor/core @capacitor/ios @capacitor/android
npm install @capacitor/camera @capacitor/geolocation @capacitor/push-notifications
npm install @capacitor/local-notifications @capacitor/app
```

### Step 2: Build Production PWA
```bash
npm run build  # Vite build → dist/
```

### Step 3: Initialize Capacitor Project
```bash
npx cap init SchoolFlow-Pro com.schoolflow.pro
npx cap add ios
npx cap add android
```

### Step 4: Sync Native Code
```bash
npx cap sync  # Copies web app to native projects
```

### Step 5: Open IDE & Build
```bash
# iOS
npx cap open ios      # Opens Xcode
# → Select Team → Set signing → Build & Run

# Android  
npx cap open android  # Opens Android Studio
# → Build → Generate APK
```

---

## 📋 Testing Checklist

### PWA Testing (Web + Service Worker)
- [ ] App loads offline after first visit
- [ ] Navigation works in airplane mode
- [ ] Images cached and display without internet
- [ ] "Add to home screen" works (Chrome, Safari)
- [ ] Installed app icon & splash screen display
- [ ] Performance metrics in Lighthouse 85+

### iOS Native (Real Device - iPhone 14+)
- [ ] App installs from Xcode
- [ ] All screens render correctly (safe area respected)
- [ ] Camera access (student photo) works
- [ ] Geolocation permission prompt appears
- [ ] Biometric auth (Face ID) functional
- [ ] Push notifications arrive
- [ ] App lifecycle (suspend/resume) intact
- [ ] Performance: <2s cold start, <500ms transitions

### Android Native (Real Device - Pixel 6+)
- [ ] App installs from Android Studio
- [ ] All screens render correctly (notch handling)
- [ ] Camera access functional
- [ ] Geolocation permission works
- [ ] Biometric auth (fingerprint) works
- [ ] Push notifications delivered
- [ ] App lifecycle intact
- [ ] Performance: <2s cold start, <500ms transitions

### Network & Data Sync
- [ ] Login works on cellular only
- [ ] Background sync queues actions offline
- [ ] Data syncs when connection restored
- [ ] Conflict resolution works (stale data)
- [ ] No sensitive data in logs
- [ ] Certificate pinning works (API requests)

### Storage & Permissions
- [ ] IndexedDB has >50MB capacity
- [ ] Profile avatars cached locally
- [ ] Permissions grant flow smooth
- [ ] Permissions revoke handled gracefully
- [ ] App doesn't crash on permission deny

### Performance Profiles
- [ ] Bundle size <2MB (gzipped)
- [ ] First Paint <1s
- [ ] Time to Interactive <2s
- [ ] Jank-free scrolling (60fps)
- [ ] Memory usage <100MB
- [ ] Battery drain acceptable (<5% per hour)

---

## 🔐 Build Signing Configuration

### iOS Provisioning
```
Team ID: Required
Certificate: iOS Distribution
Provisioning Profile: Match
App ID: com.schoolflow.pro
Bundle ID: com.schoolflow.pro
Version: 1.0.0
Build: 1
```

### Android Signing
```
Keystore: schoolflow-pro.keystore
Alias: schoolflow
Key Password: [secure]
Store Password: [secure]
Validity: 25 years
Algorithm: RSA 2048
```

---

## 🚀 Deployment Targets

### App Store (iOS)
- Requires: Apple Developer Account ($99/year)
- Build: Archive → Xcode Cloud or Manual upload
- Review: ~48h approval process
- Target: iOS 14+

### Google Play Store (Android)
- Requires: Google Play Developer Account ($25 one-time)
- Build: Release APK signed
- Review: ~2-4h approval process
- Target: API 24+

### PWA (Web)
- Deployment: Auto via GitHub Actions
- URL: https://schoolflow.pro
- Add to home screen: Chrome, Firefox, Safari
- No review process needed

---

## 📊 Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| **Lighthouse PWA Score** | 90+ | TBD |
| **iOS Cold Start** | <2s | TBD |
| **Android Cold Start** | <2s | TBD |
| **Memory (iOS)** | <100MB | TBD |
| **Memory (Android)** | <100MB | TBD |
| **Offline Functionality** | 100% | TBD |
| **Push Notifications** | 100% delivery | TBD |
| **App Store Release** | Q2 2026 | TBD |

---

## 🐛 Common Issues & Fixes

| Issue | Cause | Solution |
|-------|-------|----------|
| Build fails with gradle error | Android SDK outdated | Update SDK via Android Studio |
| iOS signing error | Team ID not set | Open Xcode → Select Team |
| Camera permission denied | User declined | Prompt again after 3 failed attempts |
| Offline data stale | Service Worker cached old version | Cache-busting with version headers |
| Push notifications not arriving | Firebase not configured | Set up FCM in Firebase Console |
| Memory leak on app suspend | Uncleared subscriptions | Add cleanup in useEffect return |

---

## 📅 Timeline

- **Day 1:** Capacitor setup + PWA build
- **Day 2:** iOS build & device testing
- **Day 3:** Android build & device testing
- **Day 4:** Performance profiling & optimization
- **Day 5:** App Store / Play Store submission prep

**Phase 3c Estimated Duration:** 5 days

---

## ✅ Phase 3 Summary

| Phase | Status | Completion |
|-------|--------|-----------|
| PHASE 3A (E2E Testing) | ✅ Complete | 100% |
| PHASE 3B (Load Testing) | ✅ Complete | 100% |
| **PHASE 3C (Mobile Testing)** | **🚀 Starting** | **0%** |

**Overall Project:** **65%** (Target: Launch by Jan 31, 2026)

---

## 🔗 Key Files

- `capacitor.config.ts` - Main Capacitor configuration
- `vite.config.ts` - Production build settings
- `src/main.tsx` - App entry point (PWA manifest injected)
- `ios/App/Podfile` - iOS dependencies
- `android/app/build.gradle` - Android dependencies
- `.github/workflows/deploy.yml` - CD pipeline for PWA

---

**Next Step:** Run `npm install && npm run build` to prepare PWA build
