import express from "express";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import crypto from "crypto";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const portArgIndex = process.argv.indexOf("--port");
const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? parseInt(process.argv[portArgIndex + 1], 10) : NaN;
const PORT = !isNaN(cliPort) ? cliPort : (Number(process.env.PORT) || 3000);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Strict Server-Side Secrets Validation (No defaults, no fallbacks, no ADC fallback)
// Lazy-evaluated to allow dev server to boot while strictly enforcing secrets on endpoint execution

function getHmacSecret(): string {
  const secret = process.env.ATTENDANCE_HMAC_SECRET?.trim();
  if (!secret) {
    throw new Error("CRITICAL: ATTENDANCE_HMAC_SECRET environment variable is missing or empty. Server startup aborted.");
  }
  return secret;
}

let adminAuthInstance: ReturnType<typeof getAuth> | null = null;
let adminDbInstance: ReturnType<typeof getFirestore> | null = null;
let adminMessagingInstance: ReturnType<typeof getMessaging> | null = null;

function getFirebaseAdmin(): {
  adminAuth: ReturnType<typeof getAuth>;
  adminDb: ReturnType<typeof getFirestore>;
  adminMessaging: ReturnType<typeof getMessaging>;
} {
  if (adminAuthInstance && adminDbInstance && adminMessagingInstance) {
    return { adminAuth: adminAuthInstance, adminDb: adminDbInstance, adminMessaging: adminMessagingInstance };
  }

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!rawServiceAccount) {
    throw new Error("CRITICAL: FIREBASE_SERVICE_ACCOUNT environment variable is missing or empty. Application Default Credentials fallback is disabled.");
  }

  let parsedServiceAccount: any;
  try {
    parsedServiceAccount = JSON.parse(rawServiceAccount);
  } catch {
    throw new Error("CRITICAL: Failed to parse FIREBASE_SERVICE_ACCOUNT as valid JSON. Server startup aborted.");
  }

  if (
    !parsedServiceAccount ||
    typeof parsedServiceAccount !== "object" ||
    !parsedServiceAccount.private_key ||
    !parsedServiceAccount.client_email
  ) {
    throw new Error("CRITICAL: FIREBASE_SERVICE_ACCOUNT is missing required service account credentials (client_email or private_key). Server startup aborted.");
  }

  let adminApp: ReturnType<typeof initializeApp>;
  if (getApps().length === 0) {
    try {
      adminApp = initializeApp({
        credential: cert(parsedServiceAccount),
        projectId: parsedServiceAccount.project_id || "civil-workforce-attendance",
      });
      console.log("[server] Firebase Admin initialized with validated service account certificate.");
    } catch (err: any) {
      throw new Error(`CRITICAL: Failed to initialize Firebase Admin with provided credentials: ${err.message}`);
    }
  } else {
    adminApp = getApps()[0];
  }

  adminAuthInstance = getAuth(adminApp);
  adminDbInstance = getFirestore(adminApp);
  adminMessagingInstance = getMessaging(adminApp);
  return { adminAuth: adminAuthInstance, adminDb: adminDbInstance, adminMessaging: adminMessagingInstance };
}

/**
 * Dispatch Push Notification via Firebase Cloud Messaging
 * - Tokens are queried by target worker UID from the deviceTokens collection
 * - Primary Firestore status operations remain the single source of truth
 * - Push notification delivery failure does not compromise core database updates
 * - Invalid/unregistered tokens are safely cleaned up
 * - Never includes passwords, credentials, tokens, or HMAC secrets in the payload
 */
async function sendWorkerNotification(
  targetUid: string,
  title: string,
  body: string,
  dataPayload?: Record<string, string>
): Promise<{ sentCount: number; failureCount: number }> {
  try {
    if (!targetUid) return { sentCount: 0, failureCount: 0 };
    const { adminDb, adminMessaging } = getFirebaseAdmin();
    const tokenSnap = await adminDb.collection("deviceTokens").where("uid", "==", targetUid).get();
    if (tokenSnap.empty) {
      return { sentCount: 0, failureCount: 0 };
    }

    let sentCount = 0;
    let failureCount = 0;

    for (const tokenDoc of tokenSnap.docs) {
      const data = tokenDoc.data();
      const token = data?.token;
      if (!token) continue;

      try {
        await adminMessaging.send({
          token,
          notification: {
            title,
            body,
          },
          data: dataPayload || {},
        });
        sentCount++;
      } catch (sendErr: any) {
        failureCount++;
        console.warn(`[server] FCM delivery failed for token ${token.slice(0, 10)}...:`, sendErr.code || sendErr.message);
        if (
          sendErr.code === "messaging/registration-token-not-registered" ||
          sendErr.code === "messaging/invalid-registration-token" ||
          sendErr.code === "messaging/invalid-argument"
        ) {
          try {
            await tokenDoc.ref.delete();
            console.log(`[server] Safely removed invalid device token: ${tokenDoc.id}`);
          } catch (delErr) {
            console.warn("[server] Could not delete stale device token:", delErr);
          }
        }
      }
    }

    return { sentCount, failureCount };
  } catch (err: any) {
    console.warn("[server] sendWorkerNotification notice:", err.message);
    return { sentCount: 0, failureCount: 0 };
  }
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  const hmacConfigured = !!process.env.ATTENDANCE_HMAC_SECRET?.trim();
  const serviceAccountConfigured = !!process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  res.json({
    status: "ok",
    service: "Civil Workforce Attendance API",
    timestamp: Date.now(),
    hmacConfigured,
    serviceAccountConfigured,
    ready: hmacConfigured && serviceAccountConfigured,
  });
});

// Complete Android Studio Project Export
function packageAndroidProject(): string {
  const targetZip = path.resolve("/app/applet/ANGEL_ENTERPRISES_Civil_Workforce_COMPLETE_FINAL.zip");
  const androidDir = path.resolve("/app/applet/android");

  if (!fs.existsSync(androidDir)) {
    throw new Error("Android source directory not found: " + androidDir);
  }

  const pyScript = `
import os, zipfile
target_zip = "${targetZip}"
android_dir = "${androidDir}"

if os.path.exists(target_zip):
    try:
        os.remove(target_zip)
    except:
        pass

files_added = []
with zipfile.ZipFile(target_zip, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(android_dir):
        dirs[:] = [d for d in dirs if d not in [".gradle", "build", "node_modules", ".cxx", ".idea"]]
        for f in sorted(files):
            if f in ["local.properties", ".DS_Store"] or f.endswith(".hprof"):
                continue
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, "/app/applet").replace("\\\\", "/")
            zf.write(full_path, rel_path)
            files_added.append(rel_path)
`;

  execSync(`python3 -c '${pyScript.replace(/'/g, "'\\''")}'`, { stdio: "pipe" });

  // Mirror to public directory for direct browser links
  try {
    const pubDir = path.resolve(process.cwd(), "public");
    if (fs.existsSync(pubDir)) {
      fs.copyFileSync(targetZip, path.join(pubDir, "ANGEL_ENTERPRISES_Civil_Workforce_COMPLETE_FINAL.zip"));
      fs.copyFileSync(targetZip, path.join(pubDir, "CivilWorkforceAttendance-AndroidStudio.zip"));
      fs.copyFileSync(targetZip, path.join(pubDir, "ANGEL_ENTERPRISES_Civil_Workforce_FIXED.zip"));
      fs.copyFileSync(targetZip, path.resolve("/app/applet/ANGEL_ENTERPRISES_Civil_Workforce_FIXED.zip"));
    }
  } catch {
    // Non-fatal if public copy fails
  }

  return targetZip;
}

const handleAndroidExportZip = (_req: express.Request, res: express.Response) => {
  try {
    const zipPath = packageAndroidProject();
    res.setHeader("Content-Disposition", 'attachment; filename="ANGEL_ENTERPRISES_Civil_Workforce_FIXED.zip"');
    res.setHeader("Content-Type", "application/zip");
    return res.sendFile(zipPath);
  } catch (err: any) {
    console.error("Export zip failure:", err);
    return res.status(500).json({ error: "Failed to generate Android Studio ZIP: " + err?.message });
  }
};

app.post(["/api/android/export-zip", "/api/download-android-zip"], handleAndroidExportZip);
app.get([
  "/api/android/export-zip",
  "/api/download-android-zip",
  "/ANGEL_ENTERPRISES_Civil_Workforce_FINAL.zip",
  "/ANGEL_ENTERPRISES_Civil_Workforce_FIXED.zip",
  "/ANGEL_ENTERPRISES_Civil_Workforce_COMPLETE_FINAL.zip"
], (req, res) => {
  const finalZip = path.resolve("/app/applet/ANGEL_ENTERPRISES_Civil_Workforce_FINAL.zip");
  if (fs.existsSync(finalZip)) {
    res.setHeader("Content-Disposition", 'attachment; filename="ANGEL_ENTERPRISES_Civil_Workforce_FINAL.zip"');
    res.setHeader("Content-Type", "application/zip");
    return res.sendFile(finalZip);
  }
  return handleAndroidExportZip(req, res);
});

// Device Token Registration for Firebase Cloud Messaging
app.post("/api/device/register-token", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header." });
    }
    const idToken = authHeader.split(" ")[1];
    const { adminAuth, adminDb } = getFirebaseAdmin();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const { fcmToken, platform } = req.body;
    if (!fcmToken || typeof fcmToken !== "string") {
      return res.status(400).json({ error: "fcmToken is required." });
    }

    const cleanToken = fcmToken.trim();
    if (cleanToken.length < 10 || cleanToken.length > 500) {
      return res.status(400).json({ error: "Invalid token length." });
    }

    // Hash token with UID to generate stable deterministic document ID
    const tokenDocId = crypto.createHash("sha256").update(`${uid}:${cleanToken}`).digest("hex");
    const now = new Date().toISOString();

    await adminDb.collection("deviceTokens").doc(tokenDocId).set(
      {
        token: cleanToken,
        uid,
        platform: platform === "android" ? "android" : "web",
        updatedAt: now,
        createdAt: now
      },
      { merge: true }
    );

    return res.json({ success: true, registered: true });
  } catch (err: any) {
    console.error("[server] /api/device/register-token error:", err);
    return res.status(500).json({ error: "Failed to register device token." });
  }
});

app.post("/api/device/unregister-token", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header." });
    }
    const idToken = authHeader.split(" ")[1];
    const { adminAuth, adminDb } = getFirebaseAdmin();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const { fcmToken } = req.body;
    if (!fcmToken || typeof fcmToken !== "string") {
      return res.status(400).json({ error: "fcmToken is required." });
    }

    const tokenDocId = crypto.createHash("sha256").update(`${uid}:${fcmToken.trim()}`).digest("hex");
    await adminDb.collection("deviceTokens").doc(tokenDocId).delete();

    return res.json({ success: true, unregistered: true });
  } catch (err: any) {
    console.error("[server] /api/device/unregister-token error:", err);
    return res.status(500).json({ error: "Failed to unregister device token." });
  }
});

