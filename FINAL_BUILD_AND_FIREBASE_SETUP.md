# ANGEL ENTERPRISES Civil Workforce Attendance System
## Production Build, Android Studio Guide & Firebase Setup Document

**Application Name:** ANGEL ENTERPRISES Civil Workforce Attendance System  
**Android Package:** `com.civilworkforce.attendance`  
**Firebase Project ID:** `civil-workforce-attendance`  
**Target Platform:** Android (Jetpack Compose / Material 3 / Kotlin) + Web Administrative Hub (React / Vite / TypeScript / Tailwind CSS) + Backend API (Node.js / Express / Firebase Admin SDK)

---

## 1. Executive Summary & Verification State

All requested Phase 1 features and verified root-cause fixes are fully implemented in the codebase:
- **Workforce Batches (Activate / Deactivate):** End-to-end integration across Web UI (`src/App.tsx`), `FirebaseService.updateBatchStatus`, server endpoint `POST /api/admin/toggle-batch`, and real Firestore documents in `batches`. Real-time loading indicator, duplicate-click prevention, responsive card redesign, and live database persistence without insecure fallbacks.
- **Strict Indian Mobile Number Validation:** Enforces exactly 10 digits starting with 6, 7, 8, or 9. Accepts optional `+91` prefix (with space or hyphen). Normalizes supported formatting before persistence. Rejects 9-digit, 11-digit, non-6/7/8/9 leading digits, malformed strings, and unsupported international country codes. Validated identically across Web (`src/utils/validation.ts`) and Android (`ValidationUtils.kt`).
- **AI Operations Assistant & Command Mode:** Grounded read-only insights based strictly on live Firestore database aggregates. Mutating actions (`ACTIVATE_BATCH`, `DEACTIVATE_BATCH`, `APPROVE_REGISTRATION`, `DEACTIVATE_SITE`) operate through a strict allowlist on the trusted backend (`POST /api/admin/execute-command`), require explicit human administrator preview and confirmation in the UI, verify server-side Firebase Admin authentication, and log security audit entries.
- **Worker Registration Flow:** Validates submitted applicant data, creates Firebase Auth account safely, writes `/users/{uid}` and `/workerRegistrations/{regId}` with status `PENDING`, assigns zero privileged access before approval, and never stores passwords in Firestore.
- **Project Synchronization:** All 42 native Android Kotlin and configuration files on disk are 100% in sync with `src/androidProjectData.ts`.

---

## 2. Automated Tests Actually Executed & Verified Results

| Check / Test Suite | Scope | Result | Details |
| :--- | :--- | :--- | :--- |
| **Strict Indian Phone Validation** | Unit (14 cases) | **14 / 14 PASSED** | Verified +91 prefixes, spaces, hyphens, 10-digit boundaries, and leading 6/7/8/9 enforcement. |
| **Admin Command Allowlist** | Unit / Security | **6 / 6 PASSED** | Permitted actions allowed; arbitrary writes (`DELETE_DATABASE`, `UPDATE_SECURITY_RULES`) strictly rejected. |
| **Web Applet TypeScript Linting** | `npm run lint` (`tsc --noEmit`) | **PASSED (Exit 0)** | Zero type errors across frontend and server. |
| **Web + Backend Production Build** | `npm run build` | **PASSED (Exit 0)** | Vite frontend compiled to `dist/`, Express server bundled with esbuild to `dist/server.cjs`. |
| **Live Firestore Connectivity** | Network / Rules | **PASSED** | Successfully queried live `sites` collection (3 documents) and active `batches` collection (6 cohorts) using real project credentials. |
| **Android Disk vs ProjectData Sync** | Source verification | **42 / 42 Files In Sync** | Zero discrepancies between `/android` filesystem and `src/androidProjectData.ts`. |
| **Android Local Gradle Build** | Android SDK | **SOURCE-COMPLETE, BUILD-UNVERIFIED** | Gradle and Java compiler are not present in this web container runtime. Source is structured for direct build in Android Studio. |

---

## 3. How to Open and Build the APK in Android Studio

Follow these exact steps to build the release or debug APK on your computer:

### Step 1: Extract the Project
Extract the provided archive `ANGEL_ENTERPRISES_Civil_Workforce_FINAL.zip`. The `android/` directory inside is the complete Android Studio project.

### Step 2: Open in Android Studio
1. Launch **Android Studio** (Hedgehog 2023.1.1, Iguana 2023.2.1, or Jellyfish 2024.1+ recommended).
2. Click **Open** and select the `android/` folder (where `settings.gradle.kts` and `build.gradle.kts` reside).
3. Allow Android Studio to sync Gradle dependencies.

### Step 3: Prerequisites
- **JDK:** Java 17 (Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK -> set to version 17).
- **Android SDK:** API 34 (Android 14) installed via SDK Manager.
- **Build Tools:** 34.0.0.

### Step 4: Build APK via Terminal or GUI
- **Debug APK:**
  ```bash
  cd android
  ./gradlew assembleDebug
  ```
  The generated APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`.
- **Release APK:**
  ```bash
  cd android
  ./gradlew assembleRelease
  ```
  The generated APK will be at: `android/app/build/outputs/apk/release/app-release-unsigned.apk` (or signed if you configure your release keystore).

---

## 4. Required Firebase Console Setup

The Firebase project `civil-workforce-attendance` is already provisioned. Ensure the following configurations are active in the Firebase Console (https://console.firebase.google.com/project/civil-workforce-attendance):

1. **Authentication:**
   - Under **Authentication > Sign-in method**, verify **Email/Password** is **Enabled**.
   - Ensure administrator accounts (such as `admin@civilworkforce.gov` or `aartichavan8781@gmail.com`) are present with active status in the `users` collection.
2. **Firestore Database:**
   - Database ID: `(default)`.
   - Security Rules: Deploy the rules from `firestore.rules`.
3. **Android Client Fingerprints (SHA-1):**
   - Under **Project Settings > General > Your apps > Android app (`com.civilworkforce.attendance`)**:
   - Add your local debug SHA-1 fingerprint (run `./gradlew signingReport` in Android Studio to obtain it).
   - Download the updated `google-services.json` if you make changes (the current pre-configured `google-services.json` is already placed in `android/app/google-services.json`).
4. **Cloud Messaging (Optional):**
   - Push notifications for attendance events are supported via Firebase Cloud Messaging.

---

## 5. Backend Server Execution (Optional for Full-Stack)

To run the integrated backend server locally:
```bash
npm install
npm run build
npm start
```
The server will start on port 3000, serving the administrative dashboard, QR generation/verification HMAC routes, and the operations AI assistant.

---

## 6. Archive Integrity

- **Final Full-Project Archive:** `ANGEL_ENTERPRISES_Civil_Workforce_FINAL.zip`
- **Clean Exclusions:** `node_modules`, `.tools`, `.git`, `.gradle`, `dist`, local build caches, and private keys were excluded to keep the package lightweight, clean, and portable.
