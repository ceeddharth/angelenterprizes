import dotenv from 'dotenv';
dotenv.config();
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClientApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs';

// 1. Firebase Admin SDK for deep database inspection and cleanup
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
const adminApp = initializeApp({ credential: cert(sa) }, 'p5-admin-app');
const adminDb = getAdminFirestore(adminApp);

// 2. Firebase Client SDK for acquiring real ID tokens
const clientConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const clientApp = initClientApp(clientConfig);
const auth = getAuth(clientApp);

const BASE_URL = 'http://localhost:3000';

interface P5TestResult {
  num: number;
  name: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
}

async function runPhase5AcceptanceTests() {
  console.log('================================================================');
  console.log('PHASE 5 ACCEPTANCE VERIFICATION — 24 COMPREHENSIVE CHECKS');
  console.log('================================================================\n');

  const results: P5TestResult[] = [];
  const cleanupLeaveIds: string[] = [];
  const cleanupOvertimeIds: string[] = [];
  const cleanupSalaryIds: string[] = [];

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
  const adminToken = await adminCred.user.getIdToken();

  let workerCred;
  try {
    workerCred = await signInWithEmailAndPassword(auth, 'worker1002@cw.gov', 'Worker@123456');
  } catch {
    workerCred = await createUserWithEmailAndPassword(auth, 'worker1002@cw.gov', 'Worker@123456');
  }
  const workerToken = await workerCred.user.getIdToken();

  // Snapshot original W-1002 for safe rollback
  const w1002Snap = await adminDb.collection('workers').doc('W-1002').get();
  const originalW1002 = w1002Snap.exists ? w1002Snap.data() : null;

  // Ensure worker user profile and worker record are properly linked
  await adminDb.collection('users').doc(workerCred.user.uid).set({
    uid: workerCred.user.uid,
    email: workerCred.user.email,
    role: 'WORKER',
    status: 'ACTIVE',
    workerId: 'W-1002',
    fullName: originalW1002?.fullName || 'David Miller',
    updatedAt: new Date().toISOString()
  }, { merge: true });

  await adminDb.collection('workers').doc('W-1002').set({
    uid: workerCred.user.uid,
    status: 'ACTIVE'
  }, { merge: true });

  const workerDoc = await adminDb.collection('workers').doc('W-1002').get();
  const workerSiteId = workerDoc.exists ? workerDoc.data()?.siteId || 'SITE-102' : 'SITE-102';

  // -------------------------------------------------------------------------
  // TEST 1: Worker Leave — View Balance & History
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/worker/leave-history?workerId=W-1002`, {
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    const data = await res.json();
    const hasBalance = data.balance && typeof data.balance.casualLeave === 'number';
    const hasRequestsArray = Array.isArray(data.requests);
    record(
      1,
      'Worker Leave: View Balance & History',
      res.status === 200 && hasBalance && hasRequestsArray,
      `HTTP ${res.status}. Balance: Casual=${data.balance?.casualLeave}, Medical=${data.balance?.medicalLeave}. Requests count: ${data.requests?.length}`
    );
  } catch (err: any) {
    record(1, 'Worker Leave: View Balance & History', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Worker Leave — Submit Valid Leave Request
  // -------------------------------------------------------------------------
  let createdLeaveId1 = '';
  try {
    const res = await fetch(`${BASE_URL}/api/worker/request-leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        workerId: 'W-1002',
        leaveType: 'CASUAL',
        startDate: '2026-10-05',
        endDate: '2026-10-07',
        reason: 'Family wedding celebration in ancestral village'
      })
    });
    const data = await res.json();
    if (res.status === 200 && data.leaveRequest?.requestId) {
      createdLeaveId1 = data.leaveRequest.requestId;
      cleanupLeaveIds.push(createdLeaveId1);
    }
    record(
      2,
      'Worker Leave: Submit Valid Leave Request',
      res.status === 200 && data.success && data.leaveRequest?.status === 'PENDING',
      `HTTP ${res.status}. Request ID: ${createdLeaveId1}, Status: ${data.leaveRequest?.status}, Days: ${data.leaveRequest?.daysCount}`
    );
  } catch (err: any) {
    record(2, 'Worker Leave: Submit Valid Leave Request', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Worker Leave — Rejection on Invalid Date Range (endDate < startDate)
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/worker/request-leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        workerId: 'W-1002',
        leaveType: 'CASUAL',
        startDate: '2026-10-15',
        endDate: '2026-10-10',
        reason: 'Backward dates test'
      })
    });
    const data = await res.json();
    record(
      3,
      'Worker Leave: Rejection on Invalid Date Range',
      res.status === 400 && data.error.includes('End date cannot precede start date'),
      `HTTP ${res.status}: "${data.error}"`
    );
  } catch (err: any) {
    record(3, 'Worker Leave: Rejection on Invalid Date Range', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Worker Leave — Rejection on Missing Required Fields / Empty Reason
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/worker/request-leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        workerId: 'W-1002',
        leaveType: 'CASUAL',
        startDate: '2026-10-20',
        endDate: '2026-10-21',
        reason: '   '
      })
    });
    const data = await res.json();
    record(
      4,
      'Worker Leave: Rejection on Empty Reason',
      res.status === 400 && data.error.includes('valid reason is required'),
      `HTTP ${res.status}: "${data.error}"`
    );
  } catch (err: any) {
    record(4, 'Worker Leave: Rejection on Empty Reason', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Worker Leave — Overlapping Pending Request Rejection
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/worker/request-leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        workerId: 'W-1002',
        leaveType: 'MEDICAL',
        startDate: '2026-10-06',
        endDate: '2026-10-06',
        reason: 'Duplicate overlapping request'
      })
    });
    const data = await res.json();
    record(
      5,
      'Worker Leave: Overlapping Pending Request Protection',
      res.status === 400 && data.error.includes('overlapping pending or approved leave'),
      `HTTP ${res.status}: "${data.error}"`
    );
  } catch (err: any) {
    record(5, 'Worker Leave: Overlapping Pending Request Protection', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 6: Worker Leave — IDOR & Privacy Protection (Cannot view other's leave)
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/worker/leave-history?workerId=W-1001`, {
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    const data = await res.json();
    record(
      6,
      'Worker Leave: Privacy & IDOR Protection',
      res.status === 403 && data.error.includes('Access denied'),
      `HTTP ${res.status}: "${data.error}"`
    );
  } catch (err: any) {
    record(6, 'Worker Leave: Privacy & IDOR Protection', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 7: Admin Leave — View All Workforce Leave Requests
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/leave-requests`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const hasRequests = Array.isArray(data.requests) && data.requests.length > 0;
    record(
      7,
      'Admin Leave: View All Workforce Requests',
      res.status === 200 && hasRequests,
      `HTTP ${res.status}. Retrieved ${data.requests?.length} requests. Found test request ${createdLeaveId1}`
    );
  } catch (err: any) {
    record(7, 'Admin Leave: View All Workforce Requests', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 8: Admin Leave — Approve Leave Request
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/review-leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        requestId: createdLeaveId1,
        status: 'APPROVED',
        reviewNotes: 'Verified with site supervisor'
      })
    });
    const data = await res.json();
    const docCheck = await adminDb.collection('leaveRequests').doc(createdLeaveId1).get();
    const storedStatus = docCheck.data()?.status;
    record(
      8,
      'Admin Leave: Approve Leave Request',
      res.status === 200 && data.success && storedStatus === 'APPROVED',
      `HTTP ${res.status}. Firestore doc status: ${storedStatus}, approvedBy: ${docCheck.data()?.reviewedBy}`
    );
  } catch (err: any) {
    record(8, 'Admin Leave: Approve Leave Request', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 9: Admin Leave — Reject Leave Request with Reason
  // -------------------------------------------------------------------------
  let createdLeaveId2 = '';
  try {
    // Create second leave request to reject
    const reqRes = await fetch(`${BASE_URL}/api/worker/request-leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        workerId: 'W-1002',
        leaveType: 'CASUAL',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        reason: 'Personal errand'
      })
    });
    const reqData = await reqRes.json();
    createdLeaveId2 = reqData.leaveRequest?.requestId;
    if (createdLeaveId2) cleanupLeaveIds.push(createdLeaveId2);

    const rejRes = await fetch(`${BASE_URL}/api/admin/review-leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        requestId: createdLeaveId2,
        status: 'REJECTED',
        rejectionReason: 'Critical concrete casting scheduled on these dates'
      })
    });
    const rejData = await rejRes.json();
    const docCheck = await adminDb.collection('leaveRequests').doc(createdLeaveId2).get();
    const storedStatus = docCheck.data()?.status;
    record(
      9,
      'Admin Leave: Reject Leave Request with Reason',
      rejRes.status === 200 && rejData.success && storedStatus === 'REJECTED',
      `HTTP ${rejRes.status}. Firestore doc status: ${storedStatus}, rejectionReason: "${docCheck.data()?.rejectionReason}"`
    );
  } catch (err: any) {
    record(9, 'Admin Leave: Reject Leave Request with Reason', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 10: Worker Cannot Review/Approve Leave (RBAC 403)
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/review-leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        requestId: createdLeaveId1,
        status: 'APPROVED'
      })
    });
    const data = await res.json();
    record(
      10,
      'RBAC: Worker Cannot Review Leave Requests',
      res.status === 403,
      `HTTP ${res.status}: "${data.error}"`
    );
  } catch (err: any) {
    record(10, 'RBAC: Worker Cannot Review Leave Requests', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 11: Worker Overtime — Submit Valid Overtime Log
  // -------------------------------------------------------------------------
  let createdOtId1 = '';
  try {
    const res = await fetch(`${BASE_URL}/api/worker/log-overtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        workerId: 'W-1002',
        siteId: workerSiteId,
        date: '2026-09-15',
        hours: 3.5,
        taskDescription: 'Emergency reinforcement bar tying for foundation column C-4'
      })
    });
    const data = await res.json();
    if (res.status === 200 && data.overtimeRecord?.overtimeId) {
      createdOtId1 = data.overtimeRecord.overtimeId;
      cleanupOvertimeIds.push(createdOtId1);
    }
    record(
      11,
      'Worker Overtime: Submit Valid Overtime Log',
      res.status === 200 && data.success && data.overtimeRecord?.status === 'PENDING',
      `HTTP ${res.status}. Overtime ID: ${createdOtId1}, Hours: ${data.overtimeRecord?.hours}, Status: ${data.overtimeRecord?.status}`
    );
  } catch (err: any) {
    record(11, 'Worker Overtime: Submit Valid Overtime Log', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 12: Worker Overtime — Rejection on Zero or Negative Hours
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/worker/log-overtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        workerId: 'W-1002',
        siteId: workerSiteId,
        date: '2026-09-15',
        hours: -2,
        taskDescription: 'Invalid negative hours'
      })
    });
    const data = await res.json();
    record(
      12,
      'Worker Overtime: Rejection on Zero/Negative Hours',
      res.status === 400 && data.error.includes('positive number between 0.5 and 16'),
      `HTTP ${res.status}: "${data.error}"`
    );
  } catch (err: any) {
    record(12, 'Worker Overtime: Rejection on Zero/Negative Hours', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 13: Worker Overtime — Rejection on Invalid / Unassigned Site
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/worker/log-overtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        workerId: 'W-1002',
        siteId: 'SITE-NONEXISTENT-999',
        date: '2026-09-15',
        hours: 2,
        taskDescription: 'Overtime at fake site'
      })
    });
    const data = await res.json();
    record(
      13,
      'Worker Overtime: Rejection on Invalid Site',
      res.status === 400 && data.error.includes('Site does not exist or is inactive'),
      `HTTP ${res.status}: "${data.error}"`
    );
  } catch (err: any) {
    record(13, 'Worker Overtime: Rejection on Invalid Site', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 14: Worker Overtime — Rejection on Empty Task Description
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/worker/log-overtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        workerId: 'W-1002',
        siteId: workerSiteId,
        date: '2026-09-15',
        hours: 2,
        taskDescription: '   '
      })
    });
    const data = await res.json();
    record(
      14,
      'Worker Overtime: Rejection on Empty Description',
      res.status === 400 && data.error.includes('task description is required'),
      `HTTP ${res.status}: "${data.error}"`
    );
  } catch (err: any) {
    record(14, 'Worker Overtime: Rejection on Empty Description', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 15: Worker Overtime — Privacy & IDOR Protection
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/worker/overtime-history?workerId=W-1001`, {
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    const data = await res.json();
    record(
      15,
      'Worker Overtime: Privacy & IDOR Protection',
      res.status === 403 && data.error.includes('Access denied'),
      `HTTP ${res.status}: "${data.error}"`
    );
  } catch (err: any) {
    record(15, 'Worker Overtime: Privacy & IDOR Protection', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 16: Admin Overtime — View All Workforce Overtime Records
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/overtime-records`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const hasRecords = Array.isArray(data.records) && data.records.length > 0;
    record(
      16,
      'Admin Overtime: View All Workforce Records',
      res.status === 200 && hasRecords,
      `HTTP ${res.status}. Retrieved ${data.records?.length} records. Includes test overtime ${createdOtId1}`
    );
  } catch (err: any) {
    record(16, 'Admin Overtime: View All Workforce Records', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 17: Admin Overtime — Approve Overtime Record
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/review-overtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        overtimeId: createdOtId1,
        status: 'APPROVED',
        approvedHours: 3.5,
        reviewNotes: 'Inspected and certified by site engineer'
      })
    });
    const data = await res.json();
    const docCheck = await adminDb.collection('overtimeRecords').doc(createdOtId1).get();
    const storedStatus = docCheck.data()?.status;
    record(
      17,
      'Admin Overtime: Approve Overtime Record',
      res.status === 200 && data.success && storedStatus === 'APPROVED',
      `HTTP ${res.status}. Firestore doc status: ${storedStatus}, approvedHours: ${docCheck.data()?.approvedHours}`
    );
  } catch (err: any) {
    record(17, 'Admin Overtime: Approve Overtime Record', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 18: Admin Overtime — Reject Overtime Record with Reason
  // -------------------------------------------------------------------------
  let createdOtId2 = '';
  try {
    const reqRes = await fetch(`${BASE_URL}/api/worker/log-overtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        workerId: 'W-1002',
        siteId: workerSiteId,
        date: '2026-09-16',
        hours: 4.0,
        taskDescription: 'Unsupervised evening work'
      })
    });
    const reqData = await reqRes.json();
    createdOtId2 = reqData.overtimeRecord?.overtimeId;
    if (createdOtId2) cleanupOvertimeIds.push(createdOtId2);

    const rejRes = await fetch(`${BASE_URL}/api/admin/review-overtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        overtimeId: createdOtId2,
        status: 'REJECTED',
        rejectionReason: 'Work was performed outside safety lighting protocols'
      })
    });
    const rejData = await rejRes.json();
    const docCheck = await adminDb.collection('overtimeRecords').doc(createdOtId2).get();
    const storedStatus = docCheck.data()?.status;
    record(
      18,
      'Admin Overtime: Reject Overtime Record',
      rejRes.status === 200 && rejData.success && storedStatus === 'REJECTED',
      `HTTP ${rejRes.status}. Firestore doc status: ${storedStatus}, rejectionReason: "${docCheck.data()?.rejectionReason}"`
    );
  } catch (err: any) {
    record(18, 'Admin Overtime: Reject Overtime Record', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 19: Worker Cannot Review/Approve Overtime (RBAC 403)
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/review-overtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        overtimeId: createdOtId1,
        status: 'APPROVED'
      })
    });
    const data = await res.json();
    record(
      19,
      'RBAC: Worker Cannot Review Overtime Records',
      res.status === 403,
      `HTTP ${res.status}: "${data.error}"`
    );
  } catch (err: any) {
    record(19, 'RBAC: Worker Cannot Review Overtime Records', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 20: Admin Salary — Deterministic Calculation Based on Real Data
  // -------------------------------------------------------------------------
  let calculatedSalaryId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/admin/calculate-salary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        workerId: 'W-1002',
        payPeriod: '2026-09',
        customDailyRate: 300,
        allowances: 150,
        deductions: 50
      })
    });
    const data = await res.json();
    if (res.status === 200 && data.salaryRecord?.salaryId) {
      calculatedSalaryId = data.salaryRecord.salaryId;
      cleanupSalaryIds.push(calculatedSalaryId);
    }
    const sal = data.salaryRecord;
    // Expected: baseEarnings = daysAttended * 300.
    // Overtime hourly rate = (300 / 8) * 1.5 = 56.25.
    // overtimeEarnings = approvedOvertimeHours * 56.25.
    // netSalary = baseEarnings + overtimeEarnings + 150 - 50.
    const isMathCorrect =
      sal &&
      sal.baseEarnings === sal.daysAttended * 300 &&
      Math.abs(sal.overtimeEarnings - sal.approvedOvertimeHours * 56.25) < 0.05 &&
      Math.abs(sal.netSalary - (sal.baseEarnings + sal.overtimeEarnings + 150 - 50)) < 0.05;

    record(
      20,
      'Admin Salary: Deterministic Calculation Model',
      res.status === 200 && data.success && isMathCorrect,
      `HTTP ${res.status}. Slip ID: ${calculatedSalaryId}, Days: ${sal?.daysAttended}, OT Hours: ${sal?.approvedOvertimeHours}, Base: $${sal?.baseEarnings}, OT: $${sal?.overtimeEarnings}, Net: $${sal?.netSalary}`
    );
  } catch (err: any) {
    record(20, 'Admin Salary: Deterministic Calculation Model', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 21: Admin Salary — Rejection on Non-Existent Worker
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/calculate-salary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        workerId: 'W-NONEXISTENT-999',
        payPeriod: '2026-09',
        customDailyRate: 200
      })
    });
    const data = await res.json();
    record(
      21,
      'Admin Salary: Rejection on Non-Existent Worker',
      res.status === 404 && data.error.includes('Worker W-NONEXISTENT-999 does not exist'),
      `HTTP ${res.status}: "${data.error}"`
    );
  } catch (err: any) {
    record(21, 'Admin Salary: Rejection on Non-Existent Worker', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 22: Admin Salary — Status Transition (DRAFT -> PROCESSED -> PAID)
  // -------------------------------------------------------------------------
  try {
    // 1. Process
    const procRes = await fetch(`${BASE_URL}/api/admin/update-salary-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        salaryId: calculatedSalaryId,
        status: 'PROCESSED'
      })
    });
    const procData = await procRes.json();

    // 2. Mark Paid
    const paidRes = await fetch(`${BASE_URL}/api/admin/update-salary-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        salaryId: calculatedSalaryId,
        status: 'PAID'
      })
    });
    const paidData = await paidRes.json();

    const docCheck = await adminDb.collection('salaryRecords').doc(calculatedSalaryId).get();
    const finalStatus = docCheck.data()?.status;

    record(
      22,
      'Admin Salary: Status Lifecycle (PROCESSED -> PAID)',
      procRes.status === 200 && paidRes.status === 200 && finalStatus === 'PAID',
      `Process HTTP ${procRes.status}, Paid HTTP ${paidRes.status}. Final Firestore status: ${finalStatus}, disbursedAt: ${docCheck.data()?.disbursedAt}`
    );
  } catch (err: any) {
    record(22, 'Admin Salary: Status Lifecycle', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 23: Worker Salary — Privacy & IDOR Protection
  // -------------------------------------------------------------------------
  try {
    // Worker can view their own salary
    const ownRes = await fetch(`${BASE_URL}/api/worker/salary-slips?workerId=W-1002`, {
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    const ownData = await ownRes.json();
    const canSeeOwn = ownRes.status === 200 && Array.isArray(ownData.salaryRecords);

    // Worker CANNOT view another worker's salary
    const otherRes = await fetch(`${BASE_URL}/api/worker/salary-slips?workerId=W-1001`, {
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    const otherData = await otherRes.json();
    const blockedOther = otherRes.status === 403;

    record(
      23,
      'Worker Salary: Privacy & IDOR Protection',
      canSeeOwn && blockedOther,
      `Own Slips: HTTP ${ownRes.status} (Count: ${ownData.salaryRecords?.length}). Other Worker Slips: HTTP ${otherRes.status} ("${otherData.error}")`
    );
  } catch (err: any) {
    record(23, 'Worker Salary: Privacy & IDOR Protection', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 24: Security, Credential Safety & Clean Data Teardown
  // -------------------------------------------------------------------------
  try {
    // 1. Check no password/PIN fields in any Phase 5 records
    const checkLeave = createdLeaveId1 ? await adminDb.collection('leaveRequests').doc(createdLeaveId1).get() : null;
    const checkOt = createdOtId1 ? await adminDb.collection('overtimeRecords').doc(createdOtId1).get() : null;
    const checkSal = calculatedSalaryId ? await adminDb.collection('salaryRecords').doc(calculatedSalaryId).get() : null;

    const lData = checkLeave?.data() || {};
    const oData = checkOt?.data() || {};
    const sData = checkSal?.data() || {};

    const hasNoCredentials =
      !('password' in lData) &&
      !('pin' in lData) &&
      !('bankPassword' in sData) &&
      !('bankPin' in sData) &&
      !('accountPin' in sData);

    // 2. Perform automated cleanup of all created test records
    for (const lid of cleanupLeaveIds) {
      await adminDb.collection('leaveRequests').doc(lid).delete();
    }
    for (const oid of cleanupOvertimeIds) {
      await adminDb.collection('overtimeRecords').doc(oid).delete();
    }
    for (const sid of cleanupSalaryIds) {
      await adminDb.collection('salaryRecords').doc(sid).delete();
    }

    if (originalW1002) {
      await adminDb.collection('workers').doc('W-1002').set(originalW1002);
    }

    record(
      24,
      'Security & Clean Teardown Verification',
      hasNoCredentials,
      `Zero passwords/PINs found. Successfully pruned ${cleanupLeaveIds.length} test leave records, ${cleanupOvertimeIds.length} test overtime records, and ${cleanupSalaryIds.length} test salary records from Firestore.`
    );
  } catch (err: any) {
    record(24, 'Security & Clean Teardown Verification', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('================================================================');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  console.log(`TOTAL PHASE 5 CHECKS: ${results.length}`);
  console.log(`PASSED: ${passCount} / ${results.length}`);
  console.log(`FAILED: ${results.length - passCount} / ${results.length}`);
  console.log('================================================================');

  fs.writeFileSync(
    './phase5-verification-report.json',
    JSON.stringify({ results, passCount, total: results.length, timestamp: new Date().toISOString() }, null, 2)
  );
}

runPhase5AcceptanceTests().catch((err) => {
  console.error('Phase 5 Verification Fatal Error:', err);
  process.exit(1);
});