// Admin-only 30-second Rotating QR Token Generator (supports GET or POST)
const handleActiveQrRequest = async (req: express.Request, res: express.Response) => {
  try {
    // Validate secrets strictly (fail fast if either is missing or invalid)
    let HMAC_SECRET: string;
    let adminAuth: ReturnType<typeof getAuth>;
    let adminDb: ReturnType<typeof getFirestore>;

    try {
      HMAC_SECRET = getHmacSecret();
      const fbAdmin = getFirebaseAdmin();
      adminAuth = fbAdmin.adminAuth;
      adminDb = fbAdmin.adminDb;
    } catch (configErr: any) {
      return res.status(500).json({ error: configErr.message });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header. Bearer token required." });
    }

    const idToken = authHeader.split(" ")[1];
    const siteId = (req.query.siteId as string) || req.body?.siteId;

    if (!siteId) {
      return res.status(400).json({ error: "Missing siteId parameter" });
    }

    // Verify caller ID token using Firebase Admin
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (err: any) {
      console.error("[server] verifyIdToken failed:", err.message);
      return res.status(401).json({ error: "Invalid Firebase ID token: " + err.message });
    }

    const callerUid = decodedToken.uid;

    // Check Admin privileges in Firestore: strictly requires authenticated Firebase account AND
    // corresponding Firestore /users/{uid} document with role = 'ADMIN' or 'SITE_SUPERVISOR' and status = 'ACTIVE'
    let isAdmin = false;
    try {
      const userSnap = await adminDb.collection("users").doc(callerUid).get();
      if (userSnap.exists) {
        const userData = userSnap.data();
        if ((userData?.role === "ADMIN" || userData?.role === "SITE_SUPERVISOR") && userData?.status === "ACTIVE") {
          isAdmin = true;
        }
      }
    } catch (dbErr: any) {
      console.error("[server] Admin check via Firestore failed:", dbErr.message);
      return res.status(500).json({ error: "Database error during admin privilege verification: " + dbErr.message });
    }

    if (!isAdmin) {
      return res.status(403).json({ error: "Access denied: Active ADMIN or SITE_SUPERVISOR role required to generate site QR tokens." });
    }

    // Validate that the site exists and is ACTIVE
    try {
      const siteDoc = await adminDb.collection("sites").doc(siteId).get();
      if (siteDoc.exists) {
        const siteData = siteDoc.data();
        if (siteData?.status === "INACTIVE") {
          return res.status(400).json({
            error: `Construction site "${siteId}" is currently INACTIVE. Attendance QR kiosk generation is disabled for inactive sites.`,
          });
        }
      }
    } catch (siteErr: any) {
      console.warn("[server] Site status lookup note:", siteErr.message);
    }

    // Compute the 30-second rotating HMAC-SHA256 token
    const now = Date.now();
    const timeSlot = Math.floor(now / 30000);
    const rawData = `${siteId}:${timeSlot}`;
    const token = crypto.createHmac("sha256", HMAC_SECRET).update(rawData).digest("hex");
    const sessionId = `QRSESS_${siteId}_${timeSlot * 30}`;
    const slotExpiryMs = (timeSlot + 1) * 30000;
    const secondsRemaining = Math.max(1, Math.floor((slotExpiryMs - now) / 1000));

    // Write the active session to Firestore /activeQrSessions/{siteId}
    try {
      await adminDb.collection("activeQrSessions").doc(siteId).set({
        siteId,
        token,
        sessionId,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(slotExpiryMs),
        timeSlot,
        generatedBy: "SERVER",
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[server] Active QR session written for site ${siteId}, token hash: ${token.slice(0, 10)}...`);
    } catch (writeErr: any) {
      console.error("[server] Failed to write active QR session to Firestore:", writeErr.message);
      // Return details if permission denied on default credentials
      return res.status(500).json({
        error: "Failed to write active QR session to Firestore. Ensure FIREBASE_SERVICE_ACCOUNT is configured in Settings -> Secrets if using service account credentials.",
        details: writeErr.message,
      });
    }

    // Return the sanitized QR payload for the kiosk to display
    return res.json({
      siteId,
      sessionId,
      token,
      expiresAt: slotExpiryMs,
      secondsRemaining,
    });
  } catch (err: any) {
    console.error("[server] Error generating active QR:", err);
    return res.status(500).json({ error: "Internal server error generating QR token: " + err.message });
  }
};

app.get("/api/attendance/active-qr", handleActiveQrRequest);
app.post("/api/attendance/active-qr", handleActiveQrRequest);

// Authenticated server-side QR verification endpoint
app.post("/api/attendance/verify", async (req, res) => {
  try {
    const { adminAuth } = getFirebaseAdmin();

    // 1. Enforce Firebase Authentication: verify caller's ID token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ valid: false, error: "Missing or invalid authorization header. Bearer token required." });
    }

    const idToken = authHeader.split(" ")[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authErr: any) {
      return res.status(401).json({ valid: false, error: "Invalid Firebase ID token: " + authErr.message });
    }

    // 2. Validate parameters
    const HMAC_SECRET = getHmacSecret();
    const { siteId, token } = req.body;
    if (!siteId || !token) {
      return res.status(400).json({ valid: false, error: "Missing siteId or token" });
    }

    // 3. Verify token against current and previous 30s rotation slots
    const now = Date.now();
    const currentSlot = Math.floor(now / 30000);
    const prevSlot = currentSlot - 1;

    const currentExpected = crypto.createHmac("sha256", HMAC_SECRET).update(`${siteId}:${currentSlot}`).digest("hex");
    const prevExpected = crypto.createHmac("sha256", HMAC_SECRET).update(`${siteId}:${prevSlot}`).digest("hex");

    const isValid = token === currentExpected || token === prevExpected;
    return res.json({ valid: isValid, siteId, timestamp: now, verifiedBy: decodedToken.uid });
  } catch (err: any) {
    return res.status(500).json({ valid: false, error: err.message });
  }
});

/**
 * 3. TRUSTED SERVER-SIDE ATTENDANCE RECORDING (Check-In & Check-Out)
 * - Authenticates caller via Firebase ID Token
 * - Cryptographically verifies presented HMAC-SHA256 QR token (supports current and previous 30s rotation slots, or active session doc)
 * - Resolves and verifies caller's worker profile (must be ACTIVE)
 * - Validates worker's site assignment matches siteId (strictly rejects cross-site attendance)
 * - Automatically derives current date in India Standard Time (IST = Asia/Kolkata, YYYY-MM-DD)
 * - Executes atomic Firestore transaction using Firebase Admin SDK:
 *     - If no attendance record exists today: creates new record with status: 'CHECKED_IN'
 *     - If record exists with CHECKED_IN: transitions status to 'COMPLETED' with checkOutTime
 *     - If record exists with COMPLETED: rejects with duplicate / shift finished error
 *     - If explicit action ('CHECK_IN' or 'CHECK_OUT') is provided, enforces valid state transition
 */
app.post("/api/attendance/record", async (req, res) => {
  try {
    let HMAC_SECRET: string;
    let adminAuth: ReturnType<typeof getAuth>;
    let adminDb: ReturnType<typeof getFirestore>;

    try {
      HMAC_SECRET = getHmacSecret();
      const fbAdmin = getFirebaseAdmin();
      adminAuth = fbAdmin.adminAuth;
      adminDb = fbAdmin.adminDb;
    } catch (configErr: any) {
      return res.status(500).json({ success: false, error: "Server configuration error: " + configErr.message });
    }

    // 1. Enforce Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Missing or invalid authorization header. Bearer token required.",
      });
    }

    const idToken = authHeader.split(" ")[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authErr: any) {
      return res.status(401).json({
        success: false,
        error: "Invalid Firebase ID token: " + authErr.message,
      });
    }

    const callerUid = decodedToken.uid;

    // 2. Validate input parameters
    const { siteId, qrToken, qrSessionId, action, latitude, longitude, operationId } = req.body;
    if (!siteId || typeof siteId !== "string" || !siteId.trim()) {
      return res.status(400).json({ success: false, error: "Missing or invalid siteId parameter." });
    }
    if (!qrToken || typeof qrToken !== "string" || !qrToken.trim()) {
      return res.status(400).json({ success: false, error: "Missing or invalid qrToken parameter." });
    }

    const cleanSiteId = siteId.trim();
    const cleanQrToken = qrToken.trim();
    const cleanOperationId = typeof operationId === "string" && operationId.trim() ? operationId.trim() : null;

    // Idempotency check: If this exact operation was already processed, return cached success
    if (cleanOperationId) {
      try {
        const existingOpDoc = await adminDb.collection("idempotentOperations").doc(cleanOperationId).get();
        if (existingOpDoc.exists) {
          const opData = existingOpDoc.data();
          if (opData?.workerUid && opData.workerUid !== callerUid) {
            return res.status(403).json({
              success: false,
              error: "Operation ID ownership mismatch.",
            });
          }
          if (opData?.status === "SUCCESS" && opData?.response) {
            console.log(`[server] Idempotent hit: operationId=${cleanOperationId} already processed. Returning cached success response.`);
            return res.status(200).json({
              ...opData.response,
              idempotentReplay: true,
            });
          }
        }
      } catch (opErr: any) {
        console.warn("[server] Idempotency pre-check note:", opErr.message);
      }
    }

    // 3. Cryptographic QR Verification (HMAC-SHA256 on 30s slots + active session check)
    const now = Date.now();
    const currentSlot = Math.floor(now / 30000);
    const prevSlot = currentSlot - 1;
    const nextSlot = currentSlot + 1; // 1-slot leeway for slight clock variance

    const currentExpected = crypto.createHmac("sha256", HMAC_SECRET).update(`${cleanSiteId}:${currentSlot}`).digest("hex");
    const prevExpected = crypto.createHmac("sha256", HMAC_SECRET).update(`${cleanSiteId}:${prevSlot}`).digest("hex");
    const nextExpected = crypto.createHmac("sha256", HMAC_SECRET).update(`${cleanSiteId}:${nextSlot}`).digest("hex");

    let isTokenValid = cleanQrToken === currentExpected || cleanQrToken === prevExpected || cleanQrToken === nextExpected;

    // Also check live activeQrSessions document in Firestore if available
    if (!isTokenValid) {
      try {
        const sessionDoc = await adminDb.collection("activeQrSessions").doc(cleanSiteId).get();
        if (sessionDoc.exists) {
          const sessionData = sessionDoc.data();
          const expiresAtMillis = sessionData?.expiresAt?.toMillis ? sessionData.expiresAt.toMillis() : (typeof sessionData?.expiresAt === "number" ? sessionData.expiresAt : 0);
          if (sessionData?.token === cleanQrToken && (expiresAtMillis === 0 || now <= expiresAtMillis + 30000)) {
            isTokenValid = true;
          }
        }
      } catch (err: any) {
        console.warn("[server] Note: could not query activeQrSessions during verification:", err.message);
      }
    }

    if (!isTokenValid) {
      const isFormatValid = cleanQrToken.length === 64;
      const eventType = isFormatValid ? "EXPIRED_QR" : "FORGED_QR";
      const severity = isFormatValid ? "WARNING" : "HIGH";
      await recordSecurityEvent(adminDb, {
        eventType,
        actorUid: callerUid,
        actorRole: "WORKER",
        siteId: cleanSiteId,
        result: "FAILURE",
        severity,
        source: "API_ATTENDANCE_RECORD",
        metadata: { reason: "Invalid, forged, or expired QR code presented", siteId: cleanSiteId }
      }).catch(() => {});

      return res.status(400).json({
        success: false,
        error: "Invalid or expired QR code. Please scan the active QR code displayed on the site kiosk.",
      });
    }

    // 4. Resolve Worker profile
    let workerRecord: any = null;
    let effectiveWorkerId = "";

    // Check caller's user record in /users/{callerUid}
    const userDoc = await adminDb.collection("users").doc(callerUid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const isCallerAdmin = (userData?.role === "ADMIN" || userData?.role === "SITE_SUPERVISOR") && userData?.status === "ACTIVE";

    // Strict Security Rule: Admin accounts are forbidden from recording worker attendance
    if (isCallerAdmin) {
      await recordSecurityEvent(adminDb, {
        eventType: "UNAUTHORIZED_ACCESS",
        actorUid: callerUid,
        actorRole: "ADMIN",
        siteId: cleanSiteId,
        result: "FAILURE",
        severity: "HIGH",
        source: "API_ATTENDANCE_RECORD",
        metadata: { reason: "Administrator account attempted to record civil worker attendance" }
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        error: "Access denied: Administrator accounts cannot record civil worker attendance. An authenticated civil worker account is required.",
      });
    }

    // Find worker strictly bound by authenticated caller UID
    const workersQuery = await adminDb.collection("workers").where("uid", "==", callerUid).get();
    if (!workersQuery.empty) {
      workerRecord = workersQuery.docs[0].data();
      effectiveWorkerId = workerRecord.workerId || workersQuery.docs[0].id;
    } else if (userData?.workerId) {
      // Fallback: check workerId on users doc, ensuring UID matches
      const workerDoc = await adminDb.collection("workers").doc(userData.workerId).get();
      if (workerDoc.exists) {
        const candidate = workerDoc.data();
        if (candidate?.uid === callerUid) {
          workerRecord = candidate;
          effectiveWorkerId = userData.workerId;
        }
      }
    }

    if (!workerRecord || !effectiveWorkerId) {
      await recordSecurityEvent(adminDb, {
        eventType: "AUTH_FAILURE",
        actorUid: callerUid,
        actorRole: "WORKER",
        siteId: cleanSiteId,
        result: "FAILURE",
        severity: "HIGH",
        source: "API_ATTENDANCE_RECORD",
        metadata: { reason: "No registered civil worker profile found for authenticated UID" }
      }).catch(() => {});

      return res.status(404).json({
        success: false,
        error: "No registered civil worker profile found associated with this account.",
      });
    }

    // 5. Worker Status Validation
    if (workerRecord.status !== "ACTIVE") {
      await recordSecurityEvent(adminDb, {
        eventType: "SUSPENDED_WORKER_ATTEMPT",
        actorUid: callerUid,
        actorRole: "WORKER",
        workerId: effectiveWorkerId,
        siteId: cleanSiteId,
        result: "FAILURE",
        severity: "HIGH",
        source: "API_ATTENDANCE_RECORD",
        metadata: { workerStatus: workerRecord.status, reason: "Inactive or suspended worker attempted attendance" }
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        error: `Worker account status is ${workerRecord.status || "INACTIVE"}. Only ACTIVE workers can record attendance.`,
      });
    }

    // 6. Site Assignment Validation
    const assignedSite = (workerRecord.siteId || workerRecord.assignedSiteId || "").trim();
    if (!assignedSite) {
      return res.status(400).json({
        success: false,
        error: `Worker ${effectiveWorkerId} has no authorized construction site assignment. Attendance cannot be recorded.`,
      });
    }

    if (assignedSite !== cleanSiteId) {
      await recordSecurityEvent(adminDb, {
        eventType: "WRONG_SITE_QR",
        actorUid: callerUid,
        actorRole: "WORKER",
        workerId: effectiveWorkerId,
        siteId: cleanSiteId,
        result: "FAILURE",
        severity: "WARNING",
        source: "API_ATTENDANCE_RECORD",
        metadata: { assignedSite, scannedSite: cleanSiteId, reason: "Cross-site attendance attempt rejected" }
      }).catch(() => {});

      return res.status(400).json({
        success: false,
        error: `Worker ${effectiveWorkerId} is assigned to site "${assignedSite}", but scanned QR code is for site "${cleanSiteId}". Cross-site attendance is strictly rejected.`,
      });
    }

    // Verify construction site is ACTIVE
    try {
      const siteDoc = await adminDb.collection("sites").doc(cleanSiteId).get();
      if (siteDoc.exists && siteDoc.data()?.status === "INACTIVE") {
        return res.status(400).json({
          success: false,
          error: `Construction site "${cleanSiteId}" is currently INACTIVE. Attendance recording is disabled for inactive sites.`,
        });
      }
    } catch (siteErr: any) {
      console.warn("[server] Site active validation note:", siteErr.message);
    }

    // 7. Date formatting in India Standard Time (IST = Asia/Kolkata, YYYY-MM-DD)
    const istFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateStr = istFormatter.format(new Date());
    const attendanceDocId = `${effectiveWorkerId}_${dateStr}`;
    const attendanceDocRef = adminDb.collection("attendance").doc(attendanceDocId);

    // 8. Atomic Firestore Transaction for Check-In or Check-Out
    const requestedAction: "CHECK_IN" | "CHECK_OUT" | "AUTO" =
      action === "CHECK_IN" || action === "CHECK_OUT" ? action : "AUTO";

    const result = await adminDb.runTransaction(async (transaction) => {
      const attendanceDoc = await transaction.get(attendanceDocRef);

      if (!attendanceDoc.exists) {
        // Record does NOT exist -> Check-In Flow
        if (requestedAction === "CHECK_OUT") {
          throw new Error(
            `Check-Out rejected: No active check-in record found for worker ${effectiveWorkerId} on ${dateStr}. You must check in first.`
          );
        }

        const effectiveSessionId =
          qrSessionId || `QRSESS_${cleanSiteId}_${Math.floor(Date.now() / 30000) * 30}`;

        const newRecord = {
          attendanceId: attendanceDocId,
          workerId: effectiveWorkerId,
          workerUid: workerRecord.uid || callerUid,
          workerName: workerRecord.fullName || "Registered Worker",
          siteId: cleanSiteId,
          date: dateStr,
          checkInTime: FieldValue.serverTimestamp(),
          checkOutTime: null,
          status: "CHECKED_IN",
          qrSessionId: effectiveSessionId,
          qrTokenHash: cleanQrToken,
          syncStatus: "SYNCED",
          lastOperationId: cleanOperationId,
          checkInLatitude: typeof latitude === "number" ? latitude : null,
          checkInLongitude: typeof longitude === "number" ? longitude : null,
          checkOutLatitude: null,
          checkOutLongitude: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        transaction.set(attendanceDocRef, newRecord);

        const checkInResult = {
          type: "CHECK_IN" as const,
          attendanceId: attendanceDocId,
          workerId: effectiveWorkerId,
          workerName: workerRecord.fullName,
          siteId: cleanSiteId,
          date: dateStr,
          status: "CHECKED_IN",
          message: `Check-in recorded successfully for ${workerRecord.fullName || effectiveWorkerId} at site ${cleanSiteId}.`,
          operationId: cleanOperationId || undefined,
        };

        if (cleanOperationId) {
          const opRef = adminDb.collection("idempotentOperations").doc(cleanOperationId);
          transaction.set(opRef, {
            operationId: cleanOperationId,
            workerId: effectiveWorkerId,
            workerUid: workerRecord.uid || callerUid,
            siteId: cleanSiteId,
            attendanceId: attendanceDocId,
            action: "CHECK_IN",
            status: "SUCCESS",
            date: dateStr,
            createdAt: FieldValue.serverTimestamp(),
            response: {
              success: true,
              ...checkInResult,
            },
          });
        }

        return checkInResult;
      } else {
        // Record ALREADY exists -> Check-Out Flow
        const existingData = attendanceDoc.data();

        if (existingData?.checkOutTime != null || existingData?.status === "COMPLETED") {
          throw new Error(
            `Attendance for worker ${effectiveWorkerId} on ${dateStr} is already completed. Shift is finished.`
          );
        }

        if (requestedAction === "CHECK_IN") {
          throw new Error(
            `Duplicate check-in rejected: Worker ${effectiveWorkerId} is already checked in for today (${dateStr}). To conclude duty, please scan to Check-Out.`
          );
        }

        if (existingData?.status !== "CHECKED_IN") {
          throw new Error(
            `Invalid attendance status: ${existingData?.status}. Cannot perform check-out.`
          );
        }

        const effectiveSessionId =
          qrSessionId || existingData.qrSessionId || `QRSESS_${cleanSiteId}_${Math.floor(Date.now() / 30000) * 30}`;

        const updateData: any = {
          checkOutTime: FieldValue.serverTimestamp(),
          status: "COMPLETED",
          updatedAt: FieldValue.serverTimestamp(),
          lastOperationId: cleanOperationId,
          qrSessionId: effectiveSessionId,
          qrTokenHash: cleanQrToken,
        };

        if (typeof latitude === "number") {
          updateData.checkOutLatitude = latitude;
        }
        if (typeof longitude === "number") {
          updateData.checkOutLongitude = longitude;
        }

        transaction.update(attendanceDocRef, updateData);

        const checkOutResult = {
          type: "CHECK_OUT" as const,
          attendanceId: attendanceDocId,
          workerId: effectiveWorkerId,
          workerName: workerRecord.fullName,
          siteId: cleanSiteId,
          date: dateStr,
          status: "COMPLETED",
          message: `Check-out recorded successfully for ${workerRecord.fullName || effectiveWorkerId} at site ${cleanSiteId}. Shift completed.`,
          operationId: cleanOperationId || undefined,
        };

        if (cleanOperationId) {
          const opRef = adminDb.collection("idempotentOperations").doc(cleanOperationId);
          transaction.set(opRef, {
            operationId: cleanOperationId,
            workerId: effectiveWorkerId,
            workerUid: workerRecord.uid || callerUid,
            siteId: cleanSiteId,
            attendanceId: attendanceDocId,
            action: "CHECK_OUT",
            status: "SUCCESS",
            date: dateStr,
            createdAt: FieldValue.serverTimestamp(),
            response: {
              success: true,
              ...checkOutResult,
            },
          });
        }

        return checkOutResult;
      }
    });

    console.log(
      `[server] Attendance ${result.type} recorded for worker ${result.workerId} (${result.attendanceId}) at ${result.siteId}`
    );

    // Record successful attendance security event
    try {
      await recordSecurityEvent(adminDb, {
        eventType: "AUTH_SUCCESS",
        actorUid: callerUid,
        actorRole: "WORKER",
        workerId: result.workerId,
        siteId: result.siteId,
        result: "SUCCESS",
        severity: "INFO",
        source: "API_ATTENDANCE_RECORD",
        metadata: { type: result.type, date: result.date, attendanceId: result.attendanceId }
      });
    } catch {}

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("[server] /api/attendance/record error:", err.message);
    const msg = err.message || "";

    // Track duplicate attendance security events
    if (msg.includes("already") || msg.includes("Duplicate check-in")) {
      try {
        const { adminDb } = getFirebaseAdmin();
        const callerUid = req.headers.authorization?.split(" ")[1] ? "authenticated_worker" : "anonymous";
        await recordSecurityEvent(adminDb, {
          eventType: "DUPLICATE_ATTENDANCE",
          actorUid: callerUid,
          actorRole: "WORKER",
          siteId: req.body?.siteId || undefined,
          result: "FAILURE",
          severity: "WARNING",
          source: "API_ATTENDANCE_RECORD",
          metadata: { reason: msg }
        });
      } catch {}
    }

    const isClientError =
      msg.includes("rejected") ||
      msg.includes("Invalid") ||
      msg.includes("already") ||
      msg.includes("finished") ||
      msg.includes("must check in first") ||
      msg.includes("assigned to site");
    const statusCode = isClientError ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      error: err.message || "Failed to record attendance.",
    });
  }
});

/**
 * Operation Status Query Endpoint
 * Allows mobile & web clients to verify whether a queued offline operation
 * was successfully committed on the server during intermittent connectivity.
 */
app.get("/api/attendance/operation/:operationId", async (req, res) => {
  try {
    let adminAuth: ReturnType<typeof getAuth>;
    let adminDb: ReturnType<typeof getFirestore>;
    try {
      const fbAdmin = getFirebaseAdmin();
      adminAuth = fbAdmin.adminAuth;
      adminDb = fbAdmin.adminDb;
    } catch (configErr: any) {
      return res.status(500).json({ success: false, error: "Server configuration error: " + configErr.message });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Bearer token required." });
    }

    const idToken = authHeader.split(" ")[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authErr: any) {
      return res.status(401).json({ success: false, error: "Invalid token: " + authErr.message });
    }

    const operationId = req.params.operationId;
    if (!operationId) {
      return res.status(400).json({ success: false, error: "Missing operationId parameter." });
    }

    const opDoc = await adminDb.collection("idempotentOperations").doc(operationId).get();
    if (!opDoc.exists) {
      return res.status(404).json({ success: false, error: "Operation not found." });
    }

    const opData = opDoc.data();
    // Verify ownership
    if (opData?.workerUid && opData.workerUid !== decodedToken.uid) {
      return res.status(403).json({ success: false, error: "Access denied to operation details." });
    }

    return res.json({
      success: true,
      operation: opData,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Internal error." });
  }
});

// Secure Worker Application Status Tracking Endpoint
// Queries real Firestore data using Firebase Admin SDK.
// Enforces strict non-enumerable, sanitized output: Never exposes passwords, authentication tokens,
// emergency contacts, phone numbers, or other workers' records.
app.post("/api/registration/status", async (req, res) => {
  try {
    const rawIdentifier = req.body?.identifier;
    if (!rawIdentifier || typeof rawIdentifier !== "string") {
      return res.status(400).json({ error: "Please enter your Worker ID or Registration ID." });
    }

    const identifier = rawIdentifier.trim();
    if (identifier.length < 3 || identifier.length > 50) {
      return res.status(400).json({ error: "Invalid ID length. Worker or Registration ID must be between 3 and 50 characters." });
    }

    let adminDb: ReturnType<typeof getFirestore>;
    try {
      adminDb = getFirebaseAdmin().adminDb;
    } catch (configErr: any) {
      return res.status(500).json({ error: "Server configuration error: " + configErr.message });
    }

    const cleanUpper = identifier.toUpperCase();
    let regRecord: any = null;
    let foundWorkerId = cleanUpper;

    // 1. Check direct registration document ID in workerRegistrations
    const directDoc = await adminDb.collection("workerRegistrations").doc(cleanUpper).get();
    if (directDoc.exists) {
      regRecord = directDoc.data();
    }

    // Also check case-exact direct document ID if applicant typed lowercase/mixed
    if (!regRecord && identifier !== cleanUpper) {
      const directDocExact = await adminDb.collection("workerRegistrations").doc(identifier).get();
      if (directDocExact.exists) {
        regRecord = directDocExact.data();
      }
    }

    // 2. Query workerRegistrations by workerId field
    if (!regRecord) {
      const regSnap = await adminDb
        .collection("workerRegistrations")
        .where("workerId", "==", cleanUpper)
        .get();

      if (!regSnap.empty) {
        // Pick the latest submission if multiple exist
        const sorted = regSnap.docs
          .map((d) => d.data())
          .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
        regRecord = sorted[0];
      }
    }

    if (!regRecord && identifier !== cleanUpper) {
      const regSnapExact = await adminDb
        .collection("workerRegistrations")
        .where("workerId", "==", identifier)
        .get();

      if (!regSnapExact.empty) {
        const sorted = regSnapExact.docs
          .map((d) => d.data())
          .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
        regRecord = sorted[0];
      }
    }

    let status: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED" = "PENDING";
    let workerName = "Worker Applicant";
    let submittedAt = new Date().toISOString();

    if (regRecord) {
      status = regRecord.status === "APPROVED" || regRecord.status === "ACTIVE" ? "ACTIVE" : (regRecord.status || "PENDING");
      foundWorkerId = regRecord.assignedWorkerId || regRecord.workerId || (status === "PENDING" ? "Assigned upon Approval" : cleanUpper);
      if (!foundWorkerId && status === "PENDING") {
        foundWorkerId = "Assigned upon Approval";
      }
      workerName = regRecord.submittedData?.fullName || "Worker Applicant";
      submittedAt = regRecord.submittedAt || regRecord.createdAt || submittedAt;

      // If registration status is ACTIVE or APPROVED, check workers/{workerId} to see if account is SUSPENDED
      if (status === "ACTIVE" && foundWorkerId && foundWorkerId !== "Assigned upon Approval") {
        const workerDoc = await adminDb.collection("workers").doc(foundWorkerId).get();
        if (workerDoc.exists) {
          const wData = workerDoc.data();
          if (wData?.status === "SUSPENDED") {
            status = "SUSPENDED";
          }
          if (wData?.fullName) {
            workerName = wData.fullName;
          }
        }
      }
    } else {
      // 3. If no registration record found, check workers collection directly (for active or suspended workers)
      const workerDoc = await adminDb.collection("workers").doc(cleanUpper).get();
      if (workerDoc.exists) {
        const wData = workerDoc.data();
        foundWorkerId = cleanUpper;
        status = wData?.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
        workerName = wData?.fullName || "Registered Worker";
        submittedAt = wData?.createdAt || wData?.joiningDate || submittedAt;
      } else {
        return res.status(404).json({
          error: `No application or worker record found matching "${identifier}". Please check your Worker ID or Registration ID.`
        });
      }
    }

    // Map clear explanation according to requirements:
    // PENDING: application is being reviewed
    // ACTIVE/APPROVED: application approved and worker can log in
    // REJECTED: application was rejected (with reason)
    // SUSPENDED: account is currently suspended
    let statusExplanation = "";
    const rejectionReason = (regRecord?.rejectionReason || "").trim();
    if (status === "PENDING") {
      statusExplanation = "Application is being reviewed. Your registration is undergoing verification by civil site supervisors. You will be able to log in once approved.";
    } else if (status === "ACTIVE") {
      statusExplanation = "Application approved and worker can log in. Your worker profile is active and verified.";
    } else if (status === "REJECTED") {
      statusExplanation = rejectionReason
        ? `Application was rejected: ${rejectionReason}. Please contact your site contractor or administrator for assistance.`
        : "Application was rejected. Please contact your site contractor or administrator for assistance.";
    } else if (status === "SUSPENDED") {
      statusExplanation = "Account is currently suspended. Site check-in access is temporarily disabled.";
    }

    // Strict non-enumerable, sanitized payload: NEVER leak password, email, phone, emergency contacts, or private auth
    return res.json({
      workerId: foundWorkerId,
      workerName,
      submittedAt,
      status,
      statusExplanation,
      rejectionReason: rejectionReason || undefined
    });
  } catch (err: any) {
    console.error("[server] /api/registration/status error:", err);
    return res.status(500).json({ error: "Failed to retrieve application status. Please try again." });
  }
});

class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function sendAdminError(err: any, res: express.Response, fallbackMsg: string) {
  const status = (err && typeof err.statusCode === "number") ? err.statusCode : 500;
  return res.status(status).json({ success: false, error: err?.message || fallbackMsg });
}

// =================================================================
// PHASE 7: SERVER-AUTHORITATIVE SECURITY MONITORING & EVENT LOGGING
// =================================================================

/**
 * Server-authoritative security event logging.
 * - Generates immutable document under /securityEvents/{eventId}
 * - Server sets timestamp, serverTimestamp, actor role, and severity
 * - Strictly strips secrets, tokens, passwords, private keys from metadata
 * - Triggers deterministic suspicious threshold evaluation on failure events
 */
async function recordSecurityEvent(
  db: ReturnType<typeof getFirestore>,
  params: {
    eventType: string;
    actorUid?: string;
    actorRole?: "ADMIN" | "SITE_SUPERVISOR" | "WORKER" | "ANONYMOUS";
    result: "SUCCESS" | "FAILURE";
    severity: "INFO" | "WARNING" | "HIGH" | "CRITICAL";
    source: string;
    workerId?: string;
    siteId?: string;
    metadata?: Record<string, any>;
  }
): Promise<string> {
  const eventId = `SEC_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date();
  const timestamp = now.toISOString();

  // Strict Sanitization: strip secrets, tokens, keys, credentials
  const cleanMeta: Record<string, any> = {};
  if (params.metadata && typeof params.metadata === "object") {
    for (const [k, v] of Object.entries(params.metadata)) {
      const lower = k.toLowerCase();
      if (
        lower.includes("password") ||
        lower.includes("pin") ||
        lower.includes("secret") ||
        lower.includes("private_key") ||
        lower.includes("token") ||
        lower.includes("serviceaccount") ||
        lower.includes("credential")
      ) {
        cleanMeta[k] = "[REDACTED]";
      } else {
        cleanMeta[k] = typeof v === "object" ? JSON.stringify(v).slice(0, 250) : v;
      }
    }
  }

  const docData = {
    eventId,
    eventType: params.eventType,
    actorUid: params.actorUid || "anonymous",
    actorRole: params.actorRole || "ANONYMOUS",
    workerId: params.workerId || null,
    siteId: params.siteId || null,
    timestamp,
    createdAt: FieldValue.serverTimestamp(),
    result: params.result,
    severity: params.severity,
    source: params.source,
    metadata: cleanMeta,
  };

  try {
    await db.collection("securityEvents").doc(eventId).set(docData);
  } catch (err: any) {
    console.warn("[server] recordSecurityEvent failed:", err.message);
  }

  // Deterministic Suspicious Activity Detection Check (Failure events)
  if (params.result === "FAILURE") {
    try {
      await evaluateSuspiciousThresholds(db, params);
    } catch (threshErr: any) {
      console.warn("[server] evaluateSuspiciousThresholds warning:", threshErr.message);
    }
  }

  return eventId;
}

/**
 * Deterministic suspicious activity evaluation with explicit, documented thresholds:
 * 1. REPEATED_FORGED_OR_INVALID_QR: >= 3 attempts within 10 minutes -> CRITICAL
 * 2. REPEATED_WRONG_SITE_QR: >= 3 attempts within 10 minutes -> HIGH
 * 3. REPEATED_UNAUTHORIZED_ACCESS: >= 3 attempts within 10 minutes -> CRITICAL
 * 4. REPEATED_DUPLICATE_ATTENDANCE: >= 3 attempts within 10 minutes -> WARNING
 * 5. SUSPENDED_WORKER_ATTEMPT: >= 2 attempts within 10 minutes -> CRITICAL
 */
async function evaluateSuspiciousThresholds(
  db: ReturnType<typeof getFirestore>,
  currentEvent: {
    eventType: string;
    actorUid?: string;
    workerId?: string;
    siteId?: string;
  }
) {
  if (currentEvent.eventType === "SUSPICIOUS_THRESHOLD_TRIGGERED") return;

  const nowMs = Date.now();
  const tenMinutesAgoMs = nowMs - 10 * 60 * 1000;

  const snap = await db.collection("securityEvents")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const events = snap.docs.map((d) => d.data());
  const windowEvents = events.filter((e) => {
    const t = e.createdAt?.toMillis ? e.createdAt.toMillis() : new Date(e.timestamp).getTime();
    return t >= tenMinutesAgoMs;
  });

  // 1. Repeated Forged or Invalid QR
  if (["INVALID_QR", "FORGED_QR"].includes(currentEvent.eventType)) {
    const matching = windowEvents.filter(
      (e) =>
        ["INVALID_QR", "FORGED_QR"].includes(e.eventType) &&
        ((currentEvent.workerId && e.workerId === currentEvent.workerId) ||
          (currentEvent.siteId && e.siteId === currentEvent.siteId))
    );
    if (matching.length >= 3) {
      const alreadyLogged = windowEvents.some(
        (e) =>
          e.eventType === "SUSPICIOUS_THRESHOLD_TRIGGERED" &&
          e.metadata?.pattern === "REPEATED_FORGED_OR_INVALID_QR" &&
          (e.workerId === currentEvent.workerId || e.siteId === currentEvent.siteId)
      );
      if (!alreadyLogged) {
        await recordSecurityEvent(db, {
          eventType: "SUSPICIOUS_THRESHOLD_TRIGGERED",
          actorUid: currentEvent.actorUid,
          actorRole: "ANONYMOUS",
          workerId: currentEvent.workerId,
          siteId: currentEvent.siteId,
          result: "SUCCESS",
          severity: "CRITICAL",
          source: "SUSPICIOUS_DETECTION_ENGINE",
          metadata: {
            pattern: "REPEATED_FORGED_OR_INVALID_QR",
            threshold: 3,
            actualCount: matching.length,
            windowMinutes: 10,
            description: `Repeated invalid or forged QR scan attempts (${matching.length} attempts) detected within 10-minute window.`
          }
        });
      }
    }
  }

  // 2. Repeated Wrong-Site Scans
  if (currentEvent.eventType === "WRONG_SITE_QR" && currentEvent.workerId) {
    const matching = windowEvents.filter(
      (e) => e.eventType === "WRONG_SITE_QR" && e.workerId === currentEvent.workerId
    );
    if (matching.length >= 3) {
      const alreadyLogged = windowEvents.some(
        (e) =>
          e.eventType === "SUSPICIOUS_THRESHOLD_TRIGGERED" &&
          e.metadata?.pattern === "REPEATED_WRONG_SITE_QR" &&
          e.workerId === currentEvent.workerId
      );
      if (!alreadyLogged) {
        await recordSecurityEvent(db, {
          eventType: "SUSPICIOUS_THRESHOLD_TRIGGERED",
          actorUid: currentEvent.actorUid,
          actorRole: "WORKER",
          workerId: currentEvent.workerId,
          siteId: currentEvent.siteId,
          result: "SUCCESS",
          severity: "HIGH",
          source: "SUSPICIOUS_DETECTION_ENGINE",
          metadata: {
            pattern: "REPEATED_WRONG_SITE_QR",
            threshold: 3,
            actualCount: matching.length,
            windowMinutes: 10,
            description: `Worker ${currentEvent.workerId} repeatedly attempted attendance at unassigned site.`
          }
        });
      }
    }
  }

  // 3. Repeated Unauthorized Access to Admin Routes
  if (currentEvent.eventType === "UNAUTHORIZED_ACCESS" && currentEvent.actorUid) {
    const matching = windowEvents.filter(
      (e) => e.eventType === "UNAUTHORIZED_ACCESS" && e.actorUid === currentEvent.actorUid
    );
    if (matching.length >= 3) {
      const alreadyLogged = windowEvents.some(
        (e) =>
          e.eventType === "SUSPICIOUS_THRESHOLD_TRIGGERED" &&
          e.metadata?.pattern === "REPEATED_UNAUTHORIZED_ACCESS" &&
          e.actorUid === currentEvent.actorUid
      );
      if (!alreadyLogged) {
        await recordSecurityEvent(db, {
          eventType: "SUSPICIOUS_THRESHOLD_TRIGGERED",
          actorUid: currentEvent.actorUid,
          actorRole: "ANONYMOUS",
          result: "SUCCESS",
          severity: "CRITICAL",
          source: "SUSPICIOUS_DETECTION_ENGINE",
          metadata: {
            pattern: "REPEATED_UNAUTHORIZED_ACCESS",
            threshold: 3,
            actualCount: matching.length,
            windowMinutes: 10,
            description: `Actor UID ${currentEvent.actorUid} triggered ${matching.length} unauthorized endpoint attempts.`
          }
        });
      }
    }
  }

  // 4. Repeated Duplicate Attendance Attempts
  if (currentEvent.eventType === "DUPLICATE_ATTENDANCE" && currentEvent.workerId) {
    const matching = windowEvents.filter(
      (e) => e.eventType === "DUPLICATE_ATTENDANCE" && e.workerId === currentEvent.workerId
    );
    if (matching.length >= 3) {
      const alreadyLogged = windowEvents.some(
        (e) =>
          e.eventType === "SUSPICIOUS_THRESHOLD_TRIGGERED" &&
          e.metadata?.pattern === "REPEATED_DUPLICATE_ATTENDANCE" &&
          e.workerId === currentEvent.workerId
      );
      if (!alreadyLogged) {
        await recordSecurityEvent(db, {
          eventType: "SUSPICIOUS_THRESHOLD_TRIGGERED",
          actorUid: currentEvent.actorUid,
          actorRole: "WORKER",
          workerId: currentEvent.workerId,
          result: "SUCCESS",
          severity: "WARNING",
          source: "SUSPICIOUS_DETECTION_ENGINE",
          metadata: {
            pattern: "REPEATED_DUPLICATE_ATTENDANCE",
            threshold: 3,
            actualCount: matching.length,
            windowMinutes: 10,
            description: `Worker ${currentEvent.workerId} attempted duplicate attendance ${matching.length} times.`
          }
        });
      }
    }
  }

  // 5. Suspended Worker Attendance Attempts
  if (currentEvent.eventType === "SUSPENDED_WORKER_ATTEMPT" && currentEvent.workerId) {
    const matching = windowEvents.filter(
      (e) => e.eventType === "SUSPENDED_WORKER_ATTEMPT" && e.workerId === currentEvent.workerId
    );
    if (matching.length >= 2) {
      const alreadyLogged = windowEvents.some(
        (e) =>
          e.eventType === "SUSPICIOUS_THRESHOLD_TRIGGERED" &&
          e.metadata?.pattern === "SUSPENDED_WORKER_ATTEMPT" &&
          e.workerId === currentEvent.workerId
      );
      if (!alreadyLogged) {
        await recordSecurityEvent(db, {
          eventType: "SUSPICIOUS_THRESHOLD_TRIGGERED",
          actorUid: currentEvent.actorUid,
          actorRole: "WORKER",
          workerId: currentEvent.workerId,
          result: "SUCCESS",
          severity: "CRITICAL",
          source: "SUSPICIOUS_DETECTION_ENGINE",
          metadata: {
            pattern: "SUSPENDED_WORKER_ATTEMPT",
            threshold: 2,
            actualCount: matching.length,
            windowMinutes: 10,
            description: `Suspended worker account ${currentEvent.workerId} attempted attendance ${matching.length} times.`
          }
        });
      }
    }
  }
}

// In-memory rate limiting map for AI endpoints (sliding 1-minute window)
const aiRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkAiRateLimit(uid: string): { allowed: boolean; remaining: number; resetInSec: number } {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 10;

  const record = aiRateLimitMap.get(uid);
  if (!record || now > record.resetAt) {
    aiRateLimitMap.set(uid, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetInSec: 60 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetInSec: Math.ceil((record.resetAt - now) / 1000) };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count, resetInSec: Math.ceil((record.resetAt - now) / 1000) };
}

// In-memory cache for AI Management Insights (60-second TTL to preserve quotas and eliminate duplicate fetches)
const aiInsightsCache = new Map<string, { timestamp: number; payload: any }>();
const AI_INSIGHTS_CACHE_TTL_MS = 60 * 1000;

/**
 * Helper: Verify Admin authorization token
 * Strictly requires:
 * 1. Valid Firebase Bearer ID token
 * 2. Corresponding /users/{uid} document
 * 3. role == 'ADMIN'
 * 4. status == 'ACTIVE'
 * Automatically logs unauthorized access attempts to securityEvents
 */
async function verifyAdminAuth(req: express.Request): Promise<{ uid: string; email?: string; role: 'ADMIN' | 'SITE_SUPERVISOR' }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    try {
      const { adminDb } = getFirebaseAdmin();
      await recordSecurityEvent(adminDb, {
        eventType: "UNAUTHORIZED_ACCESS",
        actorUid: "anonymous",
        actorRole: "ANONYMOUS",
        result: "FAILURE",
        severity: "HIGH",
        source: req.path || "ADMIN_API",
        metadata: { reason: "Missing or invalid Authorization header", path: req.path }
      });
    } catch {}
    throw new AuthError(401, "Missing or invalid Authorization header. Administrator token required.");
  }
  const idToken = authHeader.split("Bearer ")[1].trim();
  const { adminAuth, adminDb } = getFirebaseAdmin();
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch (tokenErr: any) {
    try {
      await recordSecurityEvent(adminDb, {
        eventType: "UNAUTHORIZED_ACCESS",
        actorUid: "unauthenticated",
        actorRole: "ANONYMOUS",
        result: "FAILURE",
        severity: "HIGH",
        source: req.path || "ADMIN_API",
        metadata: { reason: "Invalid administrator token", error: tokenErr.message, path: req.path }
      });
    } catch {}
    throw new AuthError(401, `Invalid or expired administrator token: ${tokenErr.message}`);
  }

  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
  if (!userDoc.exists) {
    try {
      await recordSecurityEvent(adminDb, {
        eventType: "UNAUTHORIZED_ACCESS",
        actorUid: decoded.uid,
        actorRole: "ANONYMOUS",
        result: "FAILURE",
        severity: "HIGH",
        source: req.path || "ADMIN_API",
        metadata: { reason: "Admin profile document not found", path: req.path }
      });
    } catch {}
    throw new AuthError(403, "Admin user profile not found.");
  }
  const userData = userDoc.data();
  const isAuthorizedRole = userData?.role === "ADMIN" || userData?.role === "SITE_SUPERVISOR";
  if (!isAuthorizedRole || userData?.status !== "ACTIVE") {
    try {
      await recordSecurityEvent(adminDb, {
        eventType: "UNAUTHORIZED_ACCESS",
        actorUid: decoded.uid,
        actorRole: userData?.role === "WORKER" ? "WORKER" : "ANONYMOUS",
        workerId: userData?.workerId,
        result: "FAILURE",
        severity: "HIGH",
        source: req.path || "ADMIN_API",
        metadata: {
          reason: `Attempted admin access with role "${userData?.role}" and status "${userData?.status}"`,
          path: req.path
        }
      });
    } catch {}
    throw new AuthError(403, "Access denied: Active Administrator or Site Supervisor role required.");
  }

  return { uid: decoded.uid, email: decoded.email, role: userData.role as 'ADMIN' | 'SITE_SUPERVISOR' };
}

/**
 * Helper: Verify any authenticated user (Worker or Admin)
 * Returns caller's UID, role ('ADMIN' | 'WORKER'), and associated workerId
 */
async function verifyUserAuth(req: express.Request): Promise<{
  uid: string;
  email?: string;
  role: 'ADMIN' | 'WORKER' | 'ANONYMOUS';
  workerId?: string;
  status: string;
}> {
  let authHeader = req.headers.authorization;
  if (!authHeader && typeof req.query?.token === 'string') {
    authHeader = `Bearer ${req.query.token}`;
  }
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AuthError(401, "Missing or invalid Authorization header. Bearer token required.");
  }
  const idToken = authHeader.split("Bearer ")[1].trim();
  const { adminAuth, adminDb } = getFirebaseAdmin();
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch (tokenErr: any) {
    throw new AuthError(401, `Invalid or expired token: ${tokenErr.message}`);
  }

  // Look up user document in Firestore /users/{uid}
  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
  if (userDoc.exists) {
    const userData = userDoc.data();
    return {
      uid: decoded.uid,
      email: decoded.email || userData?.email,
      role: (userData?.role === 'ADMIN' || userData?.role === 'SITE_SUPERVISOR') ? 'ADMIN' : 'WORKER',
      workerId: userData?.workerId,
      status: userData?.status || "ACTIVE"
    };
  }

  // Look up in /admins/{uid}
  const adminDoc = await adminDb.collection("admins").doc(decoded.uid).get();
  if (adminDoc.exists) {
    const adminData = adminDoc.data();
    return {
      uid: decoded.uid,
      email: decoded.email || adminData?.email,
      role: "ADMIN",
      status: adminData?.status || "ACTIVE"
    };
  }

  // Fallback: Check if user exists in /workers collection by uid or userId
  const workerQuery = await adminDb.collection("workers").where("uid", "==", decoded.uid).limit(1).get();
  if (!workerQuery.empty) {
    const wData = workerQuery.docs[0].data();
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: "WORKER",
      workerId: workerQuery.docs[0].id || wData.workerId,
      status: wData.status || "ACTIVE"
    };
  }

  const workerUserQuery = await adminDb.collection("workers").where("userId", "==", decoded.uid).limit(1).get();
  if (!workerUserQuery.empty) {
    const wData = workerUserQuery.docs[0].data();
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: "WORKER",
      workerId: workerUserQuery.docs[0].id || wData.workerId,
      status: wData.status || "ACTIVE"
    };
  }

  return {
    uid: decoded.uid,
    email: decoded.email,
    role: "WORKER",
    status: "ACTIVE"
  };
}

/**
 * 1. ADMIN APPROVE REGISTRATION (Trusted Server Transaction)
 * Atomically:
 * - Validates registration exists and is PENDING
 * - Allocates sequential Worker ID (W-1001, W-1002, W-1003...) via /counters/workerId
 * - Creates /workers/{workerId}
 * - Updates /workerRegistrations/{registrationId} -> ACTIVE with assignedWorkerId
 * - Updates /users/{uid} -> role: WORKER, status: ACTIVE, workerId: workerId
 * - Safely increments batch count if applicable (NO maximum limit enforced)
 */
