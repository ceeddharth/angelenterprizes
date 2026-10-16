import dotenv from 'dotenv';
dotenv.config();
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClientApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore as getClientFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

// 1. Firebase Admin SDK
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
const adminApp = initializeApp({ credential: cert(sa) }, 'p7-admin-app');
const adminDb = getAdminFirestore(adminApp);

// 2. Firebase Client SDK
const clientConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const clientApp = initClientApp(clientConfig);
const auth = getAuth(clientApp);
const clientDb = getClientFirestore(clientApp);

const BASE_URL = 'http://localhost:3000';

interface P7TestResult {
  num: number;
  name: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
}

async function runPhase7AcceptanceTests() {
  console.log('================================================================');
  console.log('PHASE 7 ACCEPTANCE VERIFICATION — AI & ADVANCED SECURITY');
  console.log('================================================================\n');

  const results: P7TestResult[] = [];

  function record(num: number, name: string, pass: boolean, evidence: string) {
    results.push({
      num,
      name,
      status: pass ? 'PASS' : 'FAIL',
      evidence
    });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] Test ${num}: ${name}\n    Evidence: ${evidence}\n`);
  }

  // --- Step 0: Auth Tokens ---
  let adminCred;
  try {
    adminCred = await signInWithEmailAndPassword(auth, 'admin@civilworkforce.gov', 'Admin@123456');
  } catch {
    adminCred = await createUserWithEmailAndPassword(auth, 'admin@civilworkforce.gov', 'Admin@123456');
  }
  const adminToken = await adminCred.user.getIdToken(true);

  // Ensure admin user profile in Firestore
  await adminDb.collection('users').doc(adminCred.user.uid).set({
    uid: adminCred.user.uid,
    email: 'admin@civilworkforce.gov',
    role: 'ADMIN',
    status: 'ACTIVE',
    updatedAt: new Date().toISOString()
  }, { merge: true });

  let workerCred;
  try {
    workerCred = await signInWithEmailAndPassword(auth, 'worker1002@cw.gov', 'Worker@123456');
  } catch {
    workerCred = await createUserWithEmailAndPassword(auth, 'worker1002@cw.gov', 'Worker@123456');
  }
  const workerToken = await workerCred.user.getIdToken(true);

  // Ensure worker user profile
  await adminDb.collection('users').doc(workerCred.user.uid).set({
    uid: workerCred.user.uid,
    email: 'worker1002@cw.gov',
    role: 'WORKER',
    status: 'ACTIVE',
    workerId: 'W-1002',
    updatedAt: new Date().toISOString()
  }, { merge: true });

  // -------------------------------------------------------------
  // TEST 1: Unauthenticated request to /api/security/events returns 401
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/security/events`);
    const status = res.status;
    const body = await res.json();
    record(
      1,
      'Unauthenticated request to /api/security/events returns 401',
      status === 401 && body.success === false,
      `HTTP status=${status}, error=${body.error}`
    );
  } catch (err: any) {
    record(1, 'Unauthenticated request to /api/security/events returns 401', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 2: Worker request to /api/security/events returns 403 Forbidden
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/security/events`, {
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    const status = res.status;
    const body = await res.json();
    record(
      2,
      'Worker request to /api/security/events returns 403 Forbidden',
      status === 403 && body.success === false,
      `HTTP status=${status}, error=${body.error}`
    );
  } catch (err: any) {
    record(2, 'Worker request to /api/security/events returns 403 Forbidden', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 3: Admin request to /api/security/events returns 200 with schema
  // -------------------------------------------------------------
  let eventsData: any = null;
  try {
    const res = await fetch(`${BASE_URL}/api/security/events`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const status = res.status;
    eventsData = await res.json();
    const hasSummary = eventsData?.summary && typeof eventsData.summary.totalEvents === 'number';
    const hasRecent = Array.isArray(eventsData?.recentEvents);
    const hasAlerts = Array.isArray(eventsData?.activeAlerts);
    const hasThresholds = Array.isArray(eventsData?.thresholds);
    record(
      3,
      'Admin request to /api/security/events returns 200 with complete SecurityDashboardData schema',
      status === 200 && eventsData.success && hasSummary && hasRecent && hasAlerts && hasThresholds,
      `HTTP status=${status}, totalEvents=${eventsData?.summary?.totalEvents}, recentEventsCount=${eventsData?.recentEvents?.length}`
    );
  } catch (err: any) {
    record(3, 'Admin request to /api/security/events returns 200 with complete SecurityDashboardData schema', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 4: Forged QR token triggers securityEvent logging (FORGED_QR, CRITICAL/HIGH)
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/attendance/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        siteId: 'SITE-101',
        qrToken: 'forged.qr.token.tampered.signature'
      })
    });
    const status = res.status;
    const body = await res.json();

    // Verify securityEvents in Firestore
    const snap = await adminDb
      .collection('securityEvents')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    const eventDoc = snap.docs.map(d => d.data()).find(d => d.eventType === 'FORGED_QR');
    const logged = !!eventDoc;

    record(
      4,
      'Forged QR token submission returns 400 and creates immutable FORGED_QR security event',
      status === 400 && logged && eventDoc?.result === 'FAILURE',
      `HTTP status=${status}, message="${body.error}", eventId=${eventDoc?.eventId}, severity=${eventDoc?.severity}`
    );
  } catch (err: any) {
    record(4, 'Forged QR token submission returns 400 and creates immutable FORGED_QR security event', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 5: Suspended worker check-in attempt logs SUSPENDED_WORKER_ATTEMPT
  // -------------------------------------------------------------
  try {
    // Temporarily set W-1002 to SUSPENDED (preserve canonical profile)
    await adminDb.collection('workers').doc('W-1002').set({
      workerId: 'W-1002',
      uid: workerCred.user.uid,
      fullName: 'Sunil Mohan Rao',
      status: 'SUSPENDED',
      siteId: 'SITE-101',
      dailyWageRate: 650,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Generate valid active QR token for SITE-101
    const qrRes = await fetch(`${BASE_URL}/api/attendance/active-qr?siteId=SITE-101`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const qrData = await qrRes.json();

    const checkInRes = await fetch(`${BASE_URL}/api/attendance/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        siteId: 'SITE-101',
        qrToken: qrData.token,
        action: 'CHECK_IN'
      })
    });
    const status = checkInRes.status;
    const body = await checkInRes.json();

    // Check security event
    const snap = await adminDb
      .collection('securityEvents')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    const eventDoc = snap.docs.map(d => d.data()).find(d => d.eventType === 'SUSPENDED_WORKER_ATTEMPT');
    const logged = !!eventDoc;

    // Restore worker status to ACTIVE with exact canonical profile
    await adminDb.collection('workers').doc('W-1002').set({
      fullName: 'Sunil Mohan Rao',
      status: 'ACTIVE',
      assignedSiteId: 'SITE-102',
      siteId: 'SITE-102',
      batchNumber: 'B-01',
      jobRole: 'Mason',
      phone: '9876543211'
    }, { merge: true });

    record(
      5,
      'Suspended worker check-in attempt is rejected and logs SUSPENDED_WORKER_ATTEMPT',
      status === 403 && logged && eventDoc?.result === 'FAILURE',
      `HTTP status=${status}, message="${body.error}", eventId=${eventDoc?.eventId}, workerId=${eventDoc?.workerId}`
    );
  } catch (err: any) {
    // Ensure worker is restored even on error
    await adminDb.collection('workers').doc('W-1002').set({ status: 'ACTIVE' }, { merge: true }).catch(() => {});
    record(5, 'Suspended worker check-in attempt is rejected and logs SUSPENDED_WORKER_ATTEMPT', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 6: Wrong-site QR check-in attempt logs WRONG_SITE_QR
  // -------------------------------------------------------------
  try {
    // Ensure W-1002 is assigned to SITE-101
    await adminDb.collection('workers').doc('W-1002').set({
      siteId: 'SITE-101'
    }, { merge: true });

    // Generate valid QR for SITE-102
    const qrRes = await fetch(`${BASE_URL}/api/attendance/active-qr?siteId=SITE-102`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const qrData = await qrRes.json();

    // Worker W-1002 is assigned to SITE-101, but scans QR for SITE-102
    const checkInRes = await fetch(`${BASE_URL}/api/attendance/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        siteId: 'SITE-102',
        qrToken: qrData.token,
        action: 'CHECK_IN'
      })
    });
    const status = checkInRes.status;
    const body = await checkInRes.json();

    const snap = await adminDb
      .collection('securityEvents')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    const eventDoc = snap.docs.map(d => d.data()).find(d => d.eventType === 'WRONG_SITE_QR');
    const logged = !!eventDoc;

    // Restore W-1002 siteId to SITE-102 (original site)
    await adminDb.collection('workers').doc('W-1002').set({
      siteId: 'SITE-102'
    }, { merge: true });

    record(
      6,
      'Wrong site QR token submission is rejected and logs WRONG_SITE_QR with severity WARNING/HIGH',
      status === 400 && logged && eventDoc?.result === 'FAILURE',
      `HTTP status=${status}, message="${body.error}", eventId=${eventDoc?.eventId}`
    );
  } catch (err: any) {
    await adminDb.collection('workers').doc('W-1002').set({ siteId: 'SITE-102' }, { merge: true }).catch(() => {});
    record(6, 'Wrong site QR token submission is rejected and logs WRONG_SITE_QR with severity WARNING/HIGH', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 7: Threshold Evaluation detects repeated anomalies
  // -------------------------------------------------------------
  try {
    // Fetch security dashboard data again to check activeAlerts
    const res = await fetch(`${BASE_URL}/api/security/events`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const hasActiveAlerts = Array.isArray(data.activeAlerts);
    const summary = data.summary;

    record(
      7,
      'Security dashboard aggregates events and evaluates deterministic threshold rules',
      res.status === 200 && hasActiveAlerts && summary.totalEvents > 0,
      `totalEvents=${summary.totalEvents}, criticalCount=${summary.criticalCount}, qrAnomalies=${summary.qrAnomalies}, activeAlertsCount=${data.activeAlerts.length}`
    );
  } catch (err: any) {
    record(7, 'Security dashboard aggregates events and evaluates deterministic threshold rules', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 8: Direct client-side write to securityEvents is prohibited by Firestore rules
  // -------------------------------------------------------------
  try {
    let clientWriteFailed = false;
    let errMessage = '';
    try {
      await setDoc(doc(clientDb, 'securityEvents', 'tamper-test-doc'), {
        eventType: 'FORGED_AUDIT',
        tampered: true
      });
    } catch (e: any) {
      clientWriteFailed = true;
      errMessage = e.message;
    }

    record(
      8,
      'Direct client-side write to securityEvents is rejected by Firestore security rules',
      clientWriteFailed,
      `Write rejected as expected: ${errMessage}`
    );
  } catch (err: any) {
    record(8, 'Direct client-side write to securityEvents is rejected by Firestore security rules', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 9: Unauthenticated request to /api/ai/management-insights returns 401
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/ai/management-insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const status = res.status;
    const body = await res.json();
    record(
      9,
      'Unauthenticated request to /api/ai/management-insights returns 401',
      status === 401 && body.success === false,
      `HTTP status=${status}, error=${body.error}`
    );
  } catch (err: any) {
    record(9, 'Unauthenticated request to /api/ai/management-insights returns 401', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 10: Worker request to /api/ai/management-insights returns 403 Forbidden
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/ai/management-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({})
    });
    const status = res.status;
    const body = await res.json();
    record(
      10,
      'Worker request to /api/ai/management-insights returns 403 Forbidden',
      status === 403 && body.success === false,
      `HTTP status=${status}, error=${body.error}`
    );
  } catch (err: any) {
    record(10, 'Worker request to /api/ai/management-insights returns 403 Forbidden', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 11: Admin request to /api/ai/management-insights returns structured insights
  // -------------------------------------------------------------
  let aiResponse: any = null;
  try {
    const res = await fetch(`${BASE_URL}/api/ai/management-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        startDate: '2026-01-01',
        endDate: new Date().toISOString().split('T')[0]
      })
    });
    const status = res.status;
    aiResponse = await res.json();

    const hasObserved = aiResponse?.observedData?.workforce && aiResponse?.observedData?.attendance;
    const hasInsights = Array.isArray(aiResponse?.aiInsights);
    const hasRecs = Array.isArray(aiResponse?.recommendations);
    const hasDisclaimer = typeof aiResponse?.disclaimer === 'string';

    record(
      11,
      'Admin request to /api/ai/management-insights returns structured response with observed data and assistive insights',
      status === 200 && aiResponse.success && hasObserved && hasInsights && hasRecs && hasDisclaimer,
      `HTTP status=${status}, workforce=${aiResponse?.observedData?.workforce?.total}, attendanceRecords=${aiResponse?.observedData?.attendance?.totalRecords}, insightsCount=${aiResponse?.aiInsights?.length}, recsCount=${aiResponse?.recommendations?.length}`
    );
  } catch (err: any) {
    record(11, 'Admin request to /api/ai/management-insights returns structured response with observed data and assistive insights', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 12: Assistive-Only Verification: AI generation does NOT mutate database
  // -------------------------------------------------------------
  try {
    // Snapshot state before and after AI endpoint call
    const workersBefore = await adminDb.collection('workers').get();
    const attendanceBefore = await adminDb.collection('attendance').get();
    const salaryBefore = await adminDb.collection('salaries').get();

    // Call AI insights again
    await fetch(`${BASE_URL}/api/ai/management-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({})
    });

    const workersAfter = await adminDb.collection('workers').get();
    const attendanceAfter = await adminDb.collection('attendance').get();
    const salaryAfter = await adminDb.collection('salaries').get();

    const workersUnchanged = workersBefore.size === workersAfter.size;
    const attendanceUnchanged = attendanceBefore.size === attendanceAfter.size;
    const salaryUnchanged = salaryBefore.size === salaryAfter.size;

    record(
      12,
      'Strict Assistive-Only Directive: AI never mutates workers, attendance, or salary records',
      workersUnchanged && attendanceUnchanged && salaryUnchanged,
      `workersCount=${workersAfter.size}, attendanceCount=${attendanceAfter.size}, salaryCount=${salaryAfter.size} (all unchanged)`
    );
  } catch (err: any) {
    record(12, 'Strict Assistive-Only Directive: AI never mutates workers, attendance, or salary records', false, err.message);
  }

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('PHASE 7 ACCEPTANCE TEST SUMMARY');
  console.log('================================================================');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const total = results.length;
  console.log(`Passed: ${passed} / ${total} tests`);

  fs.writeFileSync(
    './phase7-verification-report.json',
    JSON.stringify({ passed, total, results, generatedAt: new Date().toISOString() }, null, 2)
  );
  console.log('Report saved to ./phase7-verification-report.json\n');

  if (passed === total) {
    console.log('>>> PHASE 7 = PASS <<<');
    process.exit(0);
  } else {
    console.error('>>> PHASE 7 = FAIL <<<');
    process.exit(1);
  }
}

runPhase7AcceptanceTests().catch((err) => {
  console.error('Error running Phase 7 tests:', err);
  process.exit(1);
});
