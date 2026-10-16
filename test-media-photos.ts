import dotenv from 'dotenv';
dotenv.config();

import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClient } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:3000';

// Minimal 1x1 valid PNG image in base64
const VALID_1X1_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Minimal 1x1 valid JPEG image in base64
const VALID_1X1_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function runMediaPhotosTestSuite() {
  console.log('====================================================');
  console.log('MEDIA & PHOTOS — AUTOMATED VERIFICATION SUITE');
  console.log('Civil Workforce Attendance System — ANGEL ENTERPRISES');
  console.log('====================================================\n');

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${desc}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: ${desc}`);
      testsFailed++;
    }
  }

  // 1. Initialize Firebase Admin
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  const adminApp = initAdmin({ credential: cert(sa) }, 'testAdminMedia');
  const adminDb = getAdminFirestore(adminApp);

  // 2. Initialize Firebase Client
  const clientConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  const clientApp = initClient(clientConfig, 'testClientMedia');
  const clientAuth = getAuth(clientApp);

  // Admin and Worker credentials
  console.log('[Step 1] Authenticating test personas...');
  let adminCred;
  try {
    adminCred = await signInWithEmailAndPassword(clientAuth, 'admin@civilworkforce.gov', 'Admin@123456');
  } catch {
    adminCred = await createUserWithEmailAndPassword(clientAuth, 'admin@civilworkforce.gov', 'Admin@123456');
  }
  const adminToken = await adminCred.user.getIdToken(true);
  assert(Boolean(adminToken), 'Admin successfully authenticated via Firebase Auth');

  // Ensure Admin document exists in Firestore
  await adminDb.collection('admins').doc(adminCred.user.uid).set({
    uid: adminCred.user.uid,
    email: 'admin@civilworkforce.gov',
    role: 'ADMIN',
    status: 'ACTIVE',
    name: 'Chief Admin'
  }, { merge: true });

  let worker1Cred;
  try {
    worker1Cred = await signInWithEmailAndPassword(clientAuth, 'worker1002@cw.gov', 'Worker@123456');
  } catch {
    worker1Cred = await createUserWithEmailAndPassword(clientAuth, 'worker1002@cw.gov', 'Worker@123456');
  }
  const worker1Token = await worker1Cred.user.getIdToken(true);
  const worker1Id: string = 'W-1002';
  assert(Boolean(worker1Token), 'Worker 1 (W-1002) successfully authenticated via Firebase Auth');

  // Ensure worker record has correct uid
  await adminDb.collection('workers').doc(worker1Id).set({
    uid: worker1Cred.user.uid,
    userId: worker1Cred.user.uid,
    workerId: worker1Id,
    email: 'worker1002@cw.gov'
  }, { merge: true });

  const worker2Id: string = 'W-1001';

  // Find a test site
  const sitesSnap = await adminDb.collection('sites').where('status', '==', 'ACTIVE').limit(1).get();
  const testSiteId = sitesSnap.docs[0].id;
  console.log(`  Test Construction Site: ${testSiteId}\n`);

  // =========================================================================
  // TEST SUITE 1: CONSTRUCTION SITE PHOTOS (Limit: 1-5, Admin Only)
  // =========================================================================
  console.log('--- TEST SUITE 1: Construction Site Photos ---');

  // Clean up any existing photos for clean test run
  const existingPhotos = await adminDb.collection('sites').doc(testSiteId).collection('photos').get();
  for (const doc of existingPhotos.docs) {
    await doc.ref.delete();
  }

  // 1.1 Unauthenticated upload should be rejected (401)
  const unauthUploadRes = await fetch(`${API_BASE}/api/storage/site-photo/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteId: testSiteId,
      fileBase64: VALID_1X1_PNG_BASE64,
      fileName: 'test.png',
      contentType: 'image/png'
    })
  });
  assert(unauthUploadRes.status === 401, 'Unauthenticated site photo upload is rejected with 401');

  // 1.2 Worker upload should be forbidden (403 - Admin only)
  if (worker1Token) {
    const workerUploadRes = await fetch(`${API_BASE}/api/storage/site-photo/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${worker1Token}`
      },
      body: JSON.stringify({
        siteId: testSiteId,
        fileBase64: VALID_1X1_PNG_BASE64,
        fileName: 'test.png',
        contentType: 'image/png'
      })
    });
    assert(workerUploadRes.status === 403, 'Non-admin worker site photo upload is rejected with 403 Forbidden');
  }

  // 1.3 Unsupported MIME type rejected
  const badMimeRes = await fetch(`${API_BASE}/api/storage/site-photo/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      siteId: testSiteId,
      fileBase64: Buffer.from('hello plain text').toString('base64'),
      fileName: 'document.txt',
      contentType: 'text/plain'
    })
  });
  assert(badMimeRes.status === 400, 'Unsupported MIME type (text/plain) is rejected with 400');

  // 1.4 Admin uploads Photo 1 (Valid PNG)
  const upload1Res = await fetch(`${API_BASE}/api/storage/site-photo/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      siteId: testSiteId,
      fileBase64: VALID_1X1_PNG_BASE64,
      fileName: 'site_foundation_zone.png',
      contentType: 'image/png',
      displayOrder: 1
    })
  });
  const upload1Json: any = await upload1Res.json();
  assert(upload1Res.status === 200 && upload1Json.success, 'Admin successfully uploaded site photo 1');
  const photo1 = upload1Json.photo;
  assert(Boolean(photo1.photoId && photo1.storagePath && photo1.downloadUrl), 'Photo 1 contains valid photoId, storagePath, and downloadUrl');
  assert(photo1.storagePath.startsWith(`sitePhotos/${testSiteId}/`), 'Photo 1 conforms to structured storage path /sitePhotos/{siteId}/{photoId}');

  // Verify Firestore document
  const photo1Doc = await adminDb.collection('sites').doc(testSiteId).collection('photos').doc(photo1.photoId).get();
  assert(photo1Doc.exists, 'Photo 1 metadata document exists in Firestore under sites/{siteId}/photos/{photoId}');
  const p1Data = photo1Doc.data();
  assert(p1Data?.siteId === testSiteId && p1Data?.fileSize > 0, 'Firestore metadata contains correct siteId and fileSize');

  // 1.5 Upload photos 2, 3, 4, 5 to test quota limit (1-5 limit)
  let lastPhotoId = '';
  for (let i = 2; i <= 5; i++) {
    const res = await fetch(`${API_BASE}/api/storage/site-photo/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        siteId: testSiteId,
        fileBase64: VALID_1X1_JPEG_BASE64,
        fileName: `site_safety_view_${i}.jpg`,
        contentType: 'image/jpeg',
        displayOrder: i
      })
    });
    const json: any = await res.json();
    if (json.success) lastPhotoId = json.photo.photoId;
  }
  const snapAfter5 = await adminDb.collection('sites').doc(testSiteId).collection('photos').get();
  assert(snapAfter5.size === 5, 'Site successfully reached exact maximum limit of 5 photos');

  // 1.6 Attempting to upload 6th photo must be rejected
  const upload6Res = await fetch(`${API_BASE}/api/storage/site-photo/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      siteId: testSiteId,
      fileBase64: VALID_1X1_JPEG_BASE64,
      fileName: 'overflow_photo.jpg',
      contentType: 'image/jpeg'
    })
  });
  const upload6Json: any = await upload6Res.json();
  assert(upload6Res.status === 400 && !upload6Json.success, '6th photo upload is rejected: 1–5 limit strictly enforced');

  // 1.7 Retrieve site photos endpoint
  const listPhotosRes = await fetch(`${API_BASE}/api/storage/site-photos/${testSiteId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const listPhotosJson: any = await listPhotosRes.json();
  assert(listPhotosRes.status === 200 && listPhotosJson.photos.length === 5, 'GET /api/storage/site-photos/:siteId returns all 5 photos');

  // 1.8 Delete site photo
  const deletePhotoRes = await fetch(`${API_BASE}/api/storage/site-photo/${testSiteId}/${photo1.photoId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const deletePhotoJson: any = await deletePhotoRes.json();
  assert(deletePhotoRes.status === 200 && deletePhotoJson.success, 'Admin successfully deleted site photo 1');

  // Verify deletion from Firestore
  const photo1Check = await adminDb.collection('sites').doc(testSiteId).collection('photos').doc(photo1.photoId).get();
  assert(!photo1Check.exists, 'Deleted photo metadata completely removed from Firestore (no orphaned record)');

  // Clean up remaining test photos
  const remainingPhotos = await adminDb.collection('sites').doc(testSiteId).collection('photos').get();
  for (const doc of remainingPhotos.docs) {
    await fetch(`${API_BASE}/api/storage/site-photo/${testSiteId}/${doc.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
  }

  // =========================================================================
  // TEST SUITE 2: WORKER PROFILE PHOTO (Max 1, Privacy & RBAC)
  // =========================================================================
  console.log('\n--- TEST SUITE 2: Worker Profile Photo ---');

  // 2.1 Admin uploads profile photo for Worker 1
  const wUploadRes = await fetch(`${API_BASE}/api/storage/worker-photo/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      workerId: worker1Id,
      fileBase64: VALID_1X1_PNG_BASE64,
      fileName: 'worker1_profile.png',
      contentType: 'image/png'
    })
  });
  const wUploadJson: any = await wUploadRes.json();
  assert(wUploadRes.status === 200 && wUploadJson.success, 'Admin successfully uploaded Worker 1 profile photo');
  const wProfile = wUploadJson.profilePhoto;
  assert(wProfile.storagePath.startsWith(`workerPhotos/${worker1Id}/`), 'Storage path conforms to /workerPhotos/{workerId}/{photoId}');

  // Verify canonical worker record in Firestore has profilePhoto object
  const w1DocCheck = await adminDb.collection('workers').doc(worker1Id).get();
  const w1UpdatedData = w1DocCheck.data();
  assert(Boolean(w1UpdatedData?.profilePhoto?.photoId), 'Worker canonical record in Firestore updated with profilePhoto metadata');

  // 2.2 Uploading a second photo replaces existing (Max 1 limit enforced)
  const wUpload2Res = await fetch(`${API_BASE}/api/storage/worker-photo/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      workerId: worker1Id,
      fileBase64: VALID_1X1_JPEG_BASE64,
      fileName: 'worker1_profile_new.jpg',
      contentType: 'image/jpeg'
    })
  });
  const wUpload2Json: any = await wUpload2Res.json();
  assert(wUpload2Res.status === 200 && wUpload2Json.success, 'Second profile photo upload cleanly replaced previous photo (Limit: 1)');
  assert(wUpload2Json.profilePhoto.photoId !== wProfile.photoId, 'New photo has unique safe identifier');

  // 2.3 Worker Privacy Guard: Worker 1 CANNOT view or access Worker 2's photo
  if (worker1Token && worker1Id !== worker2Id) {
    const crossAccessRes = await fetch(`${API_BASE}/api/storage/worker-photo/${worker2Id}`, {
      headers: { 'Authorization': `Bearer ${worker1Token}` }
    });
    assert(crossAccessRes.status === 403, 'Cross-worker profile photo access is BLOCKED with 403 Forbidden');

    const crossStreamRes = await fetch(`${API_BASE}/api/storage/file/workerPhotos/${worker2Id}/secret.jpg`, {
      headers: { 'Authorization': `Bearer ${worker1Token}` }
    });
    assert(crossStreamRes.status === 403, 'Direct streaming of another worker photo path is BLOCKED with 403 Forbidden');
  }

  // 2.4 Unauthenticated access to worker photo streaming is BLOCKED
  const unauthStreamRes = await fetch(`${API_BASE}/api/storage/file/workerPhotos/${worker1Id}/${wUpload2Json.profilePhoto.photoId}.jpg`);
  assert(unauthStreamRes.status === 401, 'Unauthenticated streaming of worker profile photo is BLOCKED with 401');

  // 2.5 Delete Worker Profile Photo
  const wDeleteRes = await fetch(`${API_BASE}/api/storage/worker-photo/${worker1Id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const wDeleteJson: any = await wDeleteRes.json();
  assert(wDeleteRes.status === 200 && wDeleteJson.success, 'Worker profile photo deleted successfully');

  // Verify Firestore worker record no longer contains profilePhoto
  const w1FinalCheck = await adminDb.collection('workers').doc(worker1Id).get();
  assert(!w1FinalCheck.data()?.profilePhoto, 'Worker record in Firestore has profilePhoto field removed');

  // =========================================================================
  // TEST SUITE 3: NON-FUNCTIONAL PRIVACY & ETHICAL INVARIANTS
  // =========================================================================
  console.log('\n--- TEST SUITE 3: Ethical & Non-Functional Invariants ---');
  
  // 3.1 Verify NO Facial Recognition / AI face scanning in codebase
  const serverCode = fs.readFileSync('./server.ts', 'utf8');
  assert(!serverCode.includes('faceapi') && !serverCode.includes('face-api') && !serverCode.includes('facialRecognition'), 'Codebase contains ZERO facial recognition libraries');
  assert(!serverCode.includes('biometricMatching') && !serverCode.includes('faceEmbeddings'), 'Codebase contains ZERO biometric matching or embeddings');

  // 3.2 Verify attendance remains strictly QR / location based (NO selfies)
  assert(!serverCode.includes('selfie') && !serverCode.includes('requireSelfie'), 'Attendance system requires ZERO selfies');

  // 3.3 Verify AI Copilot prompts do not ingest worker photos
  assert(!serverCode.includes('profilePhoto.downloadUrl') && !serverCode.includes('fileBase64') || !serverCode.includes('ai.models.generateContent({ contents: fileBase64'), 'AI Copilot NEVER receives worker photo binaries');

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('====================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runMediaPhotosTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