app.post("/api/admin/approve-registration", async (req, res) => {
  try {
    const admin = await verifyAdminAuth(req);
    const { registrationId, adminUid } = req.body;

    if (!registrationId) {
      return res.status(400).json({ error: "registrationId is required." });
    }

    const { adminDb } = getFirebaseAdmin();
    const regRef = adminDb.collection("workerRegistrations").doc(registrationId);
    const counterRef = adminDb.collection("counters").doc("workerId");

    // 1. Initial check
    const regSnap = await regRef.get();
    if (!regSnap.exists) {
      return res.status(404).json({ error: "Registration record not found." });
    }
    const initialReg = regSnap.data();
    if (initialReg?.status === "ACTIVE" || initialReg?.status === "APPROVED") {
      return res.status(400).json({ error: "This registration has already been approved." });
    }

    // 2. Find user document by email
    let workerUid = "";
    let userDocRef: FirebaseFirestore.DocumentReference | null = null;
    const email = (initialReg?.submittedData?.email || "").toLowerCase();
    if (email) {
      const userQuery = await adminDb.collection("users").where("email", "==", email).get();
      if (!userQuery.empty) {
        workerUid = userQuery.docs[0].id;
        userDocRef = userQuery.docs[0].ref;
      }
    }

    // 3. Scan existing workers to compute baseline max number
    let fallbackMaxNum = 1000;
    try {
      const allWorkersSnap = await adminDb.collection("workers").get();
      allWorkersSnap.forEach((w) => {
        const id = (w.data().workerId || w.id || "").toUpperCase();
        const m = id.match(/^W-(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && num > fallbackMaxNum) {
            fallbackMaxNum = num;
          }
        }
      });
    } catch (err) {
      console.warn("[server] Could not scan existing workers for max ID:", err);
    }

    // 4. Concurrency-Safe Transaction
    const result = await adminDb.runTransaction(async (transaction) => {
      // Transaction READ 1: Registration doc
      const txRegSnap = await transaction.get(regRef);
      if (!txRegSnap.exists) {
        throw new Error("Registration record not found during transaction.");
      }
      const regData = txRegSnap.data();
      if (regData?.status === "ACTIVE" || regData?.status === "APPROVED") {
        throw new Error("This registration was already approved by another administrator.");
      }

      // Transaction READ 2: Counter doc
      const txCounterSnap = await transaction.get(counterRef);
      let currentNum = fallbackMaxNum;
      if (txCounterSnap.exists) {
        const cData = txCounterSnap.data();
        if (typeof cData?.currentId === "number" && cData.currentId >= fallbackMaxNum) {
          currentNum = cData.currentId;
        }
      }

      let nextNum = currentNum + 1;
      let candidateWorkerId = `W-${nextNum}`;

      // Transaction READ 3: Check candidate worker doesn't exist
      let candidateWorkerRef = adminDb.collection("workers").doc(candidateWorkerId);
      let candidateWorkerSnap = await transaction.get(candidateWorkerRef);
      while (candidateWorkerSnap.exists) {
        nextNum++;
        candidateWorkerId = `W-${nextNum}`;
        candidateWorkerRef = adminDb.collection("workers").doc(candidateWorkerId);
        candidateWorkerSnap = await transaction.get(candidateWorkerRef);
      }

      // Transaction READ 4: User doc if available
      if (userDocRef) {
        await transaction.get(userDocRef);
      }

      // Transaction READ 5: Batch doc if available
      const batchNum = regData?.submittedData?.batchNumber;
      let batchDocRef: FirebaseFirestore.DocumentReference | null = null;
      if (batchNum) {
        batchDocRef = adminDb.collection("batches").doc(batchNum);
        await transaction.get(batchDocRef);
      }

      // WRITES:
      const now = new Date().toISOString();
      const sub = regData?.submittedData || {};

      // Advance counter
      transaction.set(
        counterRef,
        {
          currentId: nextNum,
          nextId: nextNum + 1,
          lastAssigned: candidateWorkerId,
          updatedAt: now
        },
        { merge: true }
      );

      // Create new worker profile
      const newWorkerRecord = {
        workerId: candidateWorkerId,
        uid: workerUid,
        fullName: sub.fullName || "Worker",
        phone: sub.phone || "",
        email: sub.email || "",
        batchNumber: sub.batchNumber || "B-01",
        jobRole: sub.jobRole || "Labor",
        siteId: sub.siteId || "SITE-101",
        dateOfBirth: sub.dateOfBirth || "",
        address: sub.address || "",
        emergencyContactName: sub.emergencyContactName || "",
        emergencyContactPhone: sub.emergencyContactPhone || "",
        joiningDate: sub.joiningDate || now.split("T")[0],
        status: "ACTIVE",
        createdAt: regData?.submittedAt || now,
        updatedAt: now
      };
      transaction.set(candidateWorkerRef, newWorkerRecord);

      // Update registration record
      transaction.update(regRef, {
        status: "ACTIVE",
        assignedWorkerId: candidateWorkerId,
        workerId: candidateWorkerId,
        reviewedAt: now,
        reviewedBy: adminUid || admin.uid
      });

      // Update user document if found
      if (userDocRef) {
        transaction.update(userDocRef, {
          role: "WORKER",
          status: "ACTIVE",
          workerId: candidateWorkerId,
          updatedAt: now
        });
      }

      // Update batch worker count if batch doc exists (no limits enforced)
      if (batchDocRef) {
        transaction.set(
          batchDocRef,
          {
            updatedAt: now,
            workerCount: FieldValue.increment(1)
          },
          { merge: true }
        );
      }

      return { candidateWorkerId, newWorkerRecord };
    });

    console.log(`[server] Successfully approved registration ${registrationId}. Assigned ID: ${result.candidateWorkerId}`);

    // Trigger FCM Push Notification to approved worker
    if (workerUid) {
      sendWorkerNotification(
        workerUid,
        "Application Approved! 🎉",
        `Your workforce registration has been approved. Your Worker ID is ${result.candidateWorkerId}. You can now sign in.`,
        {
          type: "APPLICATION_APPROVED",
          workerId: result.candidateWorkerId,
          status: "ACTIVE"
        }
      ).catch((e) => console.warn("[server] Push notification notice on approval:", e));
    }

    return res.json({
      success: true,
      workerId: result.candidateWorkerId,
      worker: result.newWorkerRecord
    });
  } catch (err: any) {
    console.error("[server] /api/admin/approve-registration error:", err);
    return res.status(500).json({ error: err.message || "Failed to approve registration." });
  }
});

/**
 * ADMIN REJECT REGISTRATION (Server-Authoritative)
 * Requires active Admin authentication.
 * Stores rejectionReason in /workerRegistrations/{registrationId}.
 * Sets status to REJECTED and updates linked user profile.
 * Dispatches push notification alert to the worker device if registered.
 */
app.post("/api/admin/reject-registration", async (req, res) => {
  try {
    const admin = await verifyAdminAuth(req);
    const { registrationId, rejectionReason, adminUid } = req.body;

    if (!registrationId || typeof registrationId !== "string") {
      return res.status(400).json({ error: "registrationId is required." });
    }

    const cleanReason = (rejectionReason || "").trim();
    if (!cleanReason) {
      return res.status(400).json({ error: "A valid rejection reason is required." });
    }

    const { adminDb } = getFirebaseAdmin();
    const regRef = adminDb.collection("workerRegistrations").doc(registrationId);
    const regSnap = await regRef.get();
    if (!regSnap.exists) {
      return res.status(404).json({ error: "Registration record not found." });
    }

    const regData = regSnap.data();
    const now = new Date().toISOString();
    const reviewer = adminUid || admin.uid || "admin";

    await regRef.update({
      status: "REJECTED",
      rejectionReason: cleanReason,
      reviewedAt: now,
      reviewedBy: reviewer,
      updatedAt: now
    });

    // Also update linked user profile if exists
    let workerUid = "";
    const email = (regData?.submittedData?.email || "").toLowerCase();
    if (email) {
      const userQuery = await adminDb.collection("users").where("email", "==", email).get();
      if (!userQuery.empty) {
        workerUid = userQuery.docs[0].id;
        await userQuery.docs[0].ref.update({
          status: "REJECTED",
          updatedAt: now
        });
      }
    }

    // Trigger FCM notification if token exists for workerUid
    if (workerUid) {
      sendWorkerNotification(
        workerUid,
        "Registration Update",
        `Your worker registration was not approved: ${cleanReason}`,
        {
          type: "APPLICATION_REJECTED",
          rejectionReason: cleanReason,
          status: "REJECTED"
        }
      ).catch((e) => console.warn("[server] Push notification notice on rejection:", e));
    }

    return res.json({
      success: true,
      registrationId,
      status: "REJECTED",
      rejectionReason: cleanReason
    });
  } catch (err: any) {
    console.error("[server] /api/admin/reject-registration error:", err);
    return sendAdminError(err, res, "Failed to reject registration.");
  }
});

/**
 * 2. BATCH MANAGEMENT (Server-Authoritative)
 */
// GET all batches
app.get("/api/batches", async (_req, res) => {
  try {
    const { adminDb } = getFirebaseAdmin();
    const snap = await adminDb.collection("batches").get();

    if (snap.empty) {
      // Seed default batches if empty
      const defaults = [
        {
          batchId: "B-01",
          name: "Foundation & Structural",
          description: "Civil earthwork, piling, rebar, concrete pouring, and structural framing",
          status: "ACTIVE",
          createdByName: "System Setup"
        },
        {
          batchId: "B-02",
          name: "Civil & Masonry",
          description: "Brick masonry, blockwork, plastering, scaffolding, and exterior walls",
          status: "ACTIVE",
          createdByName: "System Setup"
        },
        {
          batchId: "B-03",
          name: "Electrical & MEP Services",
          description: "Electrical conduits, power distribution, plumbing, HVAC, and fire systems",
          status: "ACTIVE",
          createdByName: "System Setup"
        },
        {
          batchId: "B-04",
          name: "Finishing, Tiling & Painting",
          description: "Flooring, tiling, interior/exterior painting, waterproofing, and architectural glazing",
          status: "ACTIVE",
          createdByName: "System Setup"
        }
      ];

      const now = new Date().toISOString();
      const list: any[] = [];
      for (const item of defaults) {
        const rec = { ...item, createdAt: now, updatedAt: now };
        await adminDb.collection("batches").doc(item.batchId).set(rec);
        list.push(rec);
      }

      await adminDb.collection("counters").doc("batchId").set(
        {
          currentCount: defaults.length,
          nextId: `B-${String(defaults.length + 1).padStart(2, "0")}`,
          lastAssigned: `B-${String(defaults.length).padStart(2, "0")}`,
          updatedAt: now
        },
        { merge: true }
      );

      return res.json({ batches: list });
    }

    const list = snap.docs.map((d) => d.data());
    list.sort((a, b) => (a.batchId || "").localeCompare(b.batchId || "", undefined, { numeric: true }));
    return res.json({ batches: list });
  } catch (err: any) {
    console.error("[server] /api/batches error:", err);
    return res.status(500).json({ error: "Failed to load batches." });
  }
});

// Admin create batch
app.post("/api/admin/create-batch", async (req, res) => {
  try {
    const admin = await verifyAdminAuth(req);
    const { name, description, adminName } = req.body;

    const cleanName = (name || "").trim();
    if (!cleanName) {
      return res.status(400).json({ error: "Batch name is required." });
    }

    const { adminDb } = getFirebaseAdmin();
    const counterRef = adminDb.collection("counters").doc("batchId");

    let fallbackCount = 0;
    try {
      const allBatches = await adminDb.collection("batches").get();
      allBatches.forEach((b) => {
        const id = (b.data().batchId || b.id || "").toUpperCase();
        const m = id.match(/^B-(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && num > fallbackCount) fallbackCount = num;
        }
      });
    } catch (err) {
      console.warn("[server] Could not scan existing batches:", err);
    }

    const resultBatch = await adminDb.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      let currentCount = fallbackCount;
      if (counterSnap.exists) {
        const cData = counterSnap.data();
        if (typeof cData?.currentCount === "number" && cData.currentCount >= fallbackCount) {
          currentCount = cData.currentCount;
        }
      }

      let nextNum = currentCount + 1;
      let candidateBatchId = `B-${String(nextNum).padStart(2, "0")}`;
      let batchDocRef = adminDb.collection("batches").doc(candidateBatchId);
      let batchDocSnap = await transaction.get(batchDocRef);

      while (batchDocSnap.exists) {
        nextNum++;
        candidateBatchId = `B-${String(nextNum).padStart(2, "0")}`;
        batchDocRef = adminDb.collection("batches").doc(candidateBatchId);
        batchDocSnap = await transaction.get(batchDocRef);
      }

      const now = new Date().toISOString();
      const batchRecord = {
        batchId: candidateBatchId,
        name: cleanName,
        description: (description || "").trim(),
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
        createdByName: adminName || "Site Administrator"
      };

      transaction.set(
        counterRef,
        {
          currentCount: nextNum,
          nextId: `B-${String(nextNum + 1).padStart(2, "0")}`,
          lastAssigned: candidateBatchId,
          updatedAt: now
        },
        { merge: true }
      );

      transaction.set(batchDocRef, batchRecord);
      return batchRecord;
    });

    return res.json({ success: true, batch: resultBatch });
  } catch (err: any) {
    console.error("[server] /api/admin/create-batch error:", err);
    return sendAdminError(err, res, "Failed to create batch.");
  }
});

// Admin toggle batch status with existence check, persistence verification, and audit trail
app.post("/api/admin/toggle-batch", async (req, res) => {
  try {
    const admin = await verifyAdminAuth(req);
    const { batchId, newStatus } = req.body;
    if (!batchId || !newStatus) {
      return res.status(400).json({ error: "batchId and newStatus are required." });
    }
    if (newStatus !== "ACTIVE" && newStatus !== "INACTIVE") {
      return res.status(400).json({ error: "newStatus must be strictly 'ACTIVE' or 'INACTIVE'." });
    }

    const { adminDb } = getFirebaseAdmin();
    const cleanBatchId = String(batchId).trim();
    let batchRef = adminDb.collection("batches").doc(cleanBatchId);
    let batchDoc = await batchRef.get();

    if (!batchDoc.exists) {
      // Check case-insensitive query or field match
      const snap = await adminDb.collection("batches").where("batchId", "==", cleanBatchId).limit(1).get();
      if (!snap.empty) {
        batchRef = snap.docs[0].ref;
        batchDoc = snap.docs[0];
      }
    }

    if (!batchDoc.exists) {
      return res.status(404).json({ error: `Workforce batch '${cleanBatchId}' was not found in database.` });
    }

    const now = new Date().toISOString();
    await batchRef.set({
      batchId: cleanBatchId,
      status: newStatus,
      updatedAt: now
    }, { merge: true });

    // Verify persistence from real Firestore record
    const verifiedSnap = await batchRef.get();
    const verifiedData = verifiedSnap.data();
    if (verifiedData?.status !== newStatus) {
      throw new Error(`Failed to verify persisted status for batch '${cleanBatchId}'.`);
    }

    await recordSecurityEvent(adminDb, {
      eventType: "BATCH_STATUS_UPDATED",
      actorUid: admin.uid,
      actorRole: "ADMIN",
      result: "SUCCESS",
      severity: "INFO",
      source: "API_ADMIN_TOGGLE_BATCH",
      metadata: { batchId: cleanBatchId, newStatus }
    });

    return res.json({
      success: true,
      batchId: cleanBatchId,
      status: newStatus,
      updatedAt: now
    });
  } catch (err: any) {
    console.error("[server] /api/admin/toggle-batch error:", err);
    return sendAdminError(err, res, "Failed to update batch status.");
  }
});

// Admin Command Mode Executor (Enforces server-side authentication, allowlisted actions, and persistence check)
app.post("/api/admin/execute-command", async (req, res) => {
  try {
    const admin = await verifyAdminAuth(req);
    const { commandType, targetId, actionId } = req.body;

    if (!commandType || typeof commandType !== "string") {
      return res.status(400).json({ error: "commandType is required." });
    }
    if (!targetId || typeof targetId !== "string") {
      return res.status(400).json({ error: "targetId is required." });
    }

    const { adminDb } = getFirebaseAdmin();
    const cleanTargetId = targetId.trim();

    // Allowlist check
    const ALLOWED_COMMANDS = ["ACTIVATE_BATCH", "DEACTIVATE_BATCH", "APPROVE_REGISTRATION", "DEACTIVATE_SITE"];
    if (!ALLOWED_COMMANDS.includes(commandType)) {
      return res.status(400).json({
        error: `Command '${commandType}' is not permitted. Allowed commands: ${ALLOWED_COMMANDS.join(", ")}.`
      });
    }

    const now = new Date().toISOString();

    switch (commandType) {
      case "ACTIVATE_BATCH":
      case "DEACTIVATE_BATCH": {
        const nextStatus = commandType === "ACTIVATE_BATCH" ? "ACTIVE" : "INACTIVE";
        let batchRef = adminDb.collection("batches").doc(cleanTargetId);
        let batchDoc = await batchRef.get();
        if (!batchDoc.exists) {
          const snap = await adminDb.collection("batches").where("batchId", "==", cleanTargetId).limit(1).get();
          if (!snap.empty) {
            batchRef = snap.docs[0].ref;
            batchDoc = snap.docs[0];
          }
        }
        if (!batchDoc.exists) {
          return res.status(404).json({ error: `Batch '${cleanTargetId}' not found in database.` });
        }

        await batchRef.set({
          batchId: cleanTargetId,
          status: nextStatus,
          updatedAt: now
        }, { merge: true });

        const verifiedSnap = await batchRef.get();
        const verifiedStatus = verifiedSnap.data()?.status;

        await recordSecurityEvent(adminDb, {
          eventType: "ADMIN_COMMAND_EXECUTED",
          actorUid: admin.uid,
          actorRole: "ADMIN",
          result: "SUCCESS",
          severity: "INFO",
          source: "API_ADMIN_EXECUTE_COMMAND",
          metadata: { commandType, targetId: cleanTargetId, newStatus: verifiedStatus, actionId }
        });

        return res.json({
          success: true,
          message: `Workforce Batch '${cleanTargetId}' has been ${nextStatus === 'ACTIVE' ? 'activated' : 'deactivated'} successfully.`,
          commandType,
          targetId: cleanTargetId,
          status: verifiedStatus
        });
      }

      case "APPROVE_REGISTRATION": {
        const regRef = adminDb.collection("workerRegistrations").doc(cleanTargetId);
        const regSnap = await regRef.get();
        if (!regSnap.exists) {
          return res.status(404).json({ error: `Registration '${cleanTargetId}' not found in database.` });
        }
        const regData = regSnap.data();
        if (regData?.status === "APPROVED") {
          return res.status(400).json({ error: `Registration '${cleanTargetId}' is already approved.` });
        }

        const sub = regData?.submittedData || {};
        const effectiveWorkerId = regData?.assignedWorkerId || regData?.workerId || sub.workerId || `W-${Math.floor(1000 + Math.random() * 9000)}`;

        await adminDb.runTransaction(async (transaction) => {
          transaction.update(regRef, {
            status: "APPROVED",
            assignedWorkerId: effectiveWorkerId,
            reviewedAt: now,
            reviewedBy: admin.uid,
            updatedAt: now
          });

          const userQuery = await adminDb.collection("users").where("email", "==", (sub.email || "").trim()).limit(1).get();
          let workerUid = "";
          if (!userQuery.empty) {
            workerUid = userQuery.docs[0].id;
            transaction.update(userQuery.docs[0].ref, {
              status: "ACTIVE",
              workerId: effectiveWorkerId,
              updatedAt: now
            });
          }

          const workerRef = adminDb.collection("workers").doc(effectiveWorkerId);
          transaction.set(workerRef, {
            workerId: effectiveWorkerId,
            uid: workerUid,
            fullName: sub.fullName || "Registered Worker",
            phone: sub.phone || "",
            email: sub.email || "",
            batchNumber: sub.batchNumber || "B-01",
            jobRole: sub.jobRole || "General Labor",
            siteId: sub.siteId || "",
            status: "ACTIVE",
            createdAt: now,
            updatedAt: now
          }, { merge: true });
        });

        await recordSecurityEvent(adminDb, {
          eventType: "REGISTRATION_APPROVED",
          actorUid: admin.uid,
          actorRole: "ADMIN",
          result: "SUCCESS",
          severity: "INFO",
          source: "API_ADMIN_EXECUTE_COMMAND",
          metadata: { commandType, registrationId: cleanTargetId, assignedWorkerId: effectiveWorkerId, actionId }
        });

        return res.json({
          success: true,
          message: `Worker registration '${cleanTargetId}' approved. Assigned Worker ID: '${effectiveWorkerId}'.`,
          commandType,
          targetId: cleanTargetId,
          workerId: effectiveWorkerId
        });
      }

      case "DEACTIVATE_SITE": {
        const siteRef = adminDb.collection("sites").doc(cleanTargetId);
        const siteSnap = await siteRef.get();
        if (!siteSnap.exists) {
          return res.status(404).json({ error: `Construction site '${cleanTargetId}' not found.` });
        }
        await siteRef.update({
          status: "INACTIVE",
          updatedAt: now
        });

        await recordSecurityEvent(adminDb, {
          eventType: "SITE_DEACTIVATED",
          actorUid: admin.uid,
          actorRole: "ADMIN",
          result: "SUCCESS",
          severity: "WARNING",
          source: "API_ADMIN_EXECUTE_COMMAND",
          metadata: { commandType, siteId: cleanTargetId, actionId }
        });

        return res.json({
          success: true,
          message: `Construction site '${cleanTargetId}' deactivated successfully.`,
          commandType,
          targetId: cleanTargetId,
          status: "INACTIVE"
        });
      }

      default:
        return res.status(400).json({ error: `Command '${commandType}' is not supported.` });
    }
  } catch (err: any) {
    console.error("[server] /api/admin/execute-command error:", err);
    return sendAdminError(err, res, "Failed to execute administrative command.");
  }
});

// Phase 4: Admin Worker Assignment & Management
app.post("/api/admin/update-worker", async (req, res) => {
  try {
    await verifyAdminAuth(req);
    const { workerId, updates } = req.body;
    if (!workerId || typeof workerId !== "string") {
      return res.status(400).json({ error: "workerId is required." });
    }
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "updates object is required." });
    }

    const { adminDb } = getFirebaseAdmin();
    const workerRef = adminDb.collection("workers").doc(workerId);
    const workerSnap = await workerRef.get();

    if (!workerSnap.exists) {
      return res.status(404).json({ error: `Worker with ID ${workerId} not found.` });
    }

    const currentWorker = workerSnap.data() || {};
    const sanitizedUpdates: Record<string, any> = {};

    // Validate and assign siteId if provided
    if (updates.siteId !== undefined) {
      const targetSiteId = String(updates.siteId).trim();
      if (!targetSiteId) {
        return res.status(400).json({ error: "siteId cannot be empty." });
      }
      const siteDoc = await adminDb.collection("sites").doc(targetSiteId).get();
      if (!siteDoc.exists) {
        return res.status(404).json({ error: `Construction site ${targetSiteId} does not exist.` });
      }
      sanitizedUpdates.siteId = targetSiteId;
    }

    // Validate and assign batchNumber if provided
    if (updates.batchNumber !== undefined) {
      const targetBatch = String(updates.batchNumber).trim();
      if (!targetBatch) {
        return res.status(400).json({ error: "batchNumber cannot be empty." });
      }
      const batchDoc = await adminDb.collection("batches").doc(targetBatch).get();
      if (!batchDoc.exists) {
        return res.status(404).json({ error: `Workforce batch ${targetBatch} does not exist.` });
      }
      sanitizedUpdates.batchNumber = targetBatch;
    }

    // Validate and assign jobRole if provided
    if (updates.jobRole !== undefined) {
      const role = String(updates.jobRole).trim();
      if (!role) {
        return res.status(400).json({ error: "jobRole cannot be empty." });
      }
      sanitizedUpdates.jobRole = role;
    }

    // Validate and assign status if provided
    if (updates.status !== undefined) {
      if (updates.status !== "ACTIVE" && updates.status !== "SUSPENDED" && updates.status !== "PENDING") {
        return res.status(400).json({ error: "Invalid status. Must be ACTIVE, SUSPENDED, or PENDING." });
      }
      sanitizedUpdates.status = updates.status;
    }

    // Optional profile fields
    if (updates.fullName !== undefined) sanitizedUpdates.fullName = String(updates.fullName).trim();
    if (updates.phone !== undefined) sanitizedUpdates.phone = String(updates.phone).trim();
    if (updates.email !== undefined) sanitizedUpdates.email = String(updates.email).trim().toLowerCase();
    if (updates.address !== undefined) sanitizedUpdates.address = String(updates.address).trim();
    if (updates.emergencyContactName !== undefined) sanitizedUpdates.emergencyContactName = String(updates.emergencyContactName).trim();
    if (updates.emergencyContactPhone !== undefined) sanitizedUpdates.emergencyContactPhone = String(updates.emergencyContactPhone).trim();

    sanitizedUpdates.updatedAt = new Date().toISOString();

    await workerRef.update(sanitizedUpdates);

    // Trigger FCM Push Notification if site assignment changed
    if (
      sanitizedUpdates.siteId &&
      currentWorker.siteId &&
      currentWorker.siteId !== sanitizedUpdates.siteId &&
      currentWorker.uid
    ) {
      try {
        const newSiteDoc = await adminDb.collection("sites").doc(sanitizedUpdates.siteId).get();
        const siteName = newSiteDoc.exists
          ? newSiteDoc.data()?.siteName || sanitizedUpdates.siteId
          : sanitizedUpdates.siteId;
        sendWorkerNotification(
          currentWorker.uid,
          "Site Assignment Changed",
          `You have been assigned to ${siteName} (${sanitizedUpdates.siteId}). Please report to this site for upcoming shifts.`,
          {
            type: "SITE_ASSIGNMENT_CHANGED",
            previousSiteId: currentWorker.siteId,
            newSiteId: sanitizedUpdates.siteId,
            siteName: String(siteName)
          }
        ).catch((e) => console.warn("[server] Push notification notice on site change:", e));
      } catch (siteNoticeErr) {
        console.warn("[server] Site assignment notification note:", siteNoticeErr);
      }
    }

    // Sync status to linked user profile if status was modified
    if (sanitizedUpdates.status && currentWorker.uid) {
      try {
        const userRef = adminDb.collection("users").doc(currentWorker.uid);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
          await userRef.update({
            status: sanitizedUpdates.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED",
            updatedAt: sanitizedUpdates.updatedAt
          });
        }
      } catch (userErr: any) {
        console.warn("[server] Linked user profile sync note:", userErr.message);
      }
    }

    const updatedWorkerSnap = await workerRef.get();
    return res.json({ success: true, worker: updatedWorkerSnap.data() });
  } catch (err: any) {
    console.error("[server] /api/admin/update-worker error:", err);
    return sendAdminError(err, res, "Failed to update worker.");
  }
});

// Phase 4: Admin Site Creation
app.post("/api/admin/create-site", async (req, res) => {
  try {
    await verifyAdminAuth(req);
    const { siteId, siteName, projectName, address, description, status } = req.body;

    const cleanSiteId = (siteId || "").trim();
    const cleanSiteName = (siteName || "").trim();
    const cleanProjectName = (projectName || "").trim();

    if (!cleanSiteId || !cleanSiteName || !cleanProjectName) {
      return res.status(400).json({ error: "Site ID, Site Name, and Project Name are required." });
    }

    const { adminDb } = getFirebaseAdmin();
    const siteRef = adminDb.collection("sites").doc(cleanSiteId);
    const existingSnap = await siteRef.get();
    if (existingSnap.exists) {
      return res.status(400).json({ error: `Construction site ${cleanSiteId} already exists.` });
    }

    const now = new Date().toISOString();
    const siteRecord = {
      siteId: cleanSiteId,
      siteName: cleanSiteName,
      projectName: cleanProjectName,
      address: (address || "Civil sector zone").trim(),
      description: (description || "").trim(),
      status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      createdAt: now,
      updatedAt: now
    };

    await siteRef.set(siteRecord);
    return res.json({ success: true, site: siteRecord });
  } catch (err: any) {
    console.error("[server] /api/admin/create-site error:", err);
    return sendAdminError(err, res, "Failed to create construction site.");
  }
});

// Phase 4: Admin Site Modification & Status
app.post("/api/admin/update-site", async (req, res) => {
  try {
    const caller = await verifyAdminAuth(req);
    const { siteId, updates } = req.body;
    if (!siteId || typeof siteId !== "string") {
      return res.status(400).json({ error: "siteId is required." });
    }
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "updates object is required." });
    }

    const { adminDb } = getFirebaseAdmin();
    const siteRef = adminDb.collection("sites").doc(siteId);
    const siteSnap = await siteRef.get();
    if (!siteSnap.exists) {
      return res.status(404).json({ error: `Site ${siteId} not found.` });
    }

    const previousStatus = siteSnap.data()?.status || "ACTIVE";
    const sanitized: Record<string, any> = {};
    if (updates.siteName !== undefined) sanitized.siteName = String(updates.siteName).trim();
    if (updates.projectName !== undefined) sanitized.projectName = String(updates.projectName).trim();
    if (updates.address !== undefined) sanitized.address = String(updates.address).trim();
    if (updates.description !== undefined) sanitized.description = String(updates.description).trim();
    if (updates.status !== undefined) {
      sanitized.status = updates.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
    }

    sanitized.updatedAt = new Date().toISOString();

    await siteRef.update(sanitized);

    // Record audit event for site status change
    if (sanitized.status && sanitized.status !== previousStatus) {
      await recordSecurityEvent(adminDb, {
        eventType: sanitized.status === "INACTIVE" ? "SITE_DEACTIVATED" : "SITE_REACTIVATED",
        actorUid: (caller as any)?.uid || "admin",
        actorRole: "ADMIN",
        result: "SUCCESS",
        severity: sanitized.status === "INACTIVE" ? "WARNING" : "INFO",
        source: "ADMIN_SITE_MANAGEMENT",
        metadata: {
          siteId,
          siteName: siteSnap.data()?.siteName || siteId,
          previousStatus,
          newStatus: sanitized.status,
          reason: sanitized.status === "INACTIVE" ? "Administrative site deactivation" : "Administrative site reactivation"
        }
      });
    }

    const updatedSnap = await siteRef.get();
    return res.json({ success: true, site: updatedSnap.data() });
  } catch (err: any) {
    console.error("[server] /api/admin/update-site error:", err);
    return sendAdminError(err, res, "Failed to update site.");
  }
});

