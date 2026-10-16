import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

const BASE_URL = 'http://localhost:3000';

async function runPhase4Audit() {
  console.log('================================================================');
  console.log('PHASE 4 COMPLETE AUDIT: WORKFORCE & SITE MANAGEMENT EXPANSION');
  console.log('================================================================\n');

  // 1. Setup Admin Account
  console.log('[Setup] Signing in as Site Admin...');
  let adminCred;
  try {
    adminCred = await signInWithEmailAndPassword(auth, 'admin@civilworkforce.gov', 'Admin@123456');
    console.log('✓ Admin signed in:', adminCred.user.uid);
  } catch (err: any) {
    adminCred = await createUserWithEmailAndPassword(auth, 'admin@civilworkforce.gov', 'Admin@123456');
    console.log('✓ Admin created & signed in:', adminCred.user.uid);
  }

  const adminToken = await adminCred.user.getIdToken();

  // 2. Setup a Worker Account for non-admin rejection test
  console.log('[Setup] Signing in/creating Worker user for security checks...');
  let workerCred;
  try {
    workerCred = await signInWithEmailAndPassword(auth, 'worker.test@civil.gov', 'Worker@123456');
  } catch {
    workerCred = await createUserWithEmailAndPassword(auth, 'worker.test@civil.gov', 'Worker@123456');
  }
  const workerToken = await workerCred.user.getIdToken();

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testId: string, desc: string) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${testId}: ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${testId}: ${desc}`);
      throw new Error(`Assertion failed: Test ${testId} - ${desc}`);
    }
  }

  // TEST A: Create new construction site
  console.log('\n--- Test A: Create Construction Site ---');
  const siteId = `SITE-P4-${Date.now().toString().slice(-4)}`;
  const createSiteRes = await fetch(`${BASE_URL}/api/admin/create-site`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteId,
      siteName: 'Phase 4 High-Speed Rail Terminal',
      projectName: 'National Transit Program',
      address: 'Plot 42, North Industrial Sector',
      description: 'Primary terminus civil and structural construction zone',
      status: 'ACTIVE'
    })
  });
  const createSiteData = await createSiteRes.json();
  assert(createSiteRes.status === 200 && createSiteData.success, 'A1', `Site ${siteId} created via server endpoint`);
  assert(createSiteData.site.siteName === 'Phase 4 High-Speed Rail Terminal', 'A2', 'Site name matches submitted data');
  assert(createSiteData.site.status === 'ACTIVE', 'A3', 'Site initial status is ACTIVE');

  // Verify duplicate site creation is rejected
  const dupSiteRes = await fetch(`${BASE_URL}/api/admin/create-site`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteId,
      siteName: 'Duplicate Attempt',
      projectName: 'National Transit Program'
    })
  });
  assert(dupSiteRes.status === 400, 'A4', 'Duplicate site ID creation strictly rejected (HTTP 400)');

  // TEST B: Edit construction site details
  console.log('\n--- Test B: Edit Construction Site Details ---');
  const updateSiteRes = await fetch(`${BASE_URL}/api/admin/update-site`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteId,
      updates: {
        siteName: 'Phase 4 High-Speed Rail & Metro Interchange',
        projectName: 'National Transit Program Phase 2',
        address: 'Plot 42-A, Expanded Terminus Zone',
        description: 'Expanded dual-corridor transit hub'
      }
    })
  });
  const updateSiteData = await updateSiteRes.json();
  assert(updateSiteRes.status === 200 && updateSiteData.success, 'B1', 'Site updated successfully via server');
  assert(updateSiteData.site.siteName === 'Phase 4 High-Speed Rail & Metro Interchange', 'B2', 'Updated siteName verified');
  assert(updateSiteData.site.address === 'Plot 42-A, Expanded Terminus Zone', 'B3', 'Updated address verified');

  // TEST C: Deactivate construction site
  console.log('\n--- Test C: Deactivate Construction Site ---');
  const deactSiteRes = await fetch(`${BASE_URL}/api/admin/update-site`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteId,
      updates: { status: 'INACTIVE' }
    })
  });
  const deactSiteData = await deactSiteRes.json();
  assert(deactSiteRes.status === 200 && deactSiteData.site.status === 'INACTIVE', 'C1', `Site ${siteId} status updated to INACTIVE`);

  // Verify that an inactive site QR generation fails or returns inactive warning
  const inactiveQrRes = await fetch(`${BASE_URL}/api/attendance/active-qr?siteId=${siteId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  // Active QR generation checks site validity
  const inactiveQrData = await inactiveQrRes.json();
  console.log('Inactive Site QR Check:', inactiveQrRes.status, inactiveQrData);
  assert(inactiveQrRes.status === 400 || inactiveQrData.error?.includes('Inactive') || inactiveQrData.error?.includes('inactive'), 'C2', 'Inactive site rejected for active attendance QR generation');

  // TEST D: Reactivate construction site
  console.log('\n--- Test D: Reactivate Construction Site ---');
  const reactSiteRes = await fetch(`${BASE_URL}/api/admin/update-site`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteId,
      updates: { status: 'ACTIVE' }
    })
  });
  const reactSiteData = await reactSiteRes.json();
  assert(reactSiteRes.status === 200 && reactSiteData.site.status === 'ACTIVE', 'D1', `Site ${siteId} restored to ACTIVE status`);

  // TEST E: Create new workforce batch
  console.log('\n--- Test E: Create Workforce Batch via Sequential Concurrency Counter ---');
  const createBatchRes = await fetch(`${BASE_URL}/api/admin/create-batch`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Phase 4 Architectural Finishes & Glazing',
      description: 'Specialized facade, glass paneling, and weather seal team',
      adminName: 'Chief Site Administrator'
    })
  });
  const createBatchData = await createBatchRes.json();
  assert(createBatchRes.status === 200 && createBatchData.success, 'E1', `Batch created with ID ${createBatchData.batch.batchId}`);
  assert(/^B-\d+$/.test(createBatchData.batch.batchId), 'E2', 'Batch ID follows standard sequential format (e.g. B-01, B-06)');
  assert(createBatchData.batch.status === 'ACTIVE', 'E3', 'New batch default status is ACTIVE');
  const testBatchId = createBatchData.batch.batchId;

  // TEST F: Edit workforce batch details
  console.log('\n--- Test F: Edit Workforce Batch Details ---');
  const updateBatchRes = await fetch(`${BASE_URL}/api/admin/update-batch`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batchId: testBatchId,
      updates: {
        name: 'Phase 4 Structural Glazing & Façade Works',
        description: 'Advanced exterior glazing, sealants, and curtain wall engineering'
      }
    })
  });
  const updateBatchData = await updateBatchRes.json();
  assert(updateBatchRes.status === 200 && updateBatchData.success, 'F1', 'Batch updated via server endpoint');
  assert(updateBatchData.batch.name === 'Phase 4 Structural Glazing & Façade Works', 'F2', 'Updated batch name persisted');

  // TEST G: Deactivate batch
  console.log('\n--- Test G: Deactivate Batch ---');
  const deactBatchRes = await fetch(`${BASE_URL}/api/admin/update-batch`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batchId: testBatchId,
      updates: { status: 'INACTIVE' }
    })
  });
  const deactBatchData = await deactBatchRes.json();
  assert(deactBatchRes.status === 200 && deactBatchData.batch.status === 'INACTIVE', 'G1', `Batch ${testBatchId} deactivated`);

  // Verify that all active batches endpoint properly reflects status
  const batchesListRes = await fetch(`${BASE_URL}/api/batches`);
  const batchesListData = await batchesListRes.json();
  const foundInactiveBatch = batchesListData.batches.find((b: any) => b.batchId === testBatchId);
  assert(foundInactiveBatch?.status === 'INACTIVE', 'G2', 'Inactive batch status accurately returned by server batch list');

  // TEST H: Reactivate batch
  console.log('\n--- Test H: Reactivate Batch ---');
  const reactBatchRes = await fetch(`${BASE_URL}/api/admin/update-batch`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batchId: testBatchId,
      updates: { status: 'ACTIVE' }
    })
  });
  const reactBatchData = await reactBatchRes.json();
  assert(reactBatchRes.status === 200 && reactBatchData.batch.status === 'ACTIVE', 'H1', `Batch ${testBatchId} reactivated`);

  // TEST I: Worker Profile Update and Site/Batch Reassignment
  console.log('\n--- Test I: Worker Profile Update & Reassignment ---');
  // Re-authenticate as admin for client SDK operations
  await signInWithEmailAndPassword(auth, 'admin@civilworkforce.gov', 'Admin@123456');
  // First, find an active worker to update
  const workersSnap = await getDocs(collection(db, 'workers'));
  assert(workersSnap.size > 0, 'I1', 'At least one worker exists in Firestore database');
  const targetWorker = workersSnap.docs[0].data();
  const targetWorkerId = targetWorker.workerId;
  const originalWorkerProfile = {
    siteId: targetWorker.assignedSiteId || targetWorker.siteId || 'SITE-102',
    batchNumber: targetWorker.batchNumber || 'B-01',
    jobRole: targetWorker.jobRole || 'Mason',
    phone: targetWorker.phone || '9876543211'
  };
  console.log(`Testing with existing worker: ${targetWorkerId} (${targetWorker.fullName})`);

  const updateWorkerRes = await fetch(`${BASE_URL}/api/admin/update-worker`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workerId: targetWorkerId,
      updates: {
        siteId,
        batchNumber: testBatchId,
        jobRole: 'Senior Glazing Specialist',
        phone: '9876500001'
      }
    })
  });
  const updateWorkerData = await updateWorkerRes.json();
  assert(updateWorkerRes.status === 200 && updateWorkerData.success, 'I2', `Worker ${targetWorkerId} updated via server`);
  assert(updateWorkerData.worker.siteId === siteId, 'I3', `Worker siteId reassigned to ${siteId}`);
  assert(updateWorkerData.worker.batchNumber === testBatchId, 'I4', `Worker batchNumber reassigned to ${testBatchId}`);
  assert(updateWorkerData.worker.jobRole === 'Senior Glazing Specialist', 'I5', 'Worker trade updated to Senior Glazing Specialist');
  assert(updateWorkerData.worker.phone === '9876500001', 'I6', 'Worker phone number updated');
  assert(updateWorkerData.worker.workerId === targetWorkerId, 'I7', 'Worker ID remains immutable');

  // Verify non-existent site reassignment is rejected
  const badSiteWorkerRes = await fetch(`${BASE_URL}/api/admin/update-worker`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workerId: targetWorkerId,
      updates: { siteId: 'SITE-NON-EXISTENT-999' }
    })
  });
  assert(badSiteWorkerRes.status === 404, 'I8', 'Reassignment to non-existent site strictly rejected (HTTP 404)');

  // Verify non-existent batch reassignment is rejected
  const badBatchWorkerRes = await fetch(`${BASE_URL}/api/admin/update-worker`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workerId: targetWorkerId,
      updates: { batchNumber: 'B-99999' }
    })
  });
  assert(badBatchWorkerRes.status === 404, 'I9', 'Reassignment to non-existent batch strictly rejected (HTTP 404)');

  // TEST J: Workforce Distribution Aggregation
  console.log('\n--- Test J: Workforce Distribution Aggregation ---');
  const distRes = await fetch(`${BASE_URL}/api/admin/workforce-distribution`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const distData = await distRes.json();
  assert(distRes.status === 200 && distData.success, 'J1', 'Workforce distribution endpoint responded HTTP 200');
  const dist = distData.distribution;
  console.log('Distribution Summary:', {
    totalWorkers: dist.totalWorkers,
    siteCount: Object.keys(dist.bySite).length,
    batchCount: Object.keys(dist.byBatch).length,
    roleCount: Object.keys(dist.byRole).length,
    statusCounts: dist.byStatus
  });

  assert(dist.totalWorkers > 0, 'J2', 'totalWorkers > 0');
  assert(dist.bySite[siteId] !== undefined, 'J3', `Distribution tracks newly created site ${siteId}`);
  assert(dist.bySite[siteId].count >= 1, 'J4', `Site ${siteId} shows at least 1 assigned worker`);
  assert(dist.byBatch[testBatchId] !== undefined, 'J5', `Distribution tracks newly created batch ${testBatchId}`);
  assert(dist.byBatch[testBatchId].count >= 1, 'J6', `Batch ${testBatchId} shows at least 1 assigned worker`);
  assert(dist.byRole['Senior Glazing Specialist'] >= 1, 'J7', 'Role distribution reflects updated trade');
  assert(dist.byStatus.ACTIVE >= 1, 'J8', 'Status breakdown correctly counts active workers');

  // TEST K: Security Rules & Authorization Checks
  console.log('\n--- Test K: Security & Authorization Access Control ---');

  // K1: Unauthenticated request to /api/admin/create-site
  const unauthRes1 = await fetch(`${BASE_URL}/api/admin/create-site`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId: 'SITE-HACK', siteName: 'Hacked Site', projectName: 'Hack' })
  });
  assert(unauthRes1.status === 401, 'K1', 'Unauthenticated site creation rejected (HTTP 401)');

  // K2: Non-admin worker token to /api/admin/create-site
  const workerAdminRes1 = await fetch(`${BASE_URL}/api/admin/create-site`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId: 'SITE-HACK', siteName: 'Hacked Site', projectName: 'Hack' })
  });
  assert(workerAdminRes1.status === 403, 'K2', 'Non-admin worker token rejected for site creation (HTTP 403)');

  // K3: Non-admin worker token to /api/admin/create-batch
  const workerAdminRes2 = await fetch(`${BASE_URL}/api/admin/create-batch`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hacked Batch' })
  });
  assert(workerAdminRes2.status === 403, 'K3', 'Non-admin worker token rejected for batch creation (HTTP 403)');

  // K4: Non-admin worker token to /api/admin/update-worker
  const workerAdminRes3 = await fetch(`${BASE_URL}/api/admin/update-worker`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId: targetWorkerId, updates: { jobRole: 'Fake Supervisor' } })
  });
  assert(workerAdminRes3.status === 403, 'K4', 'Non-admin worker token rejected for worker reassignment (HTTP 403)');

  // K5: Non-admin worker token to /api/admin/workforce-distribution
  const workerAdminRes4 = await fetch(`${BASE_URL}/api/admin/workforce-distribution`, {
    headers: { 'Authorization': `Bearer ${workerToken}` }
  });
  assert(workerAdminRes4.status === 403, 'K5', 'Non-admin worker token rejected for workforce distribution (HTTP 403)');

  // TEST L: Regression Test on Phase 1, 2, 3 Core Attendance Flow
  console.log('\n--- Test L: Core Regression Test on Phase 1, 2, 3 ---');
  // L1: Server Health
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthData = await healthRes.json();
  assert(healthRes.status === 200 && healthData.ready === true, 'L1', 'Server health and HMAC / Admin SDK ready');

  // L2: Active QR Generation for Site
  const qrRes = await fetch(`${BASE_URL}/api/attendance/active-qr?siteId=${siteId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const qrData = await qrRes.json();
  assert(qrRes.status === 200 && qrData.token && (qrData.secondsRemaining > 0 || qrData.expiresAt > 0), 'L2', 'Active 30s rotating QR token generated for active site');

  // L3: Attendance Record Endpoint rejects invalid token
  const fakeAttRes = await fetch(`${BASE_URL}/api/attendance/record`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operationId: `OP-TEST-${Date.now()}`,
      workerId: targetWorkerId,
      siteId,
      qrToken: 'FAKE_EXPIRED_TOKEN_12345',
      clientTimestamp: Date.now()
    })
  });
  assert(fakeAttRes.status === 400 || fakeAttRes.status === 401, 'L3', 'Attendance endpoint rejects invalid/spoofed QR token');

  // Restore worker profile to ensure test isolation
  if (targetWorkerId && originalWorkerProfile) {
    try {
      await fetch(`${BASE_URL}/api/admin/update-worker`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId: targetWorkerId,
          updates: {
            siteId: 'SITE-102',
            batchNumber: 'B-01',
            jobRole: 'Mason',
            phone: '9876543211'
          }
        })
      });
      console.log(`[Cleanup] Restored worker ${targetWorkerId} to canonical profile.`);
    } catch (cleanupErr: any) {
      console.warn(`[Cleanup] Failed to restore worker profile:`, cleanupErr.message);
    }
  }

  console.log('\n================================================================');
  console.log(`PHASE 4 AUDIT COMPLETE: ${passed} / ${total} TESTS PASSED`);
  console.log('================================================================\n');
}

runPhase4Audit().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('\nAudit run failed with error:', err);
  process.exit(1);
});