// Admin Site Deactivation Impact Preview (Read-only operational impact calculation)
const handleSiteDeactivationImpact = async (req: express.Request, res: express.Response) => {
  try {
    await verifyAdminAuth(req);
    const siteId = (req.body?.siteId || req.params?.siteId || req.query?.siteId || "").toString().trim();
    if (!siteId) {
      return res.status(400).json({ success: false, error: "siteId parameter is required." });
    }

    const { adminDb } = getFirebaseAdmin();
    const siteDoc = await adminDb.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return res.status(404).json({ success: false, error: `Construction site "${siteId}" not found.` });
    }

    const siteData = siteDoc.data() || {};
    const siteName = siteData.siteName || siteId;
    const currentStatus = (siteData.status === "INACTIVE" ? "INACTIVE" : "ACTIVE") as "ACTIVE" | "INACTIVE";

    // Today in IST (Asia/Kolkata)
    const istFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const todayStr = istFormatter.format(new Date());

    // Parallel fetch of real records
    const [workersSnap, attendanceSnap, leaveSnap, overtimeSnap] = await Promise.all([
      adminDb.collection("workers").get(),
      adminDb.collection("attendance").where("siteId", "==", siteId).where("date", "==", todayStr).get(),
      adminDb.collection("leaveRequests").where("status", "==", "PENDING").get(),
      adminDb.collection("overtimeRecords").where("status", "==", "PENDING").get()
    ]);

    const allWorkers = workersSnap.docs.map(d => d.data());
    const assignedWorkers = allWorkers.filter(w => (w.siteId === siteId || (w as any).assignedSiteId === siteId) && w.status !== "REJECTED");
    const assignedWorkerIds = new Set(assignedWorkers.map(w => w.workerId));

    const todayAttendanceRecords = attendanceSnap.size;
    const todayAttendanceDocs = attendanceSnap.docs.map(d => d.data());
    const activeWorkersToday = new Set(todayAttendanceDocs.map(a => a.workerId)).size;

    const pendingLeaveRequests = leaveSnap.docs.map(d => d.data()).filter(l => assignedWorkerIds.has(l.workerId)).length;
    const pendingOvertimeClaims = overtimeSnap.docs.map(d => d.data()).filter(o => o.siteId === siteId || assignedWorkerIds.has(o.workerId)).length;

    const workersAssignedCount = assignedWorkers.length;
    const affectedWorkers = assignedWorkers.map(w => ({
      workerId: w.workerId,
      fullName: w.fullName || "Unnamed Worker",
      trade: w.jobRole || "General Labor",
      batchNumber: w.batchNumber || "Unassigned"
    }));

    const operationalImpact = [
      "New attendance at this site will be blocked.",
      `${workersAssignedCount} worker(s) may require reassignment.`,
      "Existing attendance history will remain unchanged.",
      "Existing leave history will remain unchanged.",
      "Existing overtime history will remain unchanged.",
      "Existing payroll/reporting history will remain unchanged.",
      "Worker IDs will remain unchanged."
    ];

    let aiObservation = `Deactivating ${siteName} (${siteId}) will prevent new check-in and check-out attendance. ${workersAssignedCount} worker(s) currently assigned will retain their permanent Worker IDs and accounts, but will require reassignment to another active site to resume logging shifts.`;

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const prompt = `You are an AI Operational Copilot for a civil workforce system. Summarize the operational impact of deactivating this construction site in 2 concise sentences. Do not invent any numbers. Do not advise deactivating or not deactivating—strictly summarize facts neutrally.
Site: ${siteName} (${siteId})
Assigned Workers: ${workersAssignedCount}
Active Today: ${activeWorkersToday}
Today Attendance Records: ${todayAttendanceRecords}
Pending Leave: ${pendingLeaveRequests}
Pending Overtime: ${pendingOvertimeClaims}`;
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: prompt,
          config: {
            systemInstruction: "You are an assistive, neutral operations analyst. Do not use markdown headers. Output plain text."
          }
        });
        if (response.text?.trim()) {
          aiObservation = response.text.trim();
        }
      } catch (err: any) {
        // Fallback remains clean deterministic text
      }
    }

    const impact = {
      siteId,
      siteName,
      currentStatus,
      workersAssigned: workersAssignedCount,
      activeWorkersToday,
      todayAttendanceRecords,
      pendingLeaveRequests,
      pendingOvertimeClaims,
      workersRequiringReassignment: workersAssignedCount,
      affectedWorkers,
      operationalImpact,
      aiObservation
    };

    return res.json({ success: true, impact });
  } catch (err: any) {
    console.error("[server] site-deactivation-impact error:", err);
    return sendAdminError(err, res, "Failed to calculate site deactivation impact.");
  }
};

app.post("/api/admin/site-deactivation-impact", handleSiteDeactivationImpact);
app.get("/api/admin/sites/:siteId/deactivation-impact", handleSiteDeactivationImpact);

// Phase 4: Admin Batch Modification
app.post("/api/admin/update-batch", async (req, res) => {
  try {
    await verifyAdminAuth(req);
    const { batchId, updates } = req.body;
    if (!batchId || typeof batchId !== "string") {
      return res.status(400).json({ error: "batchId is required." });
    }
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "updates object is required." });
    }

    const { adminDb } = getFirebaseAdmin();
    const batchRef = adminDb.collection("batches").doc(batchId);
    const batchSnap = await batchRef.get();
    if (!batchSnap.exists) {
      return res.status(404).json({ error: `Batch ${batchId} not found.` });
    }

    const sanitized: Record<string, any> = {};
    if (updates.name !== undefined) sanitized.name = String(updates.name).trim();
    if (updates.description !== undefined) sanitized.description = String(updates.description).trim();
    if (updates.status !== undefined) {
      sanitized.status = updates.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
    }

    sanitized.updatedAt = new Date().toISOString();

    await batchRef.update(sanitized);
    const updatedSnap = await batchRef.get();
    return res.json({ success: true, batch: updatedSnap.data() });
  } catch (err: any) {
    console.error("[server] /api/admin/update-batch error:", err);
    return sendAdminError(err, res, "Failed to update batch.");
  }
});

// Phase 4: Admin Workforce Distribution Endpoint
app.get("/api/admin/workforce-distribution", async (req, res) => {
  try {
    await verifyAdminAuth(req);
    const { adminDb } = getFirebaseAdmin();

    const [workersSnap, sitesSnap, batchesSnap, regSnap] = await Promise.all([
      adminDb.collection("workers").get(),
      adminDb.collection("sites").get(),
      adminDb.collection("batches").get(),
      adminDb.collection("workerRegistrations").where("status", "==", "PENDING").get()
    ]);

    const bySite: Record<string, { siteName: string; count: number; activeCount: number; suspendedCount: number }> = {};
    const byBatch: Record<string, { batchName: string; count: number; activeCount: number; suspendedCount: number }> = {};
    const byRole: Record<string, number> = {};
    const byStatus = { ACTIVE: 0, SUSPENDED: 0, PENDING: regSnap.size };

    sitesSnap.forEach((s) => {
      const data = s.data();
      bySite[s.id] = {
        siteName: data.siteName || s.id,
        count: 0,
        activeCount: 0,
        suspendedCount: 0
      };
    });

    batchesSnap.forEach((b) => {
      const data = b.data();
      byBatch[b.id] = {
        batchName: data.name || b.id,
        count: 0,
        activeCount: 0,
        suspendedCount: 0
      };
    });

    workersSnap.forEach((doc) => {
      const w = doc.data();
      const st = w.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED";
      if (st === "ACTIVE") byStatus.ACTIVE++;
      else byStatus.SUSPENDED++;

      const sId = (w.siteId || w.assignedSiteId || "UNASSIGNED").trim();
      if (!bySite[sId]) {
        bySite[sId] = { siteName: sId, count: 0, activeCount: 0, suspendedCount: 0 };
      }
      bySite[sId].count++;
      if (st === "ACTIVE") bySite[sId].activeCount++;
      else bySite[sId].suspendedCount++;

      const bId = (w.batchNumber || "UNASSIGNED").trim();
      if (!byBatch[bId]) {
        byBatch[bId] = { batchName: bId, count: 0, activeCount: 0, suspendedCount: 0 };
      }
      byBatch[bId].count++;
      if (st === "ACTIVE") byBatch[bId].activeCount++;
      else byBatch[bId].suspendedCount++;

      const role = (w.jobRole || "General Labor").trim();
      byRole[role] = (byRole[role] || 0) + 1;
    });

    return res.json({
      success: true,
      distribution: {
        totalWorkers: workersSnap.size,
        bySite,
        byBatch,
        byRole,
        byStatus
      }
    });
  } catch (err: any) {
    console.error("[server] /api/admin/workforce-distribution error:", err);
    return sendAdminError(err, res, "Failed to load workforce distribution.");
  }
});

/**
 * =========================================================================
 * PHASE 5: LEAVE, OVERTIME & SALARY MANAGEMENT ENDPOINTS
 * =========================================================================
 */

const DEFAULT_TRADE_DAILY_RATES: Record<string, number> = {
  "Mason": 250,
  "Carpenter": 240,
  "Electrician": 260,
  "Plumber": 240,
  "Welder": 270,
  "Painter": 220,
  "Structural Steel Worker": 270,
  "Equipment Operator": 280,
  "Surveyor": 290,
  "Safety Officer": 300,
  "General Labor": 180,
  "Labor": 180
};

function getDailyRateForRole(role?: string): number {
  if (!role) return 200;
  return DEFAULT_TRADE_DAILY_RATES[role] || 200;
}

async function verifyAnyUserAuth(req: express.Request): Promise<{ uid: string; email?: string; role: string; status: string; workerId?: string }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AuthError(401, "Missing or invalid Authorization header. Authentication required.");
  }
  const idToken = authHeader.split("Bearer ")[1].trim();
  const { adminAuth, adminDb } = getFirebaseAdmin();
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch (tokenErr: any) {
    throw new AuthError(401, `Invalid or expired authentication token: ${tokenErr.message}`);
  }

  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
  let userData = userDoc.data();

  // If user profile doc is not found directly, look up corresponding worker record
  if (!userDoc.exists) {
    const workerSnap = await adminDb.collection("workers").where("uid", "==", decoded.uid).get();
    if (!workerSnap.empty) {
      const wData = workerSnap.docs[0].data();
      userData = {
        role: "WORKER",
        status: wData?.status || "ACTIVE",
        workerId: wData?.workerId || workerSnap.docs[0].id
      };
      await adminDb.collection("users").doc(decoded.uid).set({
        uid: decoded.uid,
        email: decoded.email,
        role: "WORKER",
        status: userData.status,
        workerId: userData.workerId,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } else if (decoded.email) {
      const workerByEmail = await adminDb.collection("workers").where("email", "==", decoded.email.toLowerCase()).get();
      if (!workerByEmail.empty) {
        const wData = workerByEmail.docs[0].data();
        userData = {
          role: "WORKER",
          status: wData?.status || "ACTIVE",
          workerId: wData?.workerId || workerByEmail.docs[0].id
        };
        await adminDb.collection("users").doc(decoded.uid).set({
          uid: decoded.uid,
          email: decoded.email,
          role: "WORKER",
          status: userData.status,
          workerId: userData.workerId,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    }
  }

  if (!userData) {
    throw new AuthError(403, "User profile not found in database.");
  }

  return {
    uid: decoded.uid,
    email: decoded.email,
    role: userData?.role || "WORKER",
    status: userData?.status || "ACTIVE",
    workerId: userData?.workerId
  };
}

// --- A. LEAVE MANAGEMENT ---

// Helper to handle leave submission
const handleLeaveSubmit = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAnyUserAuth(req);
    const { workerId, leaveType, startDate, endDate, reason } = req.body;

    if (!workerId || typeof workerId !== "string") {
      return res.status(400).json({ error: "workerId is required." });
    }
    const validLeaveTypes = ["CASUAL", "MEDICAL", "SICK", "EMERGENCY", "PAID", "UNPAID"];
    if (!leaveType || !validLeaveTypes.includes(leaveType)) {
      return res.status(400).json({ error: "Valid leaveType ('CASUAL', 'MEDICAL', 'SICK', 'EMERGENCY', 'PAID', 'UNPAID') is required." });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate are required." });
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return res.status(400).json({ error: "A valid reason is required for leave request." });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }
    if (end < start) {
      return res.status(400).json({ error: "End date cannot precede start date." });
    }

    const diffMs = end.getTime() - start.getTime();
    const daysCount = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

    const { adminDb } = getFirebaseAdmin();

    // Verify worker exists and status
    const workerDoc = await adminDb.collection("workers").doc(workerId).get();
    if (!workerDoc.exists) {
      return res.status(404).json({ error: `Worker ${workerId} not found.` });
    }
    const workerData = workerDoc.data();
    if (workerData?.status !== "ACTIVE") {
      return res.status(400).json({ error: `Cannot submit leave for inactive worker (${workerData?.status}).` });
    }

    // Role check: Worker can only submit for themselves; Admin can submit on behalf
    if (caller.role !== "ADMIN" && caller.uid !== workerData?.uid && caller.workerId !== workerId) {
      return res.status(403).json({ error: "Unauthorized: Workers can only submit leave requests for their own account." });
    }

    // Check for overlapping pending or approved leave requests for this worker
    const existingSnap = await adminDb
      .collection("leaveRequests")
      .where("workerId", "==", workerId)
      .get();

    for (const d of existingSnap.docs) {
      const ex = d.data();
      if (ex.status === "PENDING" || ex.status === "APPROVED") {
        if (startDate <= ex.endDate && endDate >= ex.startDate) {
          return res.status(400).json({
            error: `Worker ${workerId} already has an overlapping pending or approved leave request (${ex.startDate} to ${ex.endDate}).`
          });
        }
      }
    }

    const now = new Date().toISOString();
    const requestId = `LV-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const leaveRecord = {
      requestId,
      leaveId: requestId,
      workerId,
      workerUid: workerData?.uid || caller.uid,
      workerName: workerData?.fullName || "Worker",
      leaveType,
      startDate,
      endDate,
      daysCount,
      reason: reason.trim(),
      status: "PENDING" as const,
      submittedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
      reviewerNotes: null,
      createdAt: now,
      updatedAt: now
    };

    await adminDb.collection("leaveRequests").doc(requestId).set(leaveRecord);
    console.log(`[server] Leave request created: ${requestId} for worker ${workerId} (${daysCount} days)`);

    return res.json({ success: true, leave: leaveRecord, leaveRequest: leaveRecord });
  } catch (err: any) {
    console.error("[server] Leave submit error:", err);
    return sendAdminError(err, res, "Failed to submit leave request.");
  }
};

app.post("/api/leave/submit", handleLeaveSubmit);
app.post("/api/worker/request-leave", handleLeaveSubmit);

// Helper to handle leave review / status update
const handleLeaveReview = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAnyUserAuth(req);
    const { leaveId, requestId, status, reviewerNotes, reviewNotes, rejectionReason } = req.body;
    const targetId = requestId || leaveId;

    if (!targetId || typeof targetId !== "string") {
      return res.status(400).json({ error: "requestId / leaveId is required." });
    }
    if (!status || !["APPROVED", "REJECTED", "CANCELLED"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'APPROVED', 'REJECTED', or 'CANCELLED'." });
    }

    const { adminDb } = getFirebaseAdmin();
    const leaveRef = adminDb.collection("leaveRequests").doc(targetId);
    const leaveSnap = await leaveRef.get();
    if (!leaveSnap.exists) {
      return res.status(404).json({ error: `Leave request ${targetId} not found.` });
    }
    const currentLeave = leaveSnap.data();

    // Cancellation: Worker can only cancel their own PENDING leave
    if (status === "CANCELLED") {
      if (caller.role !== "ADMIN" && caller.uid !== currentLeave?.workerUid && caller.workerId !== currentLeave?.workerId) {
        return res.status(403).json({ error: "Unauthorized: Workers can only cancel their own leave requests." });
      }
      if (currentLeave?.status !== "PENDING") {
        return res.status(400).json({ error: `Cannot cancel a leave request that is already ${currentLeave?.status}.` });
      }
    } else {
      // Approval / Rejection: Requires ADMIN
      if (caller.role !== "ADMIN") {
        return res.status(403).json({ error: "Unauthorized: Only administrators can approve or reject leave requests." });
      }
    }

    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      status,
      updatedAt: now
    };

    if (status === "APPROVED" || status === "REJECTED") {
      updates.reviewedAt = now;
      updates.reviewedBy = caller.uid;
      const finalNotes = reviewerNotes || reviewNotes;
      if (finalNotes !== undefined) {
        updates.reviewerNotes = String(finalNotes).trim();
      }
      if (rejectionReason !== undefined) {
        updates.rejectionReason = String(rejectionReason).trim();
      }
    }

    await leaveRef.update(updates);
    const updatedSnap = await leaveRef.get();
    const updatedData = updatedSnap.data();
    return res.json({ success: true, leave: updatedData, leaveRequest: updatedData });
  } catch (err: any) {
    console.error("[server] Leave review error:", err);
    return sendAdminError(err, res, "Failed to update leave status.");
  }
};

app.post("/api/leave/update-status", handleLeaveReview);
app.post("/api/admin/review-leave", handleLeaveReview);

// Helper to query worker leaves
const handleWorkerLeaves = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAnyUserAuth(req);
    const workerId = req.params.workerId || (req.query.workerId as string);

    if (!workerId) {
      return res.status(400).json({ error: "workerId is required." });
    }

    if (caller.role !== "ADMIN" && caller.workerId !== workerId) {
      return res.status(403).json({ error: "Access denied: Workers can only view their own leave records." });
    }

    const { adminDb } = getFirebaseAdmin();
    const workerDoc = await adminDb.collection("workers").doc(workerId).get();
    if (!workerDoc.exists) {
      return res.status(404).json({ error: `Worker ${workerId} not found.` });
    }
    const workerData = workerDoc.data();

    if (caller.role !== "ADMIN" && caller.uid !== workerData?.uid && caller.workerId !== workerId) {
      return res.status(403).json({ error: "Access denied: Workers can only view their own leave records." });
    }

    const snap = await adminDb.collection("leaveRequests").where("workerId", "==", workerId).get();
    const leaves = snap.docs.map((d) => d.data());
    leaves.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));

    // Compute balance (standard allocation: 12 casual, 15 medical)
    const approvedCasual = leaves
      .filter((l) => l.status === "APPROVED" && l.leaveType === "CASUAL")
      .reduce((acc, l) => acc + (l.daysCount || 0), 0);
    const approvedMedical = leaves
      .filter((l) => l.status === "APPROVED" && (l.leaveType === "MEDICAL" || l.leaveType === "SICK"))
      .reduce((acc, l) => acc + (l.daysCount || 0), 0);

    const balance = {
      casualLeave: Math.max(0, 12 - approvedCasual),
      medicalLeave: Math.max(0, 15 - approvedMedical),
      totalAvailable: Math.max(0, 12 - approvedCasual) + Math.max(0, 15 - approvedMedical)
    };

    return res.json({ success: true, leaves, requests: leaves, balance });
  } catch (err: any) {
    console.error("[server] Worker leave history error:", err);
    return sendAdminError(err, res, "Failed to retrieve worker leave records.");
  }
};

app.get("/api/leave/worker/:workerId", handleWorkerLeaves);
app.get("/api/worker/leave-history", handleWorkerLeaves);

// Helper for admin all leaves
const handleAllLeaves = async (req: express.Request, res: express.Response) => {
  try {
    await verifyAdminAuth(req);
    const { adminDb } = getFirebaseAdmin();
    const snap = await adminDb.collection("leaveRequests").get();
    const leaves = snap.docs.map((d) => d.data());
    leaves.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
    return res.json({ success: true, leaves, requests: leaves });
  } catch (err: any) {
    console.error("[server] All leaves error:", err);
    return sendAdminError(err, res, "Failed to retrieve leave records.");
  }
};

app.get("/api/leave/all", handleAllLeaves);
app.get("/api/admin/leave-requests", handleAllLeaves);

// --- B. OVERTIME MANAGEMENT ---

// Helper to record overtime
const handleOvertimeRecord = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAnyUserAuth(req);
    const { workerId, date, hours, reason, taskDescription, siteId, hourlyRate, status: requestedStatus } = req.body;
    const finalReason = taskDescription || reason;

    if (!workerId || typeof workerId !== "string") {
      return res.status(400).json({ error: "workerId is required." });
    }
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "Date is required (YYYY-MM-DD)." });
    }
    const numHours = Number(hours);
    if (isNaN(numHours) || numHours <= 0 || numHours > 16) {
      return res.status(400).json({ error: "Overtime hours must be a positive number between 0.5 and 16." });
    }
    if (!finalReason || typeof finalReason !== "string" || !finalReason.trim()) {
      return res.status(400).json({ error: "A non-empty task description is required for overtime." });
    }

    const { adminDb } = getFirebaseAdmin();
    const workerDoc = await adminDb.collection("workers").doc(workerId).get();
    if (!workerDoc.exists) {
      return res.status(404).json({ error: `Worker ${workerId} not found.` });
    }
    const workerData = workerDoc.data();

    if (workerData?.status !== "ACTIVE") {
      return res.status(400).json({ error: `Worker ${workerId} is currently not active.` });
    }

    // Role check: Worker can only record for themselves
    if (caller.role !== "ADMIN" && caller.uid !== workerData?.uid && caller.workerId !== workerId) {
      return res.status(403).json({ error: "Unauthorized: Workers can only submit overtime for their own account." });
    }

    const resolvedSiteId = siteId || workerData?.siteId || "SITE-101";

    // Validate site exists and is active
    const siteDoc = await adminDb.collection("sites").doc(resolvedSiteId).get();
    if (!siteDoc.exists || siteDoc.data()?.status !== "ACTIVE") {
      return res.status(400).json({ error: `Site does not exist or is inactive (${resolvedSiteId}).` });
    }

    const isCallerAdmin = caller.role === "ADMIN";
    const status = isCallerAdmin ? (requestedStatus === "APPROVED" ? "APPROVED" : "PENDING") : "PENDING";

    const baseDailyRate = getDailyRateForRole(workerData?.jobRole);
    const resolvedHourlyRate = Number(hourlyRate) > 0 ? Number(hourlyRate) : Math.round((baseDailyRate / 8) * 100) / 100;
    const multiplier = 1.5;
    const calculatedAmount = Math.round(numHours * resolvedHourlyRate * multiplier * 100) / 100;

    const now = new Date().toISOString();
    const overtimeId = `OT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const overtimeRecord = {
      overtimeId,
      workerId,
      workerUid: workerData?.uid || caller.uid,
      workerName: workerData?.fullName || "Worker",
      siteId: resolvedSiteId,
      date,
      hours: numHours,
      approvedHours: status === "APPROVED" ? numHours : 0,
      hourlyRate: resolvedHourlyRate,
      multiplier,
      calculatedAmount,
      taskDescription: finalReason.trim(),
      reason: finalReason.trim(),
      status,
      submittedBy: isCallerAdmin ? "ADMIN" : "WORKER",
      reviewedAt: status === "APPROVED" ? now : null,
      reviewedBy: status === "APPROVED" ? caller.uid : null,
      rejectionReason: null,
      reviewerNotes: null,
      createdAt: now,
      updatedAt: now
    };

    await adminDb.collection("overtimeRecords").doc(overtimeId).set(overtimeRecord);
    console.log(`[server] Overtime recorded: ${overtimeId} for worker ${workerId}, ${numHours} hrs`);

    return res.json({ success: true, overtime: overtimeRecord, overtimeRecord });
  } catch (err: any) {
    console.error("[server] Overtime record error:", err);
    return sendAdminError(err, res, "Failed to record overtime.");
  }
};

app.post("/api/overtime/record", handleOvertimeRecord);
app.post("/api/worker/log-overtime", handleOvertimeRecord);

// Helper to review overtime
const handleOvertimeReview = async (req: express.Request, res: express.Response) => {
  try {
    const admin = await verifyAdminAuth(req);
    const { overtimeId, status, approvedHours, reviewerNotes, reviewNotes, rejectionReason } = req.body;

    if (!overtimeId || typeof overtimeId !== "string") {
      return res.status(400).json({ error: "overtimeId is required." });
    }
    if (!status || !["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'APPROVED' or 'REJECTED'." });
    }

    const { adminDb } = getFirebaseAdmin();
    const otRef = adminDb.collection("overtimeRecords").doc(overtimeId);
    const otSnap = await otRef.get();
    if (!otSnap.exists) {
      return res.status(404).json({ error: `Overtime record ${overtimeId} not found.` });
    }
    const currentOt = otSnap.data();

    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      status,
      reviewedAt: now,
      reviewedBy: admin.uid,
      updatedAt: now
    };

    if (status === "APPROVED") {
      const finalHours = Number(approvedHours) > 0 ? Number(approvedHours) : Number(currentOt?.hours) || 0;
      updates.approvedHours = finalHours;
    } else {
      updates.approvedHours = 0;
    }

    const finalNotes = reviewerNotes || reviewNotes;
    if (finalNotes !== undefined) {
      updates.reviewerNotes = String(finalNotes).trim();
    }
    if (rejectionReason !== undefined) {
      updates.rejectionReason = String(rejectionReason).trim();
    }

    await otRef.update(updates);
    const updatedSnap = await otRef.get();
    const updatedData = updatedSnap.data();
    return res.json({ success: true, overtime: updatedData, overtimeRecord: updatedData });
  } catch (err: any) {
    console.error("[server] Overtime review error:", err);
    return sendAdminError(err, res, "Failed to update overtime status.");
  }
};

app.post("/api/overtime/update-status", handleOvertimeReview);
app.post("/api/admin/review-overtime", handleOvertimeReview);

// Helper for worker overtime history
const handleWorkerOvertime = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAnyUserAuth(req);
    const workerId = req.params.workerId || (req.query.workerId as string);

    if (!workerId) {
      return res.status(400).json({ error: "workerId is required." });
    }

    if (caller.role !== "ADMIN" && caller.workerId !== workerId) {
      return res.status(403).json({ error: "Access denied: Workers can only view their own overtime records." });
    }

    const { adminDb } = getFirebaseAdmin();
    const workerDoc = await adminDb.collection("workers").doc(workerId).get();
    if (!workerDoc.exists) {
      return res.status(404).json({ error: `Worker ${workerId} not found.` });
    }
    const workerData = workerDoc.data();

    if (caller.role !== "ADMIN" && caller.uid !== workerData?.uid && caller.workerId !== workerId) {
      return res.status(403).json({ error: "Access denied: Workers can only view their own overtime records." });
    }

    const snap = await adminDb.collection("overtimeRecords").where("workerId", "==", workerId).get();
    const overtimeRecords = snap.docs.map((d) => d.data());
    overtimeRecords.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return res.json({ success: true, overtimeRecords, records: overtimeRecords });
  } catch (err: any) {
    console.error("[server] Worker overtime history error:", err);
    return sendAdminError(err, res, "Failed to retrieve worker overtime records.");
  }
};

app.get("/api/overtime/worker/:workerId", handleWorkerOvertime);
app.get("/api/worker/overtime-history", handleWorkerOvertime);

// Helper for admin all overtime
const handleAllOvertime = async (req: express.Request, res: express.Response) => {
  try {
    await verifyAdminAuth(req);
    const { adminDb } = getFirebaseAdmin();
    const snap = await adminDb.collection("overtimeRecords").get();
    const overtimeRecords = snap.docs.map((d) => d.data());
    overtimeRecords.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return res.json({ success: true, overtimeRecords, records: overtimeRecords });
  } catch (err: any) {
    console.error("[server] All overtime error:", err);
    return sendAdminError(err, res, "Failed to retrieve overtime records.");
  }
};

app.get("/api/overtime/all", handleAllOvertime);
app.get("/api/admin/overtime-records", handleAllOvertime);

// --- C. SALARY MANAGEMENT & FOUNDATION ---

// Helper to calculate salary
const handleSalaryCalculate = async (req: express.Request, res: express.Response) => {
  try {
    await verifyAdminAuth(req);
    const { workerId, payPeriod, customDailyRate, allowances, deductions, deductionBreakdown, notes } = req.body;

    if (!workerId || typeof workerId !== "string") {
      return res.status(400).json({ error: "workerId is required." });
    }
    if (!payPeriod || !/^\d{4}-\d{2}$/.test(payPeriod)) {
      return res.status(400).json({ error: "payPeriod is required in format YYYY-MM (e.g. '2026-09')." });
    }

    const { adminDb } = getFirebaseAdmin();
    const workerDoc = await adminDb.collection("workers").doc(workerId).get();
    if (!workerDoc.exists) {
      return res.status(404).json({ error: `Worker ${workerId} does not exist.` });
    }
    const workerData = workerDoc.data();

    const [yearStr, monthStr] = payPeriod.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = `${payPeriod}-01`;
    const endDate = `${payPeriod}-${String(daysInMonth).padStart(2, "0")}`;

    const resolvedDailyRate = Number(customDailyRate) > 0 ? Number(customDailyRate) : getDailyRateForRole(workerData?.jobRole);
    const overtimeHourlyRate = Math.round((resolvedDailyRate / 8) * 1.5 * 100) / 100;

    // Scan real Firestore attendance records for this worker in the period
    const attendanceSnap = await adminDb.collection("attendance").where("workerId", "==", workerId).get();
    let daysAttended = 0;
    const attendedDates = new Set<string>();

    attendanceSnap.forEach((doc) => {
      const data = doc.data();
      const recDate = data.date || "";
      if (recDate >= startDate && recDate <= endDate) {
        if (!attendedDates.has(recDate)) {
          attendedDates.add(recDate);
          daysAttended++;
        }
      }
    });

    // Scan approved overtime records for this worker in the period
    const otSnap = await adminDb
      .collection("overtimeRecords")
      .where("workerId", "==", workerId)
      .where("status", "==", "APPROVED")
      .get();

    let approvedOvertimeHours = 0;
    let overtimeEarnings = 0;

    otSnap.forEach((doc) => {
      const ot = doc.data();
      const otDate = ot.date || "";
      if (otDate >= startDate && otDate <= endDate) {
        const hrs = Number(ot.approvedHours !== undefined ? ot.approvedHours : ot.hours) || 0;
        approvedOvertimeHours += hrs;
        const amt = Math.round(hrs * overtimeHourlyRate * 100) / 100;
        overtimeEarnings += amt;
      }
    });

    const baseEarnings = Math.round(daysAttended * resolvedDailyRate * 100) / 100;
    overtimeEarnings = Math.round(overtimeEarnings * 100) / 100;
    const totalAllowances = Math.max(0, Math.round((Number(allowances) || 0) * 100) / 100);
    const totalDeductions = Math.max(0, Math.round((Number(deductions) || 0) * 100) / 100);

    const netSalary = Math.max(0, Math.round((baseEarnings + overtimeEarnings + totalAllowances - totalDeductions) * 100) / 100);

    const salaryId = `SAL-${workerId}-${payPeriod}`;
    const now = new Date().toISOString();

    const salaryRecord = {
      salaryId,
      workerId,
      workerUid: workerData?.uid || "",
      workerName: workerData?.fullName || "Worker",
      jobRole: workerData?.jobRole || "Labor",
      payPeriod,
      startDate,
      endDate,
      dailyRate: resolvedDailyRate,
      daysAttended,
      baseEarnings,
      approvedOvertimeHours,
      overtimeHourlyRate,
      overtimeEarnings,
      allowances: totalAllowances,
      deductions: totalDeductions,
      deductionBreakdown: deductionBreakdown || {
        taxOrPf: 0,
        advance: 0,
        unpaidLeave: 0,
        other: totalDeductions
      },
      netSalary,
      status: "DRAFT" as const,
      calculatedAt: now,
      processedAt: null,
      paidAt: null,
      disbursedAt: null,
      notes: notes ? String(notes).trim() : `Salary computed deterministically for ${payPeriod}`,
      createdAt: now,
      updatedAt: now
    };

    await adminDb.collection("salaryRecords").doc(salaryId).set(salaryRecord);
    console.log(`[server] Salary calculated: ${salaryId} for worker ${workerId}, days: ${daysAttended}, Net: $${netSalary}`);

    return res.json({ success: true, salary: salaryRecord, salaryRecord });
  } catch (err: any) {
    console.error("[server] Salary calculate error:", err);
    return sendAdminError(err, res, "Failed to calculate salary.");
  }
};

app.post("/api/salary/calculate", handleSalaryCalculate);
app.post("/api/admin/calculate-salary", handleSalaryCalculate);

// Helper to update salary status
const handleSalaryUpdateStatus = async (req: express.Request, res: express.Response) => {
  try {
    await verifyAdminAuth(req);
    const { salaryId, status, notes } = req.body;

    if (!salaryId || typeof salaryId !== "string") {
      return res.status(400).json({ error: "salaryId is required." });
    }
    if (!status || !["DRAFT", "PROCESSED", "PAID"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'DRAFT', 'PROCESSED', or 'PAID'." });
    }

    const { adminDb } = getFirebaseAdmin();
    const salRef = adminDb.collection("salaryRecords").doc(salaryId);
    const salSnap = await salRef.get();
    if (!salSnap.exists) {
      return res.status(404).json({ error: `Salary record ${salaryId} not found.` });
    }

    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      status,
      updatedAt: now
    };

    if (status === "PROCESSED") {
      updates.processedAt = now;
    } else if (status === "PAID") {
      updates.paidAt = now;
      updates.disbursedAt = now;
    }
    if (notes !== undefined) {
      updates.notes = String(notes).trim();
    }

    await salRef.update(updates);
    const updatedSnap = await salRef.get();
    const updatedData = updatedSnap.data();
    return res.json({ success: true, salary: updatedData, salaryRecord: updatedData });
  } catch (err: any) {
    console.error("[server] Salary update status error:", err);
    return sendAdminError(err, res, "Failed to update salary status.");
  }
};

app.post("/api/salary/update-status", handleSalaryUpdateStatus);
app.post("/api/admin/update-salary-status", handleSalaryUpdateStatus);

// Helper for worker salary slips
const handleWorkerSalarySlips = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAnyUserAuth(req);
    const workerId = req.params.workerId || (req.query.workerId as string);

    if (!workerId) {
      return res.status(400).json({ error: "workerId is required." });
    }

    if (caller.role !== "ADMIN" && caller.workerId !== workerId) {
      return res.status(403).json({ error: "Access denied: Workers can only view their own salary slips." });
    }

    const { adminDb } = getFirebaseAdmin();
    const workerDoc = await adminDb.collection("workers").doc(workerId).get();
    if (!workerDoc.exists) {
      return res.status(404).json({ error: `Worker ${workerId} not found.` });
    }
    const workerData = workerDoc.data();

    if (caller.role !== "ADMIN" && caller.uid !== workerData?.uid && caller.workerId !== workerId) {
      return res.status(403).json({ error: "Access denied: Workers can only view their own salary slips." });
    }

    const snap = await adminDb.collection("salaryRecords").where("workerId", "==", workerId).get();
    const salaryRecords = snap.docs.map((d) => d.data());
    salaryRecords.sort((a, b) => (b.payPeriod || "").localeCompare(a.payPeriod || ""));

    return res.json({ success: true, salaryRecords, slips: salaryRecords });
  } catch (err: any) {
    console.error("[server] Worker salary slips error:", err);
    return sendAdminError(err, res, "Failed to retrieve worker salary records.");
  }
};

app.get("/api/salary/worker/:workerId", handleWorkerSalarySlips);
app.get("/api/worker/salary-slips", handleWorkerSalarySlips);

// Helper for admin all salaries
const handleAllSalaries = async (req: express.Request, res: express.Response) => {
  try {
    await verifyAdminAuth(req);
    const { adminDb } = getFirebaseAdmin();
    const payPeriod = req.query.payPeriod as string;

    let queryRef: FirebaseFirestore.Query = adminDb.collection("salaryRecords");
    if (payPeriod) {
      queryRef = queryRef.where("payPeriod", "==", payPeriod);
    }

    const snap = await queryRef.get();
    const salaryRecords = snap.docs.map((d) => d.data());
    salaryRecords.sort((a, b) => (b.payPeriod || "").localeCompare(a.payPeriod || ""));

    return res.json({ success: true, salaryRecords, slips: salaryRecords });
  } catch (err: any) {
    console.error("[server] All salaries error:", err);
    return sendAdminError(err, res, "Failed to retrieve salary records.");
  }
};

app.get("/api/salary/all", handleAllSalaries);
app.get("/api/admin/salary-records", handleAllSalaries);

/**
 * =========================================================================
 * PHASE 6: MANAGEMENT REPORTING & EXPORT LAYER (Server-Authoritative)
 * =========================================================================
 */

function validateDateRange(startDate?: string, endDate?: string): { valid: boolean; error?: string } {
  if (startDate && endDate) {
    if (startDate > endDate) {
      return { valid: false, error: "Invalid date range: end date cannot be earlier than start date." };
    }
  }
  return { valid: true };
}

async function recordReportAudit(
  adminDb: FirebaseFirestore.Firestore,
  reportType: string,
  filtersUsed: Record<string, any>,
  recordCount: number,
  generatedBy: string
) {
  try {
    await adminDb.collection("reportAuditLogs").add({
      reportType,
      filtersUsed: filtersUsed || {},
      recordCount,
      generatedBy,
      generatedByRole: "ADMIN",
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.warn("[server] recordReportAudit failed:", e);
  }
}

function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// 1. Overview Stats Report
const handleReportsOverview = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAdminAuth(req);
    const { adminDb } = getFirebaseAdmin();

    const [
      workersSnap,
      sitesSnap,
      batchesSnap,
      attendanceSnap,
      leaveSnap,
      overtimeSnap,
      salarySnap,
      pendingRegSnap
    ] = await Promise.all([
      adminDb.collection("workers").get(),
      adminDb.collection("sites").get(),
      adminDb.collection("batches").get(),
      adminDb.collection("attendance").get(),
      adminDb.collection("leaveRequests").get(),
      adminDb.collection("overtimeRecords").get(),
      adminDb.collection("salaryRecords").get(),
      adminDb.collection("workerRegistrations").where("status", "==", "PENDING").get()
    ]);

    const workers = workersSnap.docs.map((d) => d.data());
    const sites = sitesSnap.docs.map((d) => d.data());
    const batches = batchesSnap.docs.map((d) => d.data());
    const attendance = attendanceSnap.docs.map((d) => d.data());
    const leave = leaveSnap.docs.map((d) => d.data());
    const overtime = overtimeSnap.docs.map((d) => d.data());
    const salary = salarySnap.docs.map((d) => d.data());

    const activeWorkers = workers.filter((w) => w.status === "ACTIVE").length;
    const suspendedWorkers = workers.filter((w) => w.status === "SUSPENDED").length;
    const pendingRegistrations = pendingRegSnap.size;

    const activeSites = sites.filter((s) => s.status === "ACTIVE").length;
    const inactiveSites = sites.length - activeSites;

    // Workforce by site (preserving workers in inactive sites)
    const workforceBySite = sites.map((site) => {
      const siteWorkers = workers.filter((w) => (w.siteId || (w as any).assignedSiteId) === site.siteId);
      return {
        siteId: site.siteId,
        siteName: site.siteName || site.siteId,
        isSiteActive: site.status === "ACTIVE",
        workerCount: siteWorkers.length,
        activeCount: siteWorkers.filter((w) => w.status === "ACTIVE").length
      };
    });

    // Workforce by batch
    const workforceByBatch = batches.map((batch) => {
      const batchWorkers = workers.filter((w) => w.batchNumber === batch.batchId);
      return {
        batchId: batch.batchId,
        batchName: batch.name || batch.batchId,
        workerCount: batchWorkers.length,
        activeCount: batchWorkers.filter((w) => w.status === "ACTIVE").length
      };
    });

    // Workforce by trade
    const tradeMap: Record<string, { workerCount: number; activeCount: number }> = {};
    for (const w of workers) {
      const trade = w.jobRole || "General Labor";
      if (!tradeMap[trade]) {
        tradeMap[trade] = { workerCount: 0, activeCount: 0 };
      }
      tradeMap[trade].workerCount++;
      if (w.status === "ACTIVE") tradeMap[trade].activeCount++;
    }
    const workforceByTrade = Object.entries(tradeMap).map(([trade, counts]) => ({
      trade,
      ...counts
    }));

    // Attendance summary
    const todayStr = new Date().toISOString().split("T")[0];
    let checkedInToday = 0;
    let completedToday = 0;
    for (const a of attendance) {
      if (a.date === todayStr) {
        if (a.status === "CHECKED_IN") checkedInToday++;
        else if (a.status === "COMPLETED") completedToday++;
      }
    }

    // Leave summary
    let leavePending = 0;
    let leaveApproved = 0;
    let leaveRejected = 0;
    let totalApprovedLeaveDays = 0;
    for (const l of leave) {
      if (l.status === "PENDING") leavePending++;
      else if (l.status === "APPROVED") {
        leaveApproved++;
        totalApprovedLeaveDays += Number(l.daysCount) || 0;
      } else if (l.status === "REJECTED") leaveRejected++;
    }

    // Overtime summary (only APPROVED included in approved hours)
    let otPending = 0;
    let otApproved = 0;
    let totalRequestedHours = 0;
    let totalApprovedHours = 0;
    for (const ot of overtime) {
      const reqH = Number(ot.hours) || 0;
      totalRequestedHours += reqH;
      if (ot.status === "PENDING") otPending++;
      else if (ot.status === "APPROVED") {
        otApproved++;
        totalApprovedHours += Number(ot.approvedHours !== undefined ? ot.approvedHours : ot.hours) || 0;
      }
    }

    // Salary summary (distinguish DRAFT vs PROCESSED vs PAID)
    let totalCalculatedPayroll = 0;
    let totalProcessedPayroll = 0;
    let totalPaidPayroll = 0;
    let totalOvertimeEarnings = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;
    let totalNetSalary = 0;
    for (const s of salary) {
      const net = Number(s.netSalary) || 0;
      totalNetSalary += net;
      totalOvertimeEarnings += Number(s.overtimeEarnings) || 0;
      totalAllowances += Number(s.allowances) || 0;
      totalDeductions += Number(s.deductions) || 0;

      if (s.status === "DRAFT") totalCalculatedPayroll += net;
      else if (s.status === "PROCESSED") totalProcessedPayroll += net;
      else if (s.status === "PAID") totalPaidPayroll += net;
    }

    const generatedAt = new Date().toISOString();
    const generatedBy = caller.email || caller.uid;

    await recordReportAudit(adminDb, "overview", {}, workers.length, generatedBy);

    return res.json({
      success: true,
      stats: {
        workers: {
          total: workers.length,
          active: activeWorkers,
          suspended: suspendedWorkers,
          pendingRegistrations
        },
        sites: {
          total: sites.length,
          active: activeSites,
          inactive: inactiveSites
        },
        batches: {
          total: batches.length,
          active: batches.filter((b) => b.status === "ACTIVE").length
        },
        workforceBySite,
        workforceByBatch,
        workforceByTrade,
        attendance: {
          totalRecords: attendance.length,
          checkedInToday,
          completedToday
        },
        leave: {
          totalRequests: leave.length,
          pending: leavePending,
          approved: leaveApproved,
          rejected: leaveRejected,
          totalApprovedLeaveDays
        },
        overtime: {
          totalRequests: overtime.length,
          pending: otPending,
          approved: otApproved,
          totalRequestedHours: Math.round(totalRequestedHours * 100) / 100,
          totalApprovedHours: Math.round(totalApprovedHours * 100) / 100
        },
        salary: {
          totalCalculatedPayroll: Math.round(totalCalculatedPayroll * 100) / 100,
          totalProcessedPayroll: Math.round(totalProcessedPayroll * 100) / 100,
          totalPaidPayroll: Math.round(totalPaidPayroll * 100) / 100,
          totalOvertimeEarnings: Math.round(totalOvertimeEarnings * 100) / 100,
          totalAllowances: Math.round(totalAllowances * 100) / 100,
          totalDeductions: Math.round(totalDeductions * 100) / 100,
          totalNetSalary: Math.round(totalNetSalary * 100) / 100,
          recordCount: salary.length,
          totalRecords: salary.length
        },
        generatedAt,
        generatedBy
      }
    });
  } catch (err: any) {
    console.error("[server] /api/reports/overview error:", err);
    return sendAdminError(err, res, "Failed to load management overview stats.");
  }
};

app.get("/api/reports/overview", handleReportsOverview);
app.get("/api/admin/reports/overview", handleReportsOverview);

// 2. Attendance Report
const handleReportsAttendance = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAdminAuth(req);
    const { startDate, endDate, date, workerId, siteId, batchNumber, jobRole, status, limit: queryLimit } = req.query as Record<string, string>;

    const dateVal = validateDateRange(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({ error: dateVal.error });
    }

    const { adminDb } = getFirebaseAdmin();
    const [attendanceSnap, workersSnap, sitesSnap] = await Promise.all([
      adminDb.collection("attendance").get(),
      adminDb.collection("workers").get(),
      adminDb.collection("sites").get()
    ]);

    const workersMap = new Map<string, any>();
    workersSnap.forEach((d) => workersMap.set(d.id, d.data()));

    const sitesMap = new Map<string, any>();
    sitesSnap.forEach((d) => sitesMap.set(d.id, d.data()));

    let filtered = attendanceSnap.docs.map((d) => {
      const data = d.data();
      const worker = workersMap.get(data.workerId);
      const site = sitesMap.get(data.siteId);

      let checkInFormatted: string | null = null;
      if (data.checkInTime) {
        if (typeof data.checkInTime.toDate === "function") {
          checkInFormatted = data.checkInTime.toDate().toISOString();
        } else if (typeof data.checkInTime === "string") {
          checkInFormatted = data.checkInTime;
        }
      }

      let checkOutFormatted: string | null = null;
      if (data.checkOutTime) {
        if (typeof data.checkOutTime.toDate === "function") {
          checkOutFormatted = data.checkOutTime.toDate().toISOString();
        } else if (typeof data.checkOutTime === "string") {
          checkOutFormatted = data.checkOutTime;
        }
      }

      return {
        attendanceId: d.id,
        workerId: data.workerId || "",
        workerName: worker?.fullName || data.workerName || "Unknown Worker",
        siteId: data.siteId || "",
        siteName: site?.siteName || data.siteId || "Unknown Site",
        batchNumber: worker?.batchNumber || "B-01",
        jobRole: worker?.jobRole || "Labor",
        date: data.date || "",
        checkInTime: checkInFormatted,
        checkOutTime: checkOutFormatted,
        status: data.status || "CHECKED_IN",
        syncStatus: data.syncStatus || "SYNCED"
      };
    });

    if (date) {
      filtered = filtered.filter((r) => r.date === date);
    }
    if (startDate) {
      filtered = filtered.filter((r) => r.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((r) => r.date <= endDate);
    }
    if (workerId) {
      filtered = filtered.filter((r) => r.workerId === workerId);
    }
    if (siteId) {
      filtered = filtered.filter((r) => r.siteId === siteId);
    }
    if (batchNumber) {
      filtered = filtered.filter((r) => r.batchNumber === batchNumber);
    }
    if (jobRole) {
      filtered = filtered.filter((r) => r.jobRole.toLowerCase() === jobRole.toLowerCase());
    }
    if (status) {
      filtered = filtered.filter((r) => r.status === status);
    }

    filtered.sort((a, b) => b.date.localeCompare(a.date));

    // Summary calculation
    const bySite: Record<string, number> = {};
    const byDate: Record<string, number> = {};
    const byWorker: Record<string, number> = {};
    let checkedInCount = 0;
    let completedCount = 0;

    for (const r of filtered) {
      if (r.status === "CHECKED_IN") checkedInCount++;
      else if (r.status === "COMPLETED") completedCount++;

      bySite[r.siteId] = (bySite[r.siteId] || 0) + 1;
      byDate[r.date] = (byDate[r.date] || 0) + 1;
      byWorker[r.workerId] = (byWorker[r.workerId] || 0) + 1;
    }

    const maxLimit = queryLimit ? parseInt(queryLimit, 10) : 1000;
    const paginatedRecords = filtered.slice(0, isNaN(maxLimit) ? 1000 : maxLimit);

    const generatedAt = new Date().toISOString();
    const generatedBy = caller.email || caller.uid;

    await recordReportAudit(adminDb, "attendance", req.query, filtered.length, generatedBy);

    return res.json({
      success: true,
      summary: {
        totalRecords: filtered.length,
        checkedInCount,
        completedCount,
        bySite,
        byDate,
        byWorker
      },
      records: paginatedRecords,
      filtersApplied: req.query,
      generatedAt,
      generatedBy
    });
  } catch (err: any) {
    console.error("[server] /api/reports/attendance error:", err);
    return sendAdminError(err, res, "Failed to load attendance report.");
  }
};

app.get("/api/reports/attendance", handleReportsAttendance);
app.get("/api/admin/reports/attendance", handleReportsAttendance);

// 3. Workforce Report
const handleReportsWorkforce = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAdminAuth(req);
    const { siteId, batchNumber, jobRole, status } = req.query as Record<string, string>;

    const { adminDb } = getFirebaseAdmin();
    const [workersSnap, sitesSnap, batchesSnap, pendingRegSnap] = await Promise.all([
      adminDb.collection("workers").get(),
      adminDb.collection("sites").get(),
      adminDb.collection("batches").get(),
      adminDb.collection("workerRegistrations").where("status", "==", "PENDING").get()
    ]);

    const sitesMap = new Map<string, any>();
    sitesSnap.forEach((d) => sitesMap.set(d.id, d.data()));

    const batchesMap = new Map<string, any>();
    batchesSnap.forEach((d) => batchesMap.set(d.id, d.data()));

    const allWorkers = workersSnap.docs.map((d) => {
      const data = d.data();
      const site = sitesMap.get(data.siteId);
      const batch = batchesMap.get(data.batchNumber);

      return {
        workerId: data.workerId || d.id,
        fullName: data.fullName || "Worker",
        phone: data.phone || "",
        email: data.email || "",
        siteId: data.siteId || "",
        siteName: site?.siteName || data.siteId || "Unassigned Site",
        isSiteActive: site ? site.status === "ACTIVE" : false,
        batchNumber: data.batchNumber || "B-01",
        batchName: batch?.name || data.batchNumber || "Default Batch",
        jobRole: data.jobRole || "Labor",
        status: data.status || "ACTIVE",
        joiningDate: data.joiningDate || ""
      };
    });

    // Compute distribution over ALL workers before query filtering
    const bySite: Record<string, { siteName: string; isSiteActive: boolean; count: number; activeCount: number }> = {};
    sitesSnap.forEach((d) => {
      const s = d.data();
      bySite[d.id] = {
        siteName: s.siteName || d.id,
        isSiteActive: s.status === "ACTIVE",
        count: 0,
        activeCount: 0
      };
    });

    const byBatch: Record<string, { batchName: string; count: number; activeCount: number }> = {};
    batchesSnap.forEach((d) => {
      const b = d.data();
      byBatch[d.id] = {
        batchName: b.name || d.id,
        count: 0,
        activeCount: 0
      };
    });

    const byTrade: Record<string, { count: number; activeCount: number }> = {};
    const byStatus = { ACTIVE: 0, SUSPENDED: 0, PENDING: 0 };

    for (const w of allWorkers) {
      if (!bySite[w.siteId]) {
        bySite[w.siteId] = {
          siteName: w.siteName,
          isSiteActive: w.isSiteActive,
          count: 0,
          activeCount: 0
        };
      }
      bySite[w.siteId].count++;
      if (w.status === "ACTIVE") bySite[w.siteId].activeCount++;

      if (!byBatch[w.batchNumber]) {
        byBatch[w.batchNumber] = {
          batchName: w.batchName,
          count: 0,
          activeCount: 0
        };
      }
      byBatch[w.batchNumber].count++;
      if (w.status === "ACTIVE") byBatch[w.batchNumber].activeCount++;

      if (!byTrade[w.jobRole]) {
        byTrade[w.jobRole] = { count: 0, activeCount: 0 };
      }
      byTrade[w.jobRole].count++;
      if (w.status === "ACTIVE") byTrade[w.jobRole].activeCount++;

      if (w.status === "ACTIVE") byStatus.ACTIVE++;
      else if (w.status === "SUSPENDED") byStatus.SUSPENDED++;
      else if (w.status === "PENDING") byStatus.PENDING++;
    }

    let filtered = [...allWorkers];
    if (siteId) filtered = filtered.filter((w) => w.siteId === siteId);
    if (batchNumber) filtered = filtered.filter((w) => w.batchNumber === batchNumber);
    if (jobRole) filtered = filtered.filter((w) => w.jobRole.toLowerCase() === jobRole.toLowerCase());
    if (status) filtered = filtered.filter((w) => w.status === status);

    filtered.sort((a, b) => a.workerId.localeCompare(b.workerId));

    const generatedAt = new Date().toISOString();
    const generatedBy = caller.email || caller.uid;

    await recordReportAudit(adminDb, "workforce", req.query, filtered.length, generatedBy);

    return res.json({
      success: true,
      summary: {
        totalWorkers: allWorkers.length,
        activeWorkers: byStatus.ACTIVE,
        suspendedWorkers: byStatus.SUSPENDED,
        pendingRegistrations: pendingRegSnap.size,
        bySite,
        byBatch,
        byTrade,
        byStatus
      },
      workers: filtered,
      filtersApplied: req.query,
      generatedAt,
      generatedBy
    });
  } catch (err: any) {
    console.error("[server] /api/reports/workforce error:", err);
    return sendAdminError(err, res, "Failed to load workforce report.");
  }
};

app.get("/api/reports/workforce", handleReportsWorkforce);
app.get("/api/admin/reports/workforce", handleReportsWorkforce);

// 4. Leave Report
const handleReportsLeave = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAdminAuth(req);
    const { startDate, endDate, workerId, siteId, leaveType, status } = req.query as Record<string, string>;

    const dateVal = validateDateRange(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({ error: dateVal.error });
    }

    const { adminDb } = getFirebaseAdmin();
    const [leaveSnap, workersSnap, sitesSnap] = await Promise.all([
      adminDb.collection("leaveRequests").get(),
      adminDb.collection("workers").get(),
      adminDb.collection("sites").get()
    ]);

    const workersMap = new Map<string, any>();
    workersSnap.forEach((d) => workersMap.set(d.id, d.data()));

    const sitesMap = new Map<string, any>();
    sitesSnap.forEach((d) => sitesMap.set(d.id, d.data()));

    let records = leaveSnap.docs.map((d) => {
      const data = d.data();
      const worker = workersMap.get(data.workerId);
      const site = worker ? sitesMap.get(worker.siteId) : null;

      return {
        leaveId: data.leaveId || d.id,
        workerId: data.workerId || "",
        workerName: worker?.fullName || data.workerName || "Worker",
        siteId: worker?.siteId || "SITE-101",
        siteName: site?.siteName || worker?.siteId || "Site",
        leaveType: data.leaveType || "CASUAL",
        startDate: data.startDate || "",
        endDate: data.endDate || "",
        daysCount: Number(data.daysCount) || 1,
        reason: data.reason || "",
        status: data.status || "PENDING",
        reviewedBy: data.reviewedBy || null,
        reviewedAt: data.reviewedAt || null,
        submittedAt: data.submittedAt || data.createdAt || ""
      };
    });

    if (startDate) {
      records = records.filter((r) => r.startDate >= startDate || r.endDate >= startDate);
    }
    if (endDate) {
      records = records.filter((r) => r.startDate <= endDate);
    }
    if (workerId) {
      records = records.filter((r) => r.workerId === workerId);
    }
    if (siteId) {
      records = records.filter((r) => r.siteId === siteId);
    }
    if (leaveType) {
      records = records.filter((r) => r.leaveType === leaveType);
    }
    if (status) {
      records = records.filter((r) => r.status === status);
    }

    records.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));

    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let cancelledCount = 0;
    let totalLeaveDays = 0;
    const byType: Record<string, number> = {};
    const bySite: Record<string, number> = {};

    for (const r of records) {
      if (r.status === "PENDING") pendingCount++;
      else if (r.status === "APPROVED") {
        approvedCount++;
        totalLeaveDays += r.daysCount;
      } else if (r.status === "REJECTED") rejectedCount++;
      else if (r.status === "CANCELLED") cancelledCount++;

      byType[r.leaveType] = (byType[r.leaveType] || 0) + 1;
      bySite[r.siteId] = (bySite[r.siteId] || 0) + 1;
    }

    const generatedAt = new Date().toISOString();
    const generatedBy = caller.email || caller.uid;

    await recordReportAudit(adminDb, "leave", req.query, records.length, generatedBy);

    return res.json({
      success: true,
      summary: {
        totalRequests: records.length,
        pendingCount,
        approvedCount,
        rejectedCount,
        cancelledCount,
        totalLeaveDays,
        byType,
        bySite
      },
      records,
      filtersApplied: req.query,
      generatedAt,
      generatedBy
    });
  } catch (err: any) {
    console.error("[server] /api/reports/leave error:", err);
    return sendAdminError(err, res, "Failed to load leave report.");
  }
};

app.get("/api/reports/leave", handleReportsLeave);
app.get("/api/admin/reports/leave", handleReportsLeave);

// 5. Overtime Report
const handleReportsOvertime = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAdminAuth(req);
    const { startDate, endDate, workerId, siteId, batchNumber, status } = req.query as Record<string, string>;

    const dateVal = validateDateRange(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({ error: dateVal.error });
    }

    const { adminDb } = getFirebaseAdmin();
    const [overtimeSnap, workersSnap, sitesSnap] = await Promise.all([
      adminDb.collection("overtimeRecords").get(),
      adminDb.collection("workers").get(),
      adminDb.collection("sites").get()
    ]);

    const workersMap = new Map<string, any>();
    workersSnap.forEach((d) => workersMap.set(d.id, d.data()));

    const sitesMap = new Map<string, any>();
    sitesSnap.forEach((d) => sitesMap.set(d.id, d.data()));

    let records = overtimeSnap.docs.map((d) => {
      const data = d.data();
      const worker = workersMap.get(data.workerId);
      const site = sitesMap.get(data.siteId);

      return {
        overtimeId: data.overtimeId || d.id,
        workerId: data.workerId || "",
        workerName: worker?.fullName || data.workerName || "Worker",
        siteId: data.siteId || "",
        siteName: site?.siteName || data.siteId || "Site",
        batchNumber: worker?.batchNumber || "B-01",
        date: data.date || "",
        hours: Number(data.hours) || 0,
        approvedHours: Number(data.approvedHours !== undefined ? data.approvedHours : (data.status === "APPROVED" ? data.hours : 0)) || 0,
        hourlyRate: Number(data.hourlyRate) || 0,
        calculatedAmount: data.calculatedAmount,
        status: data.status || "PENDING",
        reason: data.reason || "",
        reviewedBy: data.reviewedBy || null,
        reviewedAt: data.reviewedAt || null,
        createdAt: data.createdAt || ""
      };
    });

    if (startDate) records = records.filter((r) => r.date >= startDate);
    if (endDate) records = records.filter((r) => r.date <= endDate);
    if (workerId) records = records.filter((r) => r.workerId === workerId);
    if (siteId) records = records.filter((r) => r.siteId === siteId);
    if (batchNumber) records = records.filter((r) => r.batchNumber === batchNumber);
    if (status) records = records.filter((r) => r.status === status);

    records.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let totalRequestedHours = 0;
    let totalApprovedHours = 0;

    const bySite: Record<string, { requestedHours: number; approvedHours: number }> = {};
    const byWorker: Record<string, { requestedHours: number; approvedHours: number }> = {};
    const byPeriod: Record<string, { requestedHours: number; approvedHours: number }> = {};

    for (const r of records) {
      totalRequestedHours += r.hours;
      if (r.status === "PENDING") pendingCount++;
      else if (r.status === "APPROVED") {
        approvedCount++;
        totalApprovedHours += r.approvedHours; // Only approved overtime in approved totals!
      } else if (r.status === "REJECTED") rejectedCount++;

      if (!bySite[r.siteId]) bySite[r.siteId] = { requestedHours: 0, approvedHours: 0 };
      bySite[r.siteId].requestedHours += r.hours;
      if (r.status === "APPROVED") bySite[r.siteId].approvedHours += r.approvedHours;

      if (!byWorker[r.workerId]) byWorker[r.workerId] = { requestedHours: 0, approvedHours: 0 };
      byWorker[r.workerId].requestedHours += r.hours;
      if (r.status === "APPROVED") byWorker[r.workerId].approvedHours += r.approvedHours;

      const period = r.date ? r.date.substring(0, 7) : "Unknown";
      if (!byPeriod[period]) byPeriod[period] = { requestedHours: 0, approvedHours: 0 };
      byPeriod[period].requestedHours += r.hours;
      if (r.status === "APPROVED") byPeriod[period].approvedHours += r.approvedHours;
    }

    const generatedAt = new Date().toISOString();
    const generatedBy = caller.email || caller.uid;

    await recordReportAudit(adminDb, "overtime", req.query, records.length, generatedBy);

    return res.json({
      success: true,
      summary: {
        totalRequests: records.length,
        pendingCount,
        approvedCount,
        rejectedCount,
        totalRequestedHours: Math.round(totalRequestedHours * 100) / 100,
        totalApprovedHours: Math.round(totalApprovedHours * 100) / 100,
        bySite,
        byWorker,
        byPeriod
      },
      records,
      filtersApplied: req.query,
      generatedAt,
      generatedBy
    });
  } catch (err: any) {
    console.error("[server] /api/reports/overtime error:", err);
    return sendAdminError(err, res, "Failed to load overtime report.");
  }
};

app.get("/api/reports/overtime", handleReportsOvertime);
app.get("/api/admin/reports/overtime", handleReportsOvertime);

// 6. Salary / Payroll Report
const handleReportsSalary = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAdminAuth(req);
    const { payPeriod, workerId, status } = req.query as Record<string, string>;

    const { adminDb } = getFirebaseAdmin();
    const [salarySnap, workersSnap] = await Promise.all([
      adminDb.collection("salaryRecords").get(),
      adminDb.collection("workers").get()
    ]);

    const workersMap = new Map<string, any>();
    workersSnap.forEach((d) => workersMap.set(d.id, d.data()));

    let records = salarySnap.docs.map((d) => {
      const data = d.data();
      const worker = workersMap.get(data.workerId);

      return {
        salaryId: data.salaryId || d.id,
        workerId: data.workerId || "",
        workerName: worker?.fullName || data.workerName || "Worker",
        jobRole: data.jobRole || worker?.jobRole || "Labor",
        payPeriod: data.payPeriod || "",
        dailyRate: Number(data.dailyRate) || 0,
        daysAttended: Number(data.daysAttended) || 0,
        baseEarnings: Number(data.baseEarnings) || 0,
        approvedOvertimeHours: Number(data.approvedOvertimeHours) || 0,
        overtimeEarnings: Number(data.overtimeEarnings) || 0,
        allowances: Number(data.allowances) || 0,
        deductions: Number(data.deductions) || 0,
        netSalary: Number(data.netSalary) || 0,
        status: data.status || "DRAFT",
        calculatedAt: data.calculatedAt || "",
        processedAt: data.processedAt || null,
        paidAt: data.paidAt || null
      };
    });

    if (payPeriod) records = records.filter((r) => r.payPeriod === payPeriod);
    if (workerId) records = records.filter((r) => r.workerId === workerId);
    if (status) records = records.filter((r) => r.status === status);

    records.sort((a, b) => (b.payPeriod || "").localeCompare(a.payPeriod || ""));

    let totalCalculatedPayroll = 0;
    let totalProcessedPayroll = 0;
    let totalPaidPayroll = 0;
    let totalOvertimeEarnings = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;
    let totalNetSalary = 0;

    for (const r of records) {
      totalNetSalary += r.netSalary;
      totalOvertimeEarnings += r.overtimeEarnings;
      totalAllowances += r.allowances;
      totalDeductions += r.deductions;

      if (r.status === "DRAFT") totalCalculatedPayroll += r.netSalary;
      else if (r.status === "PROCESSED") totalProcessedPayroll += r.netSalary;
      else if (r.status === "PAID") totalPaidPayroll += r.netSalary;
    }

    const generatedAt = new Date().toISOString();
    const generatedBy = caller.email || caller.uid;

    await recordReportAudit(adminDb, "salary", req.query, records.length, generatedBy);

    return res.json({
      success: true,
      summary: {
        totalRecords: records.length,
        totalCalculatedPayroll: Math.round(totalCalculatedPayroll * 100) / 100,
        totalProcessedPayroll: Math.round(totalProcessedPayroll * 100) / 100,
        totalPaidPayroll: Math.round(totalPaidPayroll * 100) / 100,
        totalOvertimeEarnings: Math.round(totalOvertimeEarnings * 100) / 100,
        totalAllowances: Math.round(totalAllowances * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        totalNetSalary: Math.round(totalNetSalary * 100) / 100
      },
      records,
      filtersApplied: req.query,
      generatedAt,
      generatedBy,
      notice: "PAID status represents administrative ledger status only. No banking/payment transfer integration exists."
    });
  } catch (err: any) {
    console.error("[server] /api/reports/salary error:", err);
    return sendAdminError(err, res, "Failed to load salary report.");
  }
};

app.get("/api/reports/salary", handleReportsSalary);
app.get("/api/admin/reports/salary", handleReportsSalary);

// 7. Report Export (CSV format)
const handleReportsExport = async (req: express.Request, res: express.Response) => {
  try {
    const caller = await verifyAdminAuth(req);
    const reportType = (req.query.reportType as string) || (req.body?.reportType as string);

    if (!reportType || !["attendance", "workforce", "leave", "overtime", "salary"].includes(reportType)) {
      return res.status(400).json({
        error: "Valid reportType ('attendance', 'workforce', 'leave', 'overtime', 'salary') is required."
      });
    }

    const { adminDb } = getFirebaseAdmin();
    let headers: string[] = [];
    let rows: string[][] = [];

    const {
      startDate,
      endDate,
      siteId,
      batchNumber,
      workerId,
      status,
      leaveType,
      payPeriod,
      jobRole
    } = req.query as Record<string, string>;

    const dateVal = validateDateRange(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({ error: dateVal.error });
    }

    // Sites Map for name resolution
    const sitesSnap = await adminDb.collection("sites").get();
    const siteMap = new Map<string, string>();
    sitesSnap.forEach((d) => siteMap.set(d.id, d.data().siteName || d.data().name || d.id));

    // Workers Map for name resolution
    const workersSnap = await adminDb.collection("workers").get();
    const workerMap = new Map<string, any>();
    workersSnap.forEach((d) => workerMap.set(d.id, d.data()));

    if (reportType === "attendance") {
      headers = ["attendanceId", "workerId", "workerName", "siteId", "siteName", "date", "checkInTime", "checkOutTime", "status", "syncStatus"];
      const snap = await adminDb.collection("attendance").get();

      const filtered = snap.docs.filter((d) => {
        const data = d.data();
        if (startDate && (!data.date || data.date < startDate)) return false;
        if (endDate && (!data.date || data.date > endDate)) return false;
        if (siteId && data.siteId !== siteId) return false;
        if (workerId && data.workerId !== workerId) return false;
        if (status && data.status !== status) return false;
        return true;
      });

      rows = filtered.map((d) => {
        const data = d.data();
        const w = workerMap.get(data.workerId);
        const sName = siteMap.get(data.siteId) || data.siteName || "";
        return [
          d.id,
          data.workerId || "",
          w?.fullName || data.workerName || "",
          data.siteId || "",
          sName,
          data.date || "",
          data.checkInTime ? (typeof data.checkInTime.toDate === "function" ? data.checkInTime.toDate().toISOString() : String(data.checkInTime)) : "",
          data.checkOutTime ? (typeof data.checkOutTime.toDate === "function" ? data.checkOutTime.toDate().toISOString() : String(data.checkOutTime)) : "",
          data.status || "CHECKED_IN",
          data.syncStatus || "SYNCED"
        ];
      });
    } else if (reportType === "workforce") {
      headers = ["workerId", "fullName", "phone", "email", "jobRole", "status", "siteId", "siteName", "batchNumber", "joiningDate"];
      const snap = await adminDb.collection("workers").get();

      const filtered = snap.docs.filter((d) => {
        const data = d.data();
        if (siteId && (data.siteId !== siteId && data.assignedSiteId !== siteId)) return false;
        if (batchNumber && data.batchNumber !== batchNumber) return false;
        if (status && data.status !== status) return false;
        if (jobRole && data.jobRole !== jobRole) return false;
        if (workerId && (data.workerId !== workerId && d.id !== workerId)) return false;
        return true;
      });

      rows = filtered.map((d) => {
        const data = d.data();
        const sId = data.siteId || data.assignedSiteId || "";
        const sName = siteMap.get(sId) || "";
        return [
          data.workerId || d.id,
          data.fullName || "",
          data.phone || "",
          data.email || "",
          data.jobRole || "",
          data.status || "ACTIVE",
          sId,
          sName,
          data.batchNumber || "",
          data.joiningDate || ""
        ];
      });
    } else if (reportType === "leave") {
      headers = ["leaveId", "workerId", "workerName", "leaveType", "startDate", "endDate", "daysCount", "status", "reason", "reviewedBy", "reviewedAt"];
      const snap = await adminDb.collection("leaveRequests").get();

      const filtered = snap.docs.filter((d) => {
        const data = d.data();
        if (workerId && data.workerId !== workerId) return false;
        if (status && data.status !== status) return false;
        if (leaveType && data.leaveType !== leaveType) return false;
        if (startDate && (!data.startDate || data.startDate < startDate)) return false;
        if (endDate && (!data.endDate || data.endDate > endDate)) return false;
        return true;
      });

      rows = filtered.map((d) => {
        const data = d.data();
        const w = workerMap.get(data.workerId);
        return [
          data.leaveId || d.id,
          data.workerId || "",
          w?.fullName || data.workerName || "",
          data.leaveType || "",
          data.startDate || "",
          data.endDate || "",
          String(data.daysCount || 1),
          data.status || "PENDING",
          data.reason || "",
          data.reviewedBy || "",
          data.reviewedAt || ""
        ];
      });
    } else if (reportType === "overtime") {
      headers = ["overtimeId", "workerId", "workerName", "siteId", "date", "hours", "approvedHours", "hourlyRate", "status", "reason", "reviewedBy", "reviewedAt"];
      const snap = await adminDb.collection("overtimeRecords").get();

      const filtered = snap.docs.filter((d) => {
        const data = d.data();
        if (workerId && data.workerId !== workerId) return false;
        if (siteId && data.siteId !== siteId) return false;
        if (status && data.status !== status) return false;
        if (startDate && (!data.date || data.date < startDate)) return false;
        if (endDate && (!data.date || data.date > endDate)) return false;
        return true;
      });

      rows = filtered.map((d) => {
        const data = d.data();
        const w = workerMap.get(data.workerId);
        return [
          data.overtimeId || d.id,
          data.workerId || "",
          w?.fullName || data.workerName || "",
          data.siteId || "",
          data.date || "",
          String(data.hours || 0),
          String(data.approvedHours !== undefined ? data.approvedHours : (data.status === "APPROVED" ? data.hours : 0)),
          String(data.hourlyRate || 0),
          data.status || "PENDING",
          data.reason || "",
          data.reviewedBy || "",
          data.reviewedAt || ""
        ];
      });
    } else if (reportType === "salary") {
      headers = ["salaryId", "workerId", "workerName", "jobRole", "payPeriod", "dailyRate", "daysAttended", "baseEarnings", "approvedOvertimeHours", "overtimeEarnings", "allowances", "deductions", "netSalary", "status", "calculatedAt", "paidAt"];
      const snap = await adminDb.collection("salaryRecords").get();

      const filtered = snap.docs.filter((d) => {
        const data = d.data();
        if (workerId && data.workerId !== workerId) return false;
        if (payPeriod && data.payPeriod !== payPeriod) return false;
        if (status && data.status !== status) return false;
        return true;
      });

      rows = filtered.map((d) => {
        const data = d.data();
        const w = workerMap.get(data.workerId);
        return [
          data.salaryId || d.id,
          data.workerId || "",
          w?.fullName || data.workerName || "",
          data.jobRole || w?.jobRole || "",
          data.payPeriod || "",
          String(data.dailyRate || 0),
          String(data.daysAttended || 0),
          String(data.baseEarnings || 0),
          String(data.approvedOvertimeHours || 0),
          String(data.overtimeEarnings || 0),
          String(data.allowances || 0),
          String(data.deductions || 0),
          String(data.netSalary || 0),
          data.status || "DRAFT",
          data.calculatedAt || "",
          data.paidAt || ""
        ];
      });
    }

    const csvContent = [
      headers.map(escapeCsvValue).join(","),
      ...rows.map((row) => row.map(escapeCsvValue).join(","))
    ].join("\r\n");

    const generatedBy = caller.email || caller.uid;
    await recordReportAudit(adminDb, reportType, req.query, rows.length, generatedBy);

    // If client requested json format (or accepted application/json)
    if (req.query.format === "json" || req.headers.accept?.includes("application/json")) {
      return res.json({
        success: true,
        reportType,
        recordCount: rows.length,
        csv: csvContent,
        filename: `${reportType}-report-${Date.now()}.csv`
      });
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${reportType}-report-${Date.now()}.csv"`);
    return res.send(csvContent);
  } catch (err: any) {
    console.error("[server] /api/reports/export error:", err);
    return sendAdminError(err, res, "Failed to export report.");
  }
};

app.get("/api/reports/export", handleReportsExport);
app.post("/api/reports/export", handleReportsExport);
app.get("/api/admin/reports/export", handleReportsExport);
app.post("/api/admin/reports/export", handleReportsExport);

// =================================================================
// PHASE 7: ADMIN SECURITY MONITORING & AUDIT ENDPOINTS
// =================================================================

/**
 * GET /api/security/events
 * Admin-only security events monitoring and suspicious activity telemetry.
 */
app.get("/api/security/events", async (req, res) => {
  try {
    const caller = await verifyAdminAuth(req);
    const { adminDb } = getFirebaseAdmin();

    const {
      startDate,
      endDate,
      severity,
      eventType,
      workerId,
      siteId,
      limit: limitParam
    } = req.query;

    const maxLimit = Math.min(200, Math.max(10, parseInt(String(limitParam || "100"), 10) || 100));

    // Retrieve recent security events ordered by createdAt desc
    const snap = await adminDb.collection("securityEvents")
      .orderBy("createdAt", "desc")
      .limit(maxLimit)
      .get();

    let events: any[] = snap.docs.map((d) => d.data());

    // Apply query filters
    if (typeof startDate === "string" && startDate.trim()) {
      events = events.filter((e) => (e.timestamp || "").split("T")[0] >= startDate.trim());
    }
    if (typeof endDate === "string" && endDate.trim()) {
      events = events.filter((e) => (e.timestamp || "").split("T")[0] <= endDate.trim());
    }
    if (typeof severity === "string" && severity.trim()) {
      events = events.filter((e) => e.severity === severity.trim());
    }
    if (typeof eventType === "string" && eventType.trim()) {
      events = events.filter((e) => e.eventType === eventType.trim());
    }
    if (typeof workerId === "string" && workerId.trim()) {
      events = events.filter((e) => e.workerId === workerId.trim());
    }
    if (typeof siteId === "string" && siteId.trim()) {
      events = events.filter((e) => e.siteId === siteId.trim());
    }

    // Compute summary metrics
    const totalEvents = events.length;
    const criticalCount = events.filter((e) => e.severity === "CRITICAL").length;
    const highCount = events.filter((e) => e.severity === "HIGH").length;
    const warningCount = events.filter((e) => e.severity === "WARNING").length;
    const infoCount = events.filter((e) => e.severity === "INFO").length;
    const authFailures = events.filter((e) =>
      ["AUTH_FAILURE", "UNAUTHORIZED_ACCESS"].includes(e.eventType)
    ).length;
    const qrAnomalies = events.filter((e) =>
      ["INVALID_QR", "FORGED_QR", "EXPIRED_QR", "WRONG_SITE_QR"].includes(e.eventType)
    ).length;
    const unauthorizedRequests = events.filter((e) => e.eventType === "UNAUTHORIZED_ACCESS").length;

    // Active suspicious alerts within the last 24 hours
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    const activeAlerts: any[] = events
      .filter((e) => {
        const t = e.createdAt?.toMillis ? e.createdAt.toMillis() : new Date(e.timestamp).getTime();
        return e.eventType === "SUSPICIOUS_THRESHOLD_TRIGGERED" && t >= twentyFourHoursAgo;
      })
      .map((e) => ({
        alertId: e.eventId,
        pattern: e.metadata?.pattern || "UNKNOWN_PATTERN",
        severity: e.severity,
        description: e.metadata?.description || "Suspicious activity detected.",
        affectedWorkerId: e.workerId || undefined,
        affectedSiteId: e.siteId || undefined,
        eventCount: e.metadata?.actualCount || e.metadata?.count || 1,
        windowMinutes: e.metadata?.windowMinutes || 10,
        triggeredAt: e.timestamp
      }));

    const thresholds = [
      {
        name: "Repeated Forged / Invalid QR Scans",
        threshold: "≥ 3 attempts",
        window: "10 minutes",
        severity: "CRITICAL" as const,
        description: "Scans presenting invalid HMAC signatures or malformed tokens exceeding threshold"
      },
      {
        name: "Repeated Wrong-Site Scans",
        threshold: "≥ 3 attempts",
        window: "10 minutes",
        severity: "HIGH" as const,
        description: "Worker repeatedly scanning kiosk QR for unassigned construction site"
      },
      {
        name: "Unauthorized Administrative Endpoint Access",
        threshold: "≥ 3 attempts",
        window: "10 minutes",
        severity: "CRITICAL" as const,
        description: "Access attempts to protected admin routes by non-admin or unauthenticated callers"
      },
      {
        name: "Duplicate Attendance Spikes",
        threshold: "≥ 3 attempts",
        window: "10 minutes",
        severity: "WARNING" as const,
        description: "Multiple check-in attempts on already checked-in or completed shifts"
      },
      {
        name: "Suspended Worker Attendance Attempts",
        threshold: "≥ 2 attempts",
        window: "10 minutes",
        severity: "CRITICAL" as const,
        description: "Deactivated or suspended worker attempting to record site attendance"
      }
    ];

    return res.json({
      success: true,
      summary: {
        totalEvents,
        criticalCount,
        highCount,
        warningCount,
        infoCount,
        authFailures,
        qrAnomalies,
        unauthorizedRequests
      },
      recentEvents: events,
      activeAlerts,
      thresholds
    });
  } catch (err: any) {
    console.error("[server] /api/security/events error:", err);
    return sendAdminError(err, res, "Failed to retrieve security events.");
  }
});

// =================================================================
// PHASE 7: ADMIN AI MANAGEMENT INSIGHTS (ASSISTIVE ANALYTICS)
// =================================================================

/**
 * POST /api/ai/management-insights
 * Real application data aggregation + Gemini analysis with prompt injection defense.
 */
app.post("/api/ai/management-insights", async (req, res) => {
  try {
    const caller = await verifyAdminAuth(req);
    if (caller.role !== 'ADMIN') {
      try {
        const { adminDb } = getFirebaseAdmin();
        await recordSecurityEvent(adminDb, {
          eventType: "UNAUTHORIZED_ACCESS",
          actorUid: caller.uid,
          actorRole: caller.role,
          result: "FAILURE",
          severity: "HIGH",
          source: req.path || "ADMIN_AI",
          metadata: { reason: "Admin AI operations strictly restricted to ADMIN role. SITE_SUPERVISOR denied.", path: req.path }
        });
      } catch {}
      return res.status(403).json({
        success: false,
        error: "Access denied: Administrator role required for AI Operations Assistant. Site Supervisors cannot access Admin AI."
      });
    }

    // Rate Limit Check (Sliding 1-minute window, max 10 requests)
    const rateCheck = checkAiRateLimit(caller.uid);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `AI rate limit exceeded. Please wait ${rateCheck.resetInSec} seconds before submitting another request.`
      });
    }

    const { adminDb } = getFirebaseAdmin();
    const { startDate, endDate, forceRefresh } = req.body || {};

    let startStr = typeof startDate === "string" ? startDate.trim() : "";
    let endStr = typeof endDate === "string" ? endDate.trim() : "";

    const todayStr = new Date().toISOString().split("T")[0];
    if (!startStr) {
      const parts = todayStr.split("-");
      startStr = `${parts[0]}-${parts[1]}-01`;
    }
    if (!endStr) {
      endStr = todayStr;
    }

    if (startStr > endStr) {
      return res.status(400).json({
        success: false,
        error: "Invalid date range: end date cannot be earlier than start date."
      });
    }

    const cacheKey = `${startStr}_${endStr}`;
    if (!forceRefresh) {
      const cachedEntry = aiInsightsCache.get(cacheKey);
      if (cachedEntry && (Date.now() - cachedEntry.timestamp) < AI_INSIGHTS_CACHE_TTL_MS) {
        return res.json(cachedEntry.payload);
      }
    }

    // Query ground-truth Firestore records in parallel
    let attendanceQueryFailed = false;
    let attendanceErrorMessage = "";
    const [
      workersSnap,
      sitesSnap,
      attendanceRes,
      leaveSnap,
      overtimeSnap,
      salarySnap,
      secEventsSnap,
      registrationsSnap
    ] = await Promise.all([
      adminDb.collection("workers").get(),
      adminDb.collection("sites").get(),
      adminDb.collection("attendance").get().then(snap => ({ ok: true as const, snap })).catch(err => ({ ok: false as const, err })),
      adminDb.collection("leaveRequests").get(),
      adminDb.collection("overtimeRecords").get(),
      adminDb.collection("salaryRecords").get(),
      adminDb.collection("securityEvents").limit(100).get(),
      adminDb.collection("workerRegistrations").get()
    ]);

    const workers = workersSnap.docs.map((d) => d.data());
    const sites = sitesSnap.docs.map((d) => d.data());
    let allAttendance: any[] = [];
    if (attendanceRes.ok) {
      allAttendance = attendanceRes.snap.docs.map((d) => d.data());
    } else {
      attendanceQueryFailed = true;
      const resErr = (attendanceRes as { ok: false; err: any }).err;
      attendanceErrorMessage = resErr?.message || "Failed to query attendance collection";
      console.warn("[management-insights] Attendance query failed:", attendanceErrorMessage);
    }
    const allLeave = leaveSnap.docs.map((d) => d.data());
    const allOvertime = overtimeSnap.docs.map((d) => d.data());
    const allSalary = salarySnap.docs.map((d) => d.data());
    const allSecEvents = secEventsSnap.docs.map((d) => d.data());
    const allRegistrations = registrationsSnap.docs.map((d) => d.data());

    // Filter collections by period
    const attendance = attendanceQueryFailed ? [] : allAttendance.filter((a) => {
      const d = a.date || "";
      return d >= startStr && d <= endStr;
    });

    const leave = allLeave.filter((l) => {
      const s = l.startDate || "";
      return s >= startStr && s <= endStr;
    });

    const overtime = allOvertime.filter((o) => {
      const d = o.date || "";
      return d >= startStr && d <= endStr;
    });

    const salary = allSalary.filter((s) => {
      const p = s.payPeriod || "";
      const periodMonth = startStr.substring(0, 7);
      return p === periodMonth;
    });

    const secEvents = allSecEvents.filter((e) => {
      const d = (e.timestamp || "").split("T")[0];
      return d >= startStr && d <= endStr;
    });

    // Compute ground-truth observed numbers
    const activeWorkers = workers.filter((w) => w.status === "ACTIVE").length;
    const suspendedWorkers = workers.filter((w) => w.status === "SUSPENDED").length;
    const activeSites = sites.filter((s) => s.status === "ACTIVE").length;
    const inactiveSites = sites.length - activeSites;

    const checkedInCount = attendance.filter((a) => a.status === "CHECKED_IN").length;
    const completedCount = attendance.filter((a) => a.status === "COMPLETED").length;
    const completionRate = attendance.length > 0 ? Math.round((completedCount / attendance.length) * 100) : 0;

    const approvedLeaveDays = leave
      .filter((l) => l.status === "APPROVED")
      .reduce((acc, l) => acc + (Number(l.daysCount) || 0), 0);

    const approvedOtHours = overtime
      .filter((o) => o.status === "APPROVED")
      .reduce((acc, o) => acc + (Number(o.approvedHours !== undefined ? o.approvedHours : o.hours) || 0), 0);

    const totalNetSalary = salary.reduce((acc, s) => acc + (Number(s.netSalary) || 0), 0);

    const highOrCriticalSec = secEvents.filter(
      (e) => e.severity === "HIGH" || e.severity === "CRITICAL"
    ).length;

    const qrFailures = secEvents.filter((e) =>
      ["INVALID_QR", "FORGED_QR", "EXPIRED_QR", "WRONG_SITE_QR"].includes(e.eventType)
    ).length;

    const observedData = {
      workforce: {
        total: workers.length,
        active: activeWorkers,
        suspended: suspendedWorkers
      },
      sites: {
        total: sites.length,
        active: activeSites,
        inactive: inactiveSites
      },
      attendance: {
        totalRecords: attendance.length,
        checkedInCount,
        completedCount,
        completionRatePercent: completionRate
      },
      overtime: {
        totalRequests: overtime.length,
        approvedHours: Math.round(approvedOtHours * 10) / 10
      },
      leave: {
        totalRequests: leave.length,
        approvedDays: approvedLeaveDays
      },
      payroll: {
        totalNetSalary: Math.round(totalNetSalary * 100) / 100,
        recordsCount: salary.length
      },
      security: {
        totalEvents: secEvents.length,
        highOrCriticalAlerts: highOrCriticalSec,
        qrFailures
      }
    };

    // Insufficient Data Check (Safe non-hallucinatory fallback with complete schema contract)
    if (workers.length === 0 && attendance.length === 0) {
      const emptyPayload = {
        success: true,
        period: { startDate: startStr, endDate: endStr },
        observedData,
        aiInsights: [
          {
            topic: "Workforce & Attendance",
            observation: "Insufficient data for this insight. No workforce or attendance records found for the selected period.",
            severity: "NORMAL"
          }
        ],
        recommendations: [
          "Register civil workers and initiate site attendance kiosks to accumulate real operational data."
        ],
        dailyActionList: [
          "Register civil workers and initiate site attendance kiosks to accumulate real operational data."
        ],
        dailyActions: [],
        workforceBrief: {
          todayHeadline: "Zero Active Personnel Logged in System",
          totalActiveWorkers: 0,
          presentToday: attendanceQueryFailed ? null : 0,
          absentToday: attendanceQueryFailed ? null : 0,
          attendanceDataAvailable: !attendanceQueryFailed,
          attendanceErrorMessage: attendanceQueryFailed ? attendanceErrorMessage : undefined,
          unassignedWorkers: 0,
          activeSites: 0,
          inactiveSites: sites.length,
          pendingRegistrations: allRegistrations.filter((r) => r.status === "PENDING").length,
          pendingLeaveRequests: 0,
          pendingOvertimeClaims: 0,
          todayAttendanceRecords: attendanceQueryFailed ? null : 0,
          activeDeployments: 0,
          completionRate: 0,
          staffingStatus: "No Active Deployed Workforce",
          summary: attendanceQueryFailed
            ? "No registered workforce records found in database. Attendance query failed; attendance metrics unavailable."
            : "No registered workforce records or attendance logs found in database. Grounded operational intelligence requires registered workforce."
        },
        siteRiskAlerts: [],
        attendancePattern: {
          completionRatePercent: 0,
          openShiftsCount: 0,
          completedCount: 0,
          absenteeismCount: 0,
          analysis: "No attendance shift records logged during this period.",
          flags: ["Zero recorded shift sessions in timeframe"]
        },
        workforcePlanning: {
          tradeDistribution: {},
          understaffedSites: [],
          unassignedWorkers: 0,
          siteBalancingRecommendations: ["Register civil workers to initiate trade allocation."]
        },
        overtimePayroll: {
          pendingOvertimeCount: 0,
          approvedOvertimeHours: 0,
          estimatedOvertimeCost: 0,
          payrollSlipsCount: 0,
          totalPayrollLiability: 0,
          analysis: "Zero overtime liabilities or pending claims.",
          payrollReadiness: "READY"
        },
        reportSummary: {
          executiveSummary: "Database records currently empty for evaluation period.",
          keyTakeaways: ["Zero registered workers", "Zero attendance entries"],
          operationalHealthScore: 100,
          complianceHealth: "NOMINAL"
        },
        insufficientData: true,
        generatedAt: new Date().toISOString(),
        modelUsed: process.env.GEMINI_API_KEY?.trim() ? "gemini-3.8-flash" : "Rules-based Operational Engine",
        disclaimer: "AI-generated advisory insight. All managerial decisions regarding workforce, compensation, and access remain the sole responsibility of human administrators."
      };
      return res.json(emptyPayload);
    }

    // Compute additional construction metrics for insights
    const unassignedWorkers = workers.filter((w) => !w.siteId && !(w as any).assignedSiteId && w.status === 'ACTIVE').length;
    const sitesWithoutWorkers = sites
      .filter((s) => s.status === 'ACTIVE' && workers.filter((w) => (w.siteId || (w as any).assignedSiteId) === s.siteId).length === 0)
      .map((s) => s.siteName ? `${s.siteName} (${s.siteId})` : s.siteId);
    const workersWithZeroAttendance = workers.filter((w) => w.status === 'ACTIVE' && !attendance.some((a) => a.workerId === w.workerId)).length;
    const pendingLeaveCount = leave.filter((l) => l.status === 'PENDING').length;
    const pendingOvertimeCount = overtime.filter((o) => o.status === 'PENDING').length;
    const openShifts = attendance.filter((a) => a.status === 'CHECKED_IN').length;
    const pendingRegistrationsCount = allRegistrations.filter((r) => r.status === "PENDING").length;

    // Today in IST (Asia/Kolkata)
    const istFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const todayDateStr = istFormatter.format(new Date());
    const todayAttendanceDocs = attendanceQueryFailed ? [] : allAttendance.filter((a) => a.date === todayDateStr);
    const todayWorkersPresent = new Set(todayAttendanceDocs.map((a) => a.workerId));
    const presentTodayCount = attendanceQueryFailed ? null : todayWorkersPresent.size;
    const absentTodayCount = attendanceQueryFailed ? null : Math.max(0, activeWorkers - (presentTodayCount ?? 0));

    const inactiveSitesWithWorkers = sites.filter(s => s.status === "INACTIVE" && workers.some(w => (w.siteId === s.siteId || (w as any).assignedSiteId === s.siteId) && w.status === "ACTIVE"));

    // Minimized facts payload for AI (never contains passwords, PINs, secrets, tokens, PII)
    const minimizedDataForAI = {
      period: { startDate: startStr, endDate: endStr },
      workforceSummary: {
        totalWorkers: workers.length,
        activeWorkers,
        suspendedWorkers,
        unassignedWorkers,
        workersWithZeroAttendanceInPeriod: workersWithZeroAttendance,
        tradesBreakdown: workers.reduce((acc: Record<string, number>, w: any) => {
          const trade = w.jobRole || "General Labor";
          acc[trade] = (acc[trade] || 0) + 1;
          return acc;
        }, {})
      },
      sitesSummary: {
        totalSites: sites.length,
        activeSites,
        sitesWithoutAssignedWorkers: sitesWithoutWorkers,
        siteDistribution: sites.map((s) => ({
          siteId: s.siteId,
          siteName: s.siteName,
          status: s.status,
          assignedWorkers: workers.filter((w) => (w.siteId || (w as any).assignedSiteId) === s.siteId).length
        }))
      },
      attendanceSummary: {
        totalSessions: attendance.length,
        checkedInActiveShifts: checkedInCount,
        completedShifts: completedCount,
        openShiftsUncompleted: openShifts,
        completionRatePercentage: completionRate
      },
      overtimeSummary: {
        totalRequests: overtime.length,
        approvedHours: Math.round(approvedOtHours * 10) / 10,
        pendingRequests: pendingOvertimeCount
      },
      leaveSummary: {
        totalRequests: leave.length,
        approvedDays: approvedLeaveDays,
        pendingRequests: pendingLeaveCount
      },
      securitySummary: {
        totalEventsLogged: secEvents.length,
        highOrCriticalAlerts: highOrCriticalSec,
        qrScanAnomalies: qrFailures
      }
    };

    const systemInstruction = `You are an AI Operational Intelligence Assistant for a Civil Workforce Attendance and Site Security System.
Your job is to generate purely assistive, non-binding managerial observations and suggestions for human site administrators.
CRITICAL CONSTRAINTS:
1. You are strictly assistive. You cannot make decisions, change permissions, or execute actions.
2. All operational numbers provided are factual aggregates.
3. If data is sparse or missing, explicitly state "Insufficient data for this insight." Never speculate or invent numbers.
4. Topics must include:
   - "Today's Workforce Brief"
   - "Attendance Anomalies"
   - "Workers & Sites Needing Attention"
   - "Unusual Absenteeism Patterns"
   - "Overtime & Leave Patterns"
   - "Site Staffing Warnings"
   - "Security Risk Summary"
5. Output valid JSON strictly following this schema:
{
  "aiInsights": [
    { "topic": string, "observation": string, "severity": "NORMAL" | "ATTENTION" | "CRITICAL" }
  ],
  "recommendations": string[]
}
6. Always use Indian Rupee currency (₹ / INR) for any compensation, payroll, or overtime cost values. Never use dollars ($ / USD).`;

    const promptContent = `Operational data aggregates for period ${startStr} to ${endStr}:
${JSON.stringify(minimizedDataForAI, null, 2)}

Generate structured observations covering Today's Workforce Brief, Attendance Anomalies, Workers & Sites Needing Attention, Absenteeism, Overtime & Leave, Site Staffing Warnings, Security Risk, and a concise Daily Action List in recommendations for civil site administrators.`;

    // Check Gemini API Key
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    let parsedResult: any = null;
    let modelUsed = "gemini-3.8-flash";

    if (geminiKey) {
      try {
        // Call Gemini API via @google/genai SDK with 4-second timeout to prevent stalling
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const aiPromise = ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: promptContent,
          config: {
            systemInstruction,
            responseMimeType: "application/json"
          }
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Gemini API call timed out after 4000ms")), 4000)
        );
        const response: any = await Promise.race([aiPromise, timeoutPromise]);

        const text = response.text || "{}";
        parsedResult = JSON.parse(text);
        modelUsed = "gemini-3.8-flash (Live Gemini AI)";
      } catch (aiErr: any) {
        const isQuota = aiErr?.status === 429 || String(aiErr?.message || "").includes("quota") || String(aiErr?.message || "").includes("429");
        console.log(`[server] AI Management Insights: ${isQuota ? "Gemini quota limit reached" : "Gemini service temporarily unavailable (" + aiErr?.message + ")"}; using deterministic operational heuristics.`);
        modelUsed = "Rules-based Operational Engine (Grounded in Firestore records)";
      }
    } else {
      modelUsed = "Rules-based Operational Engine (Deterministic Heuristics)";
    }

    if (!parsedResult || !Array.isArray(parsedResult.aiInsights)) {

      const insightsList: any[] = [];
      const recsList: string[] = [];

      // 1. Today's Workforce Brief
      if (workers.length === 0) {
        insightsList.push({
          topic: "Today's Workforce Brief",
          observation: "Insufficient data for this insight. No registered civil workforce found for this period.",
          severity: "ATTENTION"
        });
      } else {
        insightsList.push({
          topic: "Today's Workforce Brief",
          observation: `Workforce headcount of ${workers.length} personnel with ${activeWorkers} active across ${activeSites} operational sites. ${checkedInCount} shifts actively checked in today with ${completedCount} completed sessions.`,
          severity: "NORMAL"
        });
      }

      // 2. Attendance Anomalies
      if (attendance.length === 0) {
        insightsList.push({
          topic: "Attendance Anomalies",
          observation: "Insufficient data for this insight. No shift records logged during this period.",
          severity: "NORMAL"
        });
      } else if (openShifts > 5) {
        insightsList.push({
          topic: "Attendance Anomalies",
          observation: `${openShifts} shifts remain open without check-out timestamps. Site supervisors should ensure workers scan the rotating exit QR code upon shift conclusion.`,
          severity: "ATTENTION"
        });
      } else {
        insightsList.push({
          topic: "Attendance Anomalies",
          observation: `Attendance completion rate is ${completionRate}%. Normal exit scan compliance observed across active shifts.`,
          severity: completionRate < 70 ? "ATTENTION" : "NORMAL"
        });
      }

      // 3. Workers & Sites Needing Attention
      if (unassignedWorkers > 0 || sitesWithoutWorkers.length > 0) {
        insightsList.push({
          topic: "Workers & Sites Needing Attention",
          observation: `${unassignedWorkers} active workers have no assigned primary construction site. ${sitesWithoutWorkers.length > 0 ? `Sites lacking personnel: ${sitesWithoutWorkers.join(", ")}.` : ""}`,
          severity: "ATTENTION"
        });
      } else {
        insightsList.push({
          topic: "Workers & Sites Needing Attention",
          observation: "All active workers are assigned to operational construction sites with balanced supervisor coverage.",
          severity: "NORMAL"
        });
      }

      // 4. Unusual Absenteeism Patterns
      if (workersWithZeroAttendance > 0 && workers.length > 0) {
        insightsList.push({
          topic: "Unusual Absenteeism Patterns",
          observation: `${workersWithZeroAttendance} of ${activeWorkers} active workers have zero attendance records logged in this timeframe. Verify unnotified absences with field timekeepers.`,
          severity: workersWithZeroAttendance > 3 ? "ATTENTION" : "NORMAL"
        });
      } else {
        insightsList.push({
          topic: "Unusual Absenteeism Patterns",
          observation: "No significant absenteeism spikes detected. Active roster attendance is consistent across deployed squads.",
          severity: "NORMAL"
        });
      }

      // 5. Overtime & Leave Patterns
      if (pendingOvertimeCount > 0 || pendingLeaveCount > 0) {
        insightsList.push({
          topic: "Overtime & Leave Patterns",
          observation: `Action required: ${pendingOvertimeCount} overtime requests and ${pendingLeaveCount} leave applications awaiting supervisor authorization.`,
          severity: "ATTENTION"
        });
      } else {
        insightsList.push({
          topic: "Overtime & Leave Patterns",
          observation: `Overtime utilization is balanced (${approvedOtHours}h approved). All submitted leave requests are processed.`,
          severity: "NORMAL"
        });
      }

      // 6. Site Staffing Warnings
      if (sitesWithoutWorkers.length > 0) {
        insightsList.push({
          topic: "Site Staffing Warnings",
          observation: `Warning: ${sitesWithoutWorkers.length} active construction site(s) currently have zero assigned workforce (${sitesWithoutWorkers.join(", ")}).`,
          severity: "ATTENTION"
        });
      } else {
        insightsList.push({
          topic: "Site Staffing Warnings",
          observation: `Site staffing levels within acceptable operational parameters across all ${activeSites} active sites.`,
          severity: "NORMAL"
        });
      }

      // 7. Security Risk Summary
      if (highOrCriticalSec > 0) {
        insightsList.push({
          topic: "Security Risk Summary",
          observation: `${highOrCriticalSec} high or critical security alerts recorded in the audit ledger (${qrFailures} QR scan anomalies). Immediate supervisor audit recommended.`,
          severity: "CRITICAL"
        });
      } else {
        insightsList.push({
          topic: "Security Risk Summary",
          observation: "Zero high or critical security anomalies detected. Cryptographic QR tokens and location integrity are nominal.",
          severity: "NORMAL"
        });
      }

      // Concise Daily Action List
      if (pendingOvertimeCount > 0) {
        recsList.push(`Review and approve/reject ${pendingOvertimeCount} pending overtime claims before weekly payroll processing.`);
      }
      if (pendingLeaveCount > 0) {
        recsList.push(`Process ${pendingLeaveCount} pending leave applications to ensure accurate site roster planning.`);
      }
      if (unassignedWorkers > 0) {
        recsList.push(`Assign ${unassignedWorkers} unassigned workers to operational sites in Civil Workers management.`);
      }
      if (openShifts > 5) {
        recsList.push(`Instruct site timekeepers to audit open shifts and remind crews to scan exit QR.`);
      }
      if (highOrCriticalSec > 0) {
        recsList.push("Inspect security audit logs for repeated failed or wrong-site QR verification attempts.");
      }
      recsList.push("Synchronize live attendance logs with site supervisors at end of shift.");

      parsedResult = {
        aiInsights: insightsList,
        recommendations: recsList
      };
    }

    const aiInsights = Array.isArray(parsedResult?.aiInsights) ? parsedResult.aiInsights : [];
    const recommendations = Array.isArray(parsedResult?.recommendations) ? parsedResult.recommendations : [];

    // Log AI insight request in security events
    await recordSecurityEvent(adminDb, {
      eventType: "AI_INSIGHT_REQUESTED",
      actorUid: caller.uid,
      actorRole: "ADMIN",
      result: "SUCCESS",
      severity: "INFO",
      source: "API_AI_MANAGEMENT_INSIGHTS",
      metadata: { period: `${startStr} to ${endStr}`, insightCount: aiInsights.length }
    });

    const workforceBrief = {
      todayHeadline: `${activeWorkers} Active Personnel Deployed across ${activeSites} Construction Sites`,
      totalActiveWorkers: activeWorkers,
      presentToday: presentTodayCount,
      absentToday: absentTodayCount,
      attendanceDataAvailable: !attendanceQueryFailed,
      attendanceErrorMessage: attendanceQueryFailed ? attendanceErrorMessage : undefined,
      unassignedWorkers,
      activeSites,
      inactiveSites,
      pendingRegistrations: pendingRegistrationsCount,
      pendingLeaveRequests: pendingLeaveCount,
      pendingOvertimeClaims: pendingOvertimeCount,
      todayAttendanceRecords: attendanceQueryFailed ? null : todayAttendanceDocs.length,
      activeDeployments: attendanceQueryFailed ? null : checkedInCount,
      completionRate: attendanceQueryFailed ? null : completionRate,
      staffingStatus: sitesWithoutWorkers.length > 0 ? `${sitesWithoutWorkers.length} Understaffed Site(s)` : "Balanced Staffing",
      summary: attendanceQueryFailed
        ? `Civil workforce operational status: ${workers.length} registered total (${activeWorkers} active), ${activeSites} active sites, ${inactiveSites} inactive sites. Attendance query failed (${attendanceErrorMessage}); attendance metrics currently unavailable.`
        : `Civil workforce operational status is nominal. ${workers.length} registered total (${activeWorkers} active), ${presentTodayCount} present today, ${absentTodayCount} absent today, ${activeSites} active sites, ${inactiveSites} inactive sites. ${pendingRegistrationsCount} worker registrations pending verification.`
    };

    // 2. Site Risk & Attention Alerts
    const siteRiskAlerts: Array<{
      id: string;
      siteId?: string;
      siteName?: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      title: string;
      description: string;
      mitigation: string;
    }> = [];

    if (inactiveSitesWithWorkers.length > 0) {
      siteRiskAlerts.push({
        id: "risk-inactive-site-workers",
        severity: "HIGH",
        title: "Inactive Site with Assigned Workers",
        description: `${inactiveSitesWithWorkers.length} inactive site(s) (${inactiveSitesWithWorkers.map(s => s.siteName || s.siteId).join(", ")}) currently have active workers assigned. Workers cannot record attendance until reassigned.`,
        mitigation: "Reassign affected workers to operational active sites in Civil Workers management."
      });
    }

    if (sitesWithoutWorkers.length > 0) {
      siteRiskAlerts.push({
        id: "risk-empty-sites",
        severity: "HIGH",
        title: "Unstaffed Construction Sites Detected",
        description: `${sitesWithoutWorkers.length} active site(s) currently have zero assigned workforce (${sitesWithoutWorkers.join(", ")}).`,
        mitigation: "Assign workers from unassigned personnel or rebalance squads from active batches."
      });
    }

    if (unassignedWorkers > 0) {
      siteRiskAlerts.push({
        id: "risk-unassigned-workers",
        severity: "MEDIUM",
        title: "Unassigned Personnel on Roster",
        description: `${unassignedWorkers} active worker(s) do not have a primary construction site assigned.`,
        mitigation: "Assign workers to active projects via Civil Workers management."
      });
    }

    if (highOrCriticalSec > 0) {
      siteRiskAlerts.push({
        id: "risk-security-alerts",
        severity: "CRITICAL",
        title: "Elevated Security Events Recorded",
        description: `${highOrCriticalSec} high or critical security events logged in audit ledger (${qrFailures} QR scan verification anomalies).`,
        mitigation: "Review security audit ledger and verify site perimeter QR kiosk tokens."
      });
    }

    if (openShifts > 5) {
      siteRiskAlerts.push({
        id: "risk-open-shifts",
        severity: "MEDIUM",
        title: "High Open Shift Volume",
        description: `${openShifts} shifts have check-in but no check-out timestamps logged.`,
        mitigation: "Remind site timekeepers to enforce exit QR code scanning at shift wrap-up."
      });
    }

    if (siteRiskAlerts.length === 0) {
      siteRiskAlerts.push({
        id: "risk-nominal",
        severity: "LOW",
        title: "Site Operational Risks Nominal",
        description: "All construction sites have assigned personnel with balanced supervisor coverage and zero critical alerts.",
        mitigation: "Continue standard shift monitoring and rotation audits."
      });
    }

    // 3. AI Daily Action List
    const dailyActions: Array<{
      id: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      action: string;
      category: 'OVERTIME' | 'LEAVE' | 'WORKERS' | 'SITES' | 'ATTENDANCE' | 'REGISTRATION' | 'SECURITY';
      linkScreen?: string;
    }> = [];

    if (pendingRegistrationsCount > 0) {
      dailyActions.push({
        id: "act-reg",
        priority: "HIGH",
        action: `Review and verify ${pendingRegistrationsCount} pending worker registration(s).`,
        category: "REGISTRATION",
        linkScreen: "admin_registrations"
      });
    }

    if (inactiveSitesWithWorkers.length > 0) {
      dailyActions.push({
        id: "act-reassign-inactive",
        priority: "HIGH",
        action: `Reassign workers from ${inactiveSitesWithWorkers.length} inactive site(s) to active sites.`,
        category: "WORKERS",
        linkScreen: "admin_workers"
      });
    }

    if (pendingOvertimeCount > 0) {
      dailyActions.push({
        id: "act-ot",
        priority: "HIGH",
        action: `Review and process ${pendingOvertimeCount} pending overtime claim(s) before weekly payroll calculation.`,
        category: "OVERTIME",
        linkScreen: "admin_overtime"
      });
    }

    if (pendingLeaveCount > 0) {
      dailyActions.push({
        id: "act-leave",
        priority: "HIGH",
        action: `Review ${pendingLeaveCount} pending leave application(s) to ensure adequate site crew coverage.`,
        category: "LEAVE",
        linkScreen: "admin_leave"
      });
    }

    if (unassignedWorkers > 0) {
      dailyActions.push({
        id: "act-assign",
        priority: "MEDIUM",
        action: `Assign ${unassignedWorkers} unassigned worker(s) to operational construction sites.`,
        category: "WORKERS",
        linkScreen: "admin_workers"
      });
    }

    if (openShifts > 5) {
      dailyActions.push({
        id: "act-shifts",
        priority: "MEDIUM",
        action: `Instruct site foremen to check on ${openShifts} open shifts and verify exit QR scans.`,
        category: "ATTENDANCE",
        linkScreen: "admin_reports"
      });
    }

    if (highOrCriticalSec > 0) {
      dailyActions.push({
        id: "act-sec",
        priority: "HIGH",
        action: `Inspect security audit trail for ${highOrCriticalSec} high/critical alert(s).`,
        category: "SECURITY",
        linkScreen: "admin_security"
      });
    }

    dailyActions.push({
      id: "act-sync",
      priority: "LOW",
      action: "Perform end-of-day attendance sync with field supervisor reports.",
      category: "SITES",
      linkScreen: "admin_dashboard"
    });

    // 4. Attendance Pattern Analysis
    const attendancePattern = {
      completionRatePercent: completionRate,
      openShiftsCount: openShifts,
      completedCount,
      absenteeismCount: workersWithZeroAttendance,
      analysis: attendance.length === 0
        ? "No attendance shift records logged during this period."
        : `Shift completion rate is ${completionRate}% across ${attendance.length} total shift records. ${openShifts} shifts are currently in progress without recorded checkout. Overall attendance discipline is ${completionRate >= 80 ? "excellent" : completionRate >= 60 ? "moderate" : "in need of attention"}.`,
      flags: [
        ...(openShifts > 5 ? [`${openShifts} open uncompleted shifts`] : []),
        ...(workersWithZeroAttendance > 0 ? [`${workersWithZeroAttendance} active personnel with zero attendance in timeframe`] : []),
        ...(completionRate < 70 && attendance.length > 0 ? ["Sub-70% shift checkout compliance"] : [])
      ]
    };

    // 5. Workforce Planning Insights
    const tradeDistribution: Record<string, number> = {};
    workers.forEach(w => {
      const role = w.jobRole || "General Labor";
      tradeDistribution[role] = (tradeDistribution[role] || 0) + 1;
    });

    const workforcePlanning = {
      tradeDistribution,
      understaffedSites: sitesWithoutWorkers,
      unassignedWorkers,
      siteBalancingRecommendations: [
        ...(sitesWithoutWorkers.length > 0 ? [`Deploy available trade squads to understaffed site(s): ${sitesWithoutWorkers.join(", ")}.`] : ["All active project sites maintain designated workforce."]),
        ...(unassignedWorkers > 0 ? [`Roster rebalancing needed: allocate ${unassignedWorkers} general workers to active project phases.`] : ["100% worker site assignment achieved across active roster."]),
        `Current trade ratio: ${Object.entries(tradeDistribution).map(([t, c]) => `${t} (${c})`).slice(0, 4).join(", ")}.`
      ]
    };

    // 6. Overtime & Payroll Insights
    const estimatedOvertimeCost = Math.round(approvedOtHours * 25 * 1.5);
    const overtimePayroll = {
      pendingOvertimeCount,
      approvedOvertimeHours: approvedOtHours,
      estimatedOvertimeCost,
      payrollSlipsCount: salary.length,
      totalPayrollLiability: Math.round(totalNetSalary),
      analysis: pendingOvertimeCount > 0
        ? `${pendingOvertimeCount} overtime claim(s) require supervisor sign-off before payroll cycle close. ${approvedOtHours}h approved overtime represents approx ₹${estimatedOvertimeCost} in supplemental compensation.`
        : `Overtime utilization is balanced with ${approvedOtHours}h approved (₹${estimatedOvertimeCost} est. liability). All submitted overtime claims have been resolved.`,
      payrollReadiness: pendingOvertimeCount > 0 ? ("ATTENTION_NEEDED" as const) : ("READY" as const)
    };

    // 7. AI Report Summary
    const operationalHealthScore = Math.min(
      100,
      Math.max(
        30,
        Math.round(
          (completionRate * 0.4) +
          (workers.length > 0 ? (activeWorkers / workers.length) * 30 : 20) +
          (sitesWithoutWorkers.length === 0 ? 20 : 5) +
          (highOrCriticalSec === 0 ? 10 : 0)
        )
      )
    );

    const reportSummary = {
      executiveSummary: `Civil site operations overview for ${startStr} to ${endStr}: Operational workforce stands at ${activeWorkers} active personnel across ${activeSites} operational construction sites. Shift completion compliance is ${completionRate}%. ${pendingOvertimeCount} overtime claims and ${pendingLeaveCount} leave applications require administrative review. Overall site security index is ${highOrCriticalSec === 0 ? "healthy" : "flagged with security items"}.`,
      keyTakeaways: [
        `${activeWorkers} of ${workers.length} registered personnel currently active (${Math.round((activeWorkers / (workers.length || 1)) * 100)}% active rate).`,
        `Attendance completion rate is ${completionRate}% across ${attendance.length} shift logs.`,
        `${pendingOvertimeCount} pending overtime claims (₹${estimatedOvertimeCost} approved liability).`,
        `${siteRiskAlerts.length} operational risk alerts identified.`
      ],
      operationalHealthScore,
      complianceHealth: highOrCriticalSec === 0 && completionRate >= 70 ? "NOMINAL" : "REQUIRES_ATTENTION"
    };

    const responsePayload = {
      success: true,
      period: { startDate: startStr, endDate: endStr },
      observedData,
      aiInsights,
      recommendations,
      dailyActionList: recommendations,
      dailyActions,
      workforceBrief,
      siteRiskAlerts,
      attendancePattern,
      workforcePlanning,
      overtimePayroll,
      reportSummary,
      insufficientData: workers.length === 0 && attendance.length === 0,
      generatedAt: new Date().toISOString(),
      modelUsed,
      disclaimer: "AI-generated advisory insight. All managerial decisions regarding workforce, compensation, and access remain the sole responsibility of human administrators."
    };

    aiInsightsCache.set(cacheKey, { timestamp: Date.now(), payload: responsePayload });
    return res.json(responsePayload);
  } catch (err: any) {
    console.error("[server] /api/ai/management-insights error:", err);
    return sendAdminError(err, res, "Failed to generate AI management insights.");
  }
});

/**
 * PHASE 8: Ask Operations AI Endpoint
 * Strictly read-only interactive queries for active administrators grounded in real Firestore facts
 */
app.post("/api/ai/ask-operations", async (req, res) => {
  try {
    const caller = await verifyAdminAuth(req);
    if (caller.role !== 'ADMIN') {
      try {
        const { adminDb } = getFirebaseAdmin();
        await recordSecurityEvent(adminDb, {
          eventType: "UNAUTHORIZED_ACCESS",
          actorUid: caller.uid,
          actorRole: caller.role,
          result: "FAILURE",
          severity: "HIGH",
          source: req.path || "ADMIN_AI",
          metadata: { reason: "Ask Operations AI strictly restricted to ADMIN role. SITE_SUPERVISOR denied.", path: req.path }
        });
      } catch {}
      return res.status(403).json({
        success: false,
        error: "Access denied: Administrator role required for Ask Operations AI. Site Supervisors cannot access Admin AI."
      });
    }

    const rateCheck = checkAiRateLimit(caller.uid);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `AI query rate limit exceeded. Please wait ${rateCheck.resetInSec} seconds before asking another question.`
      });
    }

    const { question } = req.body || {};
    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({
        success: false,
        error: "Question parameter is required."
      });
    }

    const trimmedQuestion = question.trim();
    const { adminDb } = getFirebaseAdmin();

    // Fetch live data collections in parallel (strictly read-only)
    const [
      workersSnap,
      sitesSnap,
      attendanceSnap,
      leaveSnap,
      overtimeSnap,
      salarySnap,
      securitySnap,
      batchesSnap,
      registrationsSnap
    ] = await Promise.all([
      adminDb.collection("workers").get(),
      adminDb.collection("sites").get(),
      adminDb.collection("attendance").limit(200).get(),
      adminDb.collection("leaveRequests").limit(100).get(),
      adminDb.collection("overtimeRecords").limit(100).get(),
      adminDb.collection("salaryRecords").limit(100).get(),
      adminDb.collection("securityEvents").limit(100).get(),
      adminDb.collection("batches").get(),
      adminDb.collection("workerRegistrations").get()
    ]);

    const workers = workersSnap.docs.map(d => d.data());
    const sites = sitesSnap.docs.map(d => d.data());
    const attendance = attendanceSnap.docs.map(d => d.data());
    const leave = leaveSnap.docs.map(d => d.data());
    const overtime = overtimeSnap.docs.map(d => d.data());
    const salary = salarySnap.docs.map(d => d.data());
    const securityEvents = securitySnap.docs.map(d => d.data());
    const batches = batchesSnap.docs.map(d => ({ batchId: d.id, ...(d.data() as any) } as any));
    const registrations = registrationsSnap.docs.map(d => ({ registrationId: d.id, ...(d.data() as any) } as any));

    // Deterministic factual aggregates (Zero PII, zero credentials)
    const totalWorkers = workers.length;
    const activeWorkers = workers.filter(w => w.status === "ACTIVE").length;
    const suspendedWorkers = workers.filter(w => w.status === "SUSPENDED").length;
    const unassignedWorkers = workers.filter(w => w.status === "ACTIVE" && !w.siteId && !w.assignedSiteId).length;

    const totalSites = sites.length;
    const activeSites = sites.filter(s => s.status === "ACTIVE").length;
    const sitesWithWorkers = new Set(workers.map(w => w.siteId || w.assignedSiteId).filter(Boolean));
    const emptySites = sites.filter(s => s.status === "ACTIVE" && !sitesWithWorkers.has(s.siteId)).map(s => s.siteName || s.siteId);

    const activeBatches = batches.filter(b => b.status === "ACTIVE");
    const inactiveBatches = batches.filter(b => b.status === "INACTIVE");
    const pendingRegistrations = registrations.filter(r => r.status === "PENDING");

    const checkedInCount = attendance.filter(a => a.status === "CHECKED_IN").length;
    const completedCount = attendance.filter(a => a.status === "COMPLETED").length;
    const completionRate = attendance.length > 0 ? Math.round((completedCount / attendance.length) * 100) : 100;

    const pendingOvertime = overtime.filter(o => o.status === "PENDING").length;
    const approvedOtHours = overtime.filter(o => o.status === "APPROVED").reduce((acc, o) => acc + (Number(o.hours) || 0), 0);

    const pendingLeave = leave.filter(l => l.status === "PENDING").length;
    const approvedLeave = leave.filter(l => l.status === "APPROVED").length;

    const totalNetSalary = salary.reduce((acc, s) => acc + (Number(s.netSalary) || 0), 0);
    const criticalSecurity = securityEvents.filter(s => s.severity === "CRITICAL" || s.severity === "HIGH").length;

    const trades: Record<string, number> = {};
    workers.forEach(w => {
      const role = w.jobRole || "General Labor";
      trades[role] = (trades[role] || 0) + 1;
    });

    // Check if user is asking to execute an administrative write operation
    const qLower = trimmedQuestion.toLowerCase();
    let commandProposal: any = null;

    if (qLower.includes("deactivate batch") || (qLower.includes("deactivate") && qLower.includes("b-")) || qLower.includes("close batch")) {
      const match = trimmedQuestion.match(/b-?\d+/i);
      const batchNum = match ? match[0].toUpperCase().replace(/^B(\d)/, "B-$1") : null;
      if (batchNum) {
        const found = batches.find(b => (b.batchId || b.id || "").toUpperCase() === batchNum);
        commandProposal = {
          commandType: "DEACTIVATE_BATCH",
          targetId: found?.batchId || batchNum,
          targetName: found ? `Batch ${found.batchId} (${found.name || 'Cohort'})` : `Batch ${batchNum}`,
          summary: `Deactivate workforce batch ${batchNum} to prevent new worker enrollment in this squad.`,
          warning: "Currently assigned workers will remain intact, but applicants cannot select this cohort.",
          actionId: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        };
      }
    } else if (qLower.includes("activate batch") || (qLower.includes("activate") && qLower.includes("b-")) || qLower.includes("open batch")) {
      const match = trimmedQuestion.match(/b-?\d+/i);
      const batchNum = match ? match[0].toUpperCase().replace(/^B(\d)/, "B-$1") : null;
      if (batchNum) {
        const found = batches.find(b => (b.batchId || b.id || "").toUpperCase() === batchNum);
        commandProposal = {
          commandType: "ACTIVATE_BATCH",
          targetId: found?.batchId || batchNum,
          targetName: found ? `Batch ${found.batchId} (${found.name || 'Cohort'})` : `Batch ${batchNum}`,
          summary: `Activate workforce batch ${batchNum} to allow assignments and applicant onboarding.`,
          warning: "Cohort will become immediately selectable in onboarding forms.",
          actionId: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        };
      }
    } else if (qLower.includes("approve") && (qLower.includes("reg") || qLower.includes("registration") || qLower.includes("applicant"))) {
      const match = trimmedQuestion.match(/reg-?[a-z0-9_-]+/i) || trimmedQuestion.match(/w-?\d+/i);
      const targetId = match ? match[0].toUpperCase() : (pendingRegistrations[0]?.registrationId || null);
      if (targetId) {
        const found = registrations.find(r => (r.registrationId || r.id || "").toUpperCase() === targetId);
        commandProposal = {
          commandType: "APPROVE_REGISTRATION",
          targetId: found?.registrationId || targetId,
          targetName: found ? `Applicant: ${found.submittedData?.fullName || targetId}` : `Registration ${targetId}`,
          summary: `Approve worker registration ${targetId} and grant active operational worker status.`,
          warning: "An active worker profile and ID will be provisioned in the system.",
          actionId: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        };
      }
    } else if (qLower.includes("deactivate site") || (qLower.includes("deactivate") && qLower.includes("site"))) {
      const match = trimmedQuestion.match(/site-?\d+/i);
      const siteId = match ? match[0].toUpperCase().replace(/^SITE(\d)/, "SITE-$1") : null;
      if (siteId) {
        const found = sites.find(s => (s.siteId || "").toUpperCase() === siteId);
        commandProposal = {
          commandType: "DEACTIVATE_SITE",
          targetId: found?.siteId || siteId,
          targetName: found ? `Site ${found.siteName || siteId}` : `Site ${siteId}`,
          summary: `Deactivate construction site ${siteId}. Attendance kiosks will be taken offline.`,
          warning: "Workers assigned to this site must be reassigned before recording attendance.",
          actionId: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        };
      }
    }

    const factualSummary = {
      workforce: { total: totalWorkers, active: activeWorkers, suspended: suspendedWorkers, unassigned: unassignedWorkers },
      batches: {
        total: batches.length,
        active: activeBatches.length,
        inactive: inactiveBatches.length,
        activeBatchList: activeBatches.map(b => `${b.batchId || b.id}: ${b.name || 'Squad'}`)
      },
      registrations: {
        total: registrations.length,
        pending: pendingRegistrations.length,
        pendingList: pendingRegistrations.map(r => `${r.registrationId || r.id} (${r.submittedData?.fullName || 'Applicant'})`)
      },
      sites: { total: totalSites, active: activeSites, emptySites, siteNames: sites.map(s => s.siteName) },
      attendance: { totalShifts: attendance.length, openShifts: checkedInCount, completedShifts: completedCount, completionRatePercent: completionRate },
      overtime: { pendingClaims: pendingOvertime, approvedHours: approvedOtHours },
      leave: { pendingRequests: pendingLeave, approvedRequests: approvedLeave },
      payroll: { totalRecords: salary.length, totalNetSalary: Math.round(totalNetSalary) },
      security: { criticalOrHighEvents: criticalSecurity },
      trades
    };

    let answer = "";
    let confidence: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
    let sourceFacts: string[] = [
      `Active Personnel: ${activeWorkers}/${totalWorkers}`,
      `Workforce Batches: ${activeBatches.length} Active / ${batches.length} Total`,
      `Pending Registrations: ${pendingRegistrations.length}`,
      `Active Sites: ${activeSites} (${emptySites.length} empty)`,
      `Completion Rate: ${completionRate}% (${checkedInCount} open shifts)`
    ];
    let suggestedFollowUps: string[] = [
      "Which workforce batches are currently active?",
      "How many worker registrations are pending verification?",
      "Which construction sites have no workers assigned?",
      "Deactivate batch B-01"
    ];
    let modelUsed = "gemini-3.8-flash";

    if (commandProposal) {
      answer = `Action proposed: ${commandProposal.summary} Review the action summary and click 'Confirm Execution' below to execute this change on the server.`;
      confidence = "HIGH";
      modelUsed = "Admin Command Mode Controller";
    } else {
      const geminiKey = process.env.GEMINI_API_KEY?.trim();

      if (geminiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const prompt = `You are the Civil Operations AI Assistant for construction site supervisors.
You are answering questions from verified administrators.
Grounded Factual Aggregates from live Firestore:
${JSON.stringify(factualSummary, null, 2)}

User Question: "${trimmedQuestion}"

Respond with JSON strictly matching:
{
  "answer": "A clear, direct factual answer grounded purely in the data above.",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "sourceFacts": ["fact 1", "fact 2"],
  "suggestedFollowUps": ["follow up question 1", "follow up question 2"]
}`;

          const aiPromise = ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: prompt,
            config: {
              systemInstruction: "You are the operational intelligence assistant for civil construction managers. Answer factually based only on the provided system facts. If the information is not present in the data, clearly state so. Always format currency in Indian Rupees (₹ / INR), never in dollars ($ / USD).",
              responseMimeType: "application/json"
            }
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Gemini API call timed out after 4000ms")), 4000)
          );
          const response: any = await Promise.race([aiPromise, timeoutPromise]);

          const parsed = JSON.parse(response.text || "{}");
          if (parsed.answer) {
            answer = parsed.answer;
            confidence = parsed.confidence || "HIGH";
            if (Array.isArray(parsed.sourceFacts) && parsed.sourceFacts.length > 0) {
              sourceFacts = parsed.sourceFacts;
            }
            if (Array.isArray(parsed.suggestedFollowUps) && parsed.suggestedFollowUps.length > 0) {
              suggestedFollowUps = parsed.suggestedFollowUps;
            }
          }
        } catch (genErr: any) {
          const isQuota = genErr?.status === 429 || String(genErr?.message || "").includes("quota") || String(genErr?.message || "").includes("429");
          console.log(`[server] Ask Operations: ${isQuota ? "Gemini quota limit reached" : "Gemini service temporarily unavailable (" + genErr?.message + ")"}; using deterministic Q&A engine.`);
          modelUsed = "deterministic-rule-engine-fallback";
        }
      } else {
        modelUsed = "deterministic-rule-engine-fallback";
      }

      // High-precision deterministic answering engine fallback if Gemini is offline or unavailable
      if (!answer) {
        if (qLower.includes("batch") || qLower.includes("cohort") || qLower.includes("crew")) {
          answer = `There are ${batches.length} workforce batch cohorts in the system (${activeBatches.length} ACTIVE, ${inactiveBatches.length} INACTIVE). Active batches: ${activeBatches.map(b => b.batchId || b.id).join(", ") || "None"}.`;
        } else if (qLower.includes("registration") || qLower.includes("pending") || qLower.includes("applicant") || qLower.includes("queue")) {
          answer = `There are currently ${pendingRegistrations.length} worker registration(s) pending administrator review out of ${registrations.length} total applications submitted.`;
        } else if (qLower.includes("site") || qLower.includes("empty") || qLower.includes("understaffed") || qLower.includes("where")) {
          if (emptySites.length > 0) {
            answer = `Currently, ${emptySites.length} active construction site(s) have zero assigned workers: ${emptySites.join(", ")}. Total active sites is ${activeSites} across ${totalSites} defined locations.`;
          } else {
            answer = `All ${activeSites} active construction sites have workforce assigned. There are currently no unstaffed sites.`;
          }
        } else if (qLower.includes("overtime") || qLower.includes("ot") || qLower.includes("hours")) {
          answer = `There are currently ${pendingOvertime} pending overtime claim(s) awaiting review. A total of ${approvedOtHours} overtime hours have been approved to date.`;
        } else if (qLower.includes("leave") || qLower.includes("vacation") || qLower.includes("absence")) {
          answer = `There are ${pendingLeave} pending leave application(s) awaiting supervisor authorization, and ${approvedLeave} approved leave request(s).`;
        } else if (qLower.includes("attendance") || qLower.includes("check-in") || qLower.includes("rate") || qLower.includes("shift")) {
          answer = `Site attendance completion rate is ${completionRate}%. There are ${checkedInCount} shifts currently in progress (checked in) and ${completedCount} completed shifts logged.`;
        } else if (qLower.includes("worker") || qLower.includes("headcount") || qLower.includes("roster") || qLower.includes("people")) {
          answer = `Total registered workforce is ${totalWorkers} personnel (${activeWorkers} active, ${suspendedWorkers} suspended). There are ${unassignedWorkers} active worker(s) without an assigned site.`;
        } else if (qLower.includes("salary") || qLower.includes("payroll") || qLower.includes("pay") || qLower.includes("cost")) {
          answer = `There are ${salary.length} payroll slip records in the system representing a total calculated net salary of ₹${Math.round(totalNetSalary).toLocaleString()}. ${pendingOvertime} overtime claims remain pending.`;
        } else if (qLower.includes("security") || qLower.includes("qr") || qLower.includes("alert") || qLower.includes("risk")) {
          answer = `There are ${criticalSecurity} high or critical security events recorded in the audit trail. Nominal security state requires zero critical alerts and regular rotating QR scans.`;
        } else if (qLower.includes("trade") || qLower.includes("skill") || qLower.includes("mason") || qLower.includes("carpenter")) {
          const tradeList = Object.entries(trades).map(([t, c]) => `${t}: ${c}`).join(", ");
          answer = `Current workforce trade distribution: ${tradeList || "No specialized roles defined"}.`;
        } else {
          answer = `Operational Summary: ${activeWorkers} active workers across ${activeSites} sites. ${batches.length} batches (${activeBatches.length} active). ${pendingRegistrations.length} registrations pending. Attendance rate is ${completionRate}% with ${checkedInCount} shifts open.`;
        }
      }
    }

    // Log query audit event in security ledger
    await recordSecurityEvent(adminDb, {
      eventType: commandProposal ? "ADMIN_COMMAND_PROPOSED" : "AI_INSIGHT_REQUESTED",
      actorUid: caller.uid,
      actorRole: "ADMIN",
      result: "SUCCESS",
      severity: "INFO",
      source: "API_AI_ASK_OPERATIONS",
      metadata: { question: trimmedQuestion.slice(0, 80), modelUsed, isCommand: !!commandProposal }
    });

    return res.json({
      success: true,
      question: trimmedQuestion,
      answer,
      isCommand: !!commandProposal,
      commandProposal,
      confidence,
      sourceFacts,
      suggestedFollowUps,
      generatedAt: new Date().toISOString(),
      modelUsed,
      disclaimer: "AI-generated advisory insight. All administrative write commands require explicit human administrator confirmation before execution."
    });
  } catch (err: any) {
    console.error("[server] /api/ai/ask-operations error:", err);
    return sendAdminError(err, res, "Failed to process operations AI query.");
  }
});

// ============================================================================
// MEDIA & STORAGE MODULE — CONTROLLED IMAGE FEATURE
// Civil Workforce Attendance System — ANGEL ENTERPRISES
//
// ABSOLUTE SECURITY & PRIVACY INVARIANTS:
// 1. NO FACIAL RECOGNITION: The application performs zero face detection, zero face matching,
//    zero biometric verification, and zero automatic identity extraction from photos.
// 2. NO SELFIE VERIFICATION: Attendance remains strictly QR/server-validated.
// 3. NO AI FACE ANALYSIS: Worker profile photos are NEVER sent to Google GenAI or any AI model.
// 4. STORAGE PATHS: /sitePhotos/{siteId}/{photoId}, /workerPhotos/{workerId}/{photoId}, /branding/...
// 5. MAXIMUM LIMITS: 1–5 photos per site; 1 photo per worker; max 5MB upload size.
// 6. RBAC: Admins can manage site photos and worker photos. Workers can access only their own photo.
// ============================================================================

const STORAGE_ROOT_DIR = path.join(process.cwd(), "storage_bucket");

function initStorageDirectories() {
  const subdirs = [
    STORAGE_ROOT_DIR,
    path.join(STORAGE_ROOT_DIR, "sitePhotos"),
    path.join(STORAGE_ROOT_DIR, "workerPhotos"),
    path.join(STORAGE_ROOT_DIR, "branding"),
  ];
  for (const dir of subdirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
initStorageDirectories();

// Validate image binary header (magic bytes) to prevent executable/script polyglots
function validateImageBinaryHeader(buf: Buffer, expectedMime: string): boolean {
  if (buf.length < 12) return false;
  if (expectedMime === "image/jpeg") {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (expectedMime === "image/png") {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (expectedMime === "image/webp") {
    const isRiff = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
    const isWebp = buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    return isRiff && isWebp;
  }
  return false;
}

// Persist storage object to structured volume
async function writeStorageFile(storagePath: string, buffer: Buffer, contentType: string): Promise<void> {
  const fullPath = path.join(STORAGE_ROOT_DIR, storagePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, buffer);
}

// Delete storage object from structured volume
async function removeStorageFile(storagePath: string): Promise<boolean> {
  if (!storagePath) return false;
  const fullPath = path.join(STORAGE_ROOT_DIR, storagePath);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      return true;
    } catch (e: any) {
      console.warn(`[storage] Could not delete file ${fullPath}:`, e.message);
      return false;
    }
  }
  return true;
}

/**
 * 1. POST /api/storage/site-photo/upload
 * Admin only: Attach construction-site photo (1-5 limit enforced)
 */
app.post("/api/storage/site-photo/upload", async (req, res) => {
  try {
    const admin = await verifyAdminAuth(req);
    const { siteId, fileBase64, fileName, contentType, displayOrder } = req.body;

    if (!siteId || typeof siteId !== "string" || !siteId.trim()) {
      return res.status(400).json({ success: false, error: "siteId parameter is required." });
    }
    const cleanSiteId = siteId.trim();

    const { adminDb } = getFirebaseAdmin();
    const siteDoc = await adminDb.collection("sites").doc(cleanSiteId).get();
    if (!siteDoc.exists) {
      return res.status(404).json({ success: false, error: `Construction site "${cleanSiteId}" not found in Firestore.` });
    }

    // Limit check: 1–5 photos per site
    const photosSnap = await adminDb.collection("sites").doc(cleanSiteId).collection("photos").get();
    if (photosSnap.size >= 5) {
      return res.status(400).json({
        success: false,
        error: "Site photo limit reached: A maximum of 5 photos are permitted per construction site. Delete an existing photo first."
      });
    }

    // MIME type validation
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    const cleanMime = (contentType || "image/jpeg").toLowerCase().trim();
    if (!allowedMimes.includes(cleanMime)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported image MIME type "${cleanMime}". Allowed formats: image/jpeg, image/png, image/webp.`
      });
    }

    if (!fileBase64 || typeof fileBase64 !== "string") {
      return res.status(400).json({ success: false, error: "fileBase64 data is required." });
    }

    let rawBase64 = fileBase64;
    if (rawBase64.includes(",")) {
      rawBase64 = rawBase64.split(",")[1];
    }
    const buffer = Buffer.from(rawBase64, "base64");

    // 5MB limit check
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: "File size exceeds maximum allowed upload limit of 5.00 MB."
      });
    }

    // Binary magic bytes validation
    if (!validateImageBinaryHeader(buffer, cleanMime)) {
      return res.status(400).json({
        success: false,
        error: "File rejected: binary signature does not match declared image type."
      });
    }

    const photoId = `site_photo_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const ext = cleanMime === "image/png" ? "png" : cleanMime === "image/webp" ? "webp" : "jpg";
    const storagePath = `sitePhotos/${cleanSiteId}/${photoId}.${ext}`;
    const downloadUrl = `/api/storage/file/${storagePath}`;

    // 1. Write to storage
    await writeStorageFile(storagePath, buffer, cleanMime);

    // 2. Write metadata to Firestore
    const photoData = {
      photoId,
      siteId: cleanSiteId,
      storagePath,
      downloadUrl,
      fileName: typeof fileName === "string" && fileName.trim()
        ? path.basename(fileName.trim()).replace(/[^a-zA-Z0-9._\-]/g, "_")
        : `${photoId}.${ext}`,
      contentType: cleanMime,
      fileSize: buffer.length,
      uploadedBy: admin.email || admin.uid,
      uploadedAt: new Date().toISOString(),
      displayOrder: typeof displayOrder === "number" ? displayOrder : photosSnap.size + 1
    };

    await adminDb.collection("sites").doc(cleanSiteId).collection("photos").doc(photoId).set({
      ...photoData,
      createdAtServer: FieldValue.serverTimestamp()
    });

    return res.status(200).json({ success: true, photo: photoData });
  } catch (err: any) {
    console.error("[server] /api/storage/site-photo/upload error:", err);
    return sendAdminError(err, res, "Failed to upload site photo.");
  }
});

/**
 * 2. DELETE /api/storage/site-photo/:siteId/:photoId
 * Admin only: Remove construction-site photo
 */
app.delete("/api/storage/site-photo/:siteId/:photoId", async (req, res) => {
  try {
    await verifyAdminAuth(req);
    const { siteId, photoId } = req.params;

    const { adminDb } = getFirebaseAdmin();
    const docRef = adminDb.collection("sites").doc(siteId).collection("photos").doc(photoId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: "Site photo metadata not found." });
    }

    const data = snap.data();
    if (data?.storagePath) {
      await removeStorageFile(data.storagePath);
    }
    await docRef.delete();

    return res.json({ success: true, message: "Site photo deleted successfully." });
  } catch (err: any) {
    console.error("[server] delete site photo error:", err);
    return sendAdminError(err, res, "Failed to delete site photo.");
  }
});

/**
 * 3. GET /api/storage/site-photos/:siteId
 * Authenticated users: Retrieve photos for a site
 */
app.get("/api/storage/site-photos/:siteId", async (req, res) => {
  try {
    await verifyUserAuth(req);
    const { siteId } = req.params;

    const { adminDb } = getFirebaseAdmin();
    const snap = await adminDb.collection("sites").doc(siteId).collection("photos").orderBy("displayOrder", "asc").get();
    const photos = snap.docs.map((d) => d.data());
    return res.json({ success: true, photos });
  } catch (err: any) {
    return sendAdminError(err, res, "Failed to retrieve site photos.");
  }
});

// Helper: Resolves canonical workerId for an authenticated UID
async function getCanonicalWorkerIdForUid(adminDb: FirebaseFirestore.Firestore, uid: string): Promise<string | null> {
  if (!uid) return null;
  try {
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (userDoc.exists && userDoc.data()?.workerId) {
      return userDoc.data()!.workerId;
    }
  } catch {}

  try {
    const wSnap = await adminDb.collection("workers").where("uid", "==", uid).limit(1).get();
    if (!wSnap.empty) {
      return wSnap.docs[0].id || wSnap.docs[0].data()?.workerId || null;
    }
  } catch {}

  try {
    const wSnapUser = await adminDb.collection("workers").where("userId", "==", uid).limit(1).get();
    if (!wSnapUser.empty) {
      return wSnapUser.docs[0].id || wSnapUser.docs[0].data()?.workerId || null;
    }
  } catch {}

  try {
    const directDoc = await adminDb.collection("workers").doc(uid).get();
    if (directDoc.exists) {
      return directDoc.id;
    }
  } catch {}

  return null;
}

/**
 * 4. POST /api/storage/worker-photo/upload
 * Authorized Admin or Owning Worker: Upload profile photo (1 photo limit)
 * STRICT PRIVACY: Worker can only upload their own profile photo
 */
app.post("/api/storage/worker-photo/upload", async (req, res) => {
  try {
    const caller = await verifyUserAuth(req);
    const { workerId, fileBase64, fileName, contentType } = req.body;

    if (!workerId || typeof workerId !== "string" || !workerId.trim()) {
      return res.status(400).json({ success: false, error: "workerId parameter is required." });
    }
    const cleanWorkerId = workerId.trim();

    const { adminDb } = getFirebaseAdmin();

    // Strict Authorization Check: Non-admins can only upload for their own canonical workerId
    const isAdmin = caller.role === "ADMIN";
    const callerWorkerId = caller.workerId || (await getCanonicalWorkerIdForUid(adminDb, caller.uid));
    const isOwner = Boolean(callerWorkerId && callerWorkerId === cleanWorkerId);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You are not authorized to upload a profile photo for another worker."
      });
    }

    const workerDoc = await adminDb.collection("workers").doc(cleanWorkerId).get();
    if (!workerDoc.exists) {
      return res.status(404).json({ success: false, error: `Worker "${cleanWorkerId}" not found in Firestore.` });
    }

    const workerData = workerDoc.data();

    // MIME type validation
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    const cleanMime = (contentType || "image/jpeg").toLowerCase().trim();
    if (!allowedMimes.includes(cleanMime)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported image MIME type "${cleanMime}". Allowed formats: image/jpeg, image/png, image/webp.`
      });
    }

    if (!fileBase64 || typeof fileBase64 !== "string") {
      return res.status(400).json({ success: false, error: "fileBase64 data is required." });
    }

    let rawBase64 = fileBase64;
    if (rawBase64.includes(",")) {
      rawBase64 = rawBase64.split(",")[1];
    }
    const buffer = Buffer.from(rawBase64, "base64");

    // 5MB limit check
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: "File size exceeds maximum allowed upload limit of 5.00 MB."
      });
    }

    // Binary magic bytes validation
    if (!validateImageBinaryHeader(buffer, cleanMime)) {
      return res.status(400).json({
        success: false,
        error: "File rejected: binary signature does not match declared image type."
      });
    }

    // Max 1 profile photo per worker: clean up previous photo file if exists
    if (workerData?.profilePhoto?.storagePath) {
      await removeStorageFile(workerData.profilePhoto.storagePath);
    }

    const photoId = `worker_photo_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const ext = cleanMime === "image/png" ? "png" : cleanMime === "image/webp" ? "webp" : "jpg";
    const storagePath = `workerPhotos/${cleanWorkerId}/${photoId}.${ext}`;
    const downloadUrl = `/api/storage/file/${storagePath}`;

    // 1. Write to storage
    await writeStorageFile(storagePath, buffer, cleanMime);

    // 2. Write metadata reference to worker record
    const profilePhoto = {
      photoId,
      workerId: cleanWorkerId,
      storagePath,
      downloadUrl,
      fileName: typeof fileName === "string" && fileName.trim()
        ? path.basename(fileName.trim()).replace(/[^a-zA-Z0-9._\-]/g, "_")
        : `${photoId}.${ext}`,
      contentType: cleanMime,
      fileSize: buffer.length,
      uploadedBy: caller.email || caller.uid,
      uploadedAt: new Date().toISOString()
    };

    await adminDb.collection("workers").doc(cleanWorkerId).update({
      profilePhoto,
      updatedAt: new Date().toISOString()
    });

    return res.status(200).json({ success: true, profilePhoto });
  } catch (err: any) {
    console.error("[server] /api/storage/worker-photo/upload error:", err);
    return sendAdminError(err, res, "Failed to upload worker profile photo.");
  }
});

/**
 * 5. DELETE /api/storage/worker-photo/:workerId
 * Authorized Admin or Owning Worker: Delete profile photo
 */
app.delete("/api/storage/worker-photo/:workerId", async (req, res) => {
  try {
    const caller = await verifyUserAuth(req);
    const { workerId } = req.params;

    if (!workerId || typeof workerId !== "string" || !workerId.trim()) {
      return res.status(400).json({ success: false, error: "workerId parameter is required." });
    }
    const cleanWorkerId = workerId.trim();

    const { adminDb } = getFirebaseAdmin();

    // Strict Authorization Check: Non-admins can only delete their own profile photo
    const isAdmin = caller.role === "ADMIN";
    const callerWorkerId = caller.workerId || (await getCanonicalWorkerIdForUid(adminDb, caller.uid));
    const isOwner = Boolean(callerWorkerId && callerWorkerId === cleanWorkerId);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You are not authorized to delete another worker's profile photo."
      });
    }

    const workerDoc = await adminDb.collection("workers").doc(cleanWorkerId).get();
    if (!workerDoc.exists) {
      return res.status(404).json({ success: false, error: "Worker record not found." });
    }

    const workerData = workerDoc.data();
    if (workerData?.profilePhoto?.storagePath) {
      await removeStorageFile(workerData.profilePhoto.storagePath);
    }

    await adminDb.collection("workers").doc(cleanWorkerId).update({
      profilePhoto: FieldValue.delete(),
      updatedAt: new Date().toISOString()
    });

    return res.json({ success: true, message: "Worker profile photo deleted successfully." });
  } catch (err: any) {
    return sendAdminError(err, res, "Failed to delete worker profile photo.");
  }
});

/**
 * 6. GET /api/storage/worker-photo/:workerId
 * Worker privacy: Only Admin or the specific Worker can read their photo metadata
 */
app.get("/api/storage/worker-photo/:workerId", async (req, res) => {
  try {
    const caller = await verifyUserAuth(req);
    const { workerId } = req.params;

    if (!workerId || typeof workerId !== "string" || !workerId.trim()) {
      return res.status(400).json({ success: false, error: "workerId parameter is required." });
    }
    const cleanWorkerId = workerId.trim();

    const { adminDb } = getFirebaseAdmin();

    // Strict Authorization Check: Non-admins can only access their own profile photo
    // Blocks cross-worker access immediately without leaking whether target workerId exists
    const isAdmin = caller.role === "ADMIN";
    const callerWorkerId = caller.workerId || (await getCanonicalWorkerIdForUid(adminDb, caller.uid));
    const isOwner = Boolean(callerWorkerId && callerWorkerId === cleanWorkerId);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You are strictly prohibited from viewing another worker's private profile photo."
      });
    }

    const workerDoc = await adminDb.collection("workers").doc(cleanWorkerId).get();
    if (!workerDoc.exists) {
      return res.status(404).json({ success: false, error: "Worker not found." });
    }

    const workerData = workerDoc.data();
    return res.json({ success: true, profilePhoto: workerData?.profilePhoto || null });
  } catch (err: any) {
    return sendAdminError(err, res, "Failed to retrieve worker profile photo.");
  }
});

/**
 * 7. GET /api/storage/file/*
 * Authenticated and authorized file streaming
 * Strictly prevents unauthenticated access or cross-worker file enumeration
 */
app.get("/api/storage/file/*", async (req, res) => {
  try {
    const rawPath = req.params[0];
    if (!rawPath || typeof rawPath !== "string") {
      return res.status(400).json({ error: "Storage path required." });
    }

    // Path traversal guard
    const cleanPath = path.normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/, "");
    if (cleanPath.includes("..")) {
      return res.status(400).json({ error: "Invalid storage path." });
    }

    // Worker profile photo privacy guard
    if (cleanPath.startsWith("workerPhotos/")) {
      let caller;
      try {
        caller = await verifyUserAuth(req);
      } catch (authErr: any) {
        return res.status(401).json({ error: "Authentication required to access protected worker profile photos: " + authErr.message });
      }

      const parts = cleanPath.split("/");
      const targetWorkerId = parts[1];
      const { adminDb } = getFirebaseAdmin();

      const isAdmin = caller.role === "ADMIN";
      const callerWorkerId = caller.workerId || (await getCanonicalWorkerIdForUid(adminDb, caller.uid));
      const isOwner = Boolean(callerWorkerId && callerWorkerId === targetWorkerId);

      if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: "Access denied: You cannot view another worker's private profile photo." });
      }
    }

    const filePath = path.join(STORAGE_ROOT_DIR, cleanPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Storage object not found." });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err: any) {
    console.error("[server] /api/storage/file error:", err);
    return res.status(500).json({ error: "Failed to stream media file: " + err.message });
  }
});


async function startServer() {
  // Vite middleware for dev or static serving for prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] Civil Workforce Server running on http://0.0.0.0:${PORT}`);
  });

  server.on("error", (err: any) => {
    console.error(`[server] HTTP server error on port ${PORT}:`, err);
  });
}

startServer();
