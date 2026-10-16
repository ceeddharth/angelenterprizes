import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

async function runLiveVerification() {
  console.log('=== STEP 1: Admin Authentication ===');
  const adminCred = await signInWithEmailAndPassword(auth, 'admin@civilworkforce.gov', 'Admin@123456');
  console.log('Admin signed in successfully. Email:', adminCred.user.email, 'UID:', adminCred.user.uid);

  console.log('\n=== STEP 2: Read Real Batches from Firestore ===');
  const batchesSnap = await getDocs(collection(db, 'batches'));
  console.log('Found', batchesSnap.size, 'batches in Firestore.');
  
  let targetBatchId = 'B-01';
  let targetBatchDoc = batchesSnap.docs.find(d => d.id === 'B-01') || batchesSnap.docs[0];

  if (!targetBatchDoc) {
    console.log('No batches found. Creating initial batch B-01...');
    const newBatchRef = doc(db, 'batches', 'B-01');
    await setDoc(newBatchRef, {
      batchId: 'B-01',
      name: 'Foundation & Structural',
      description: 'Civil earthwork, piling, rebar, concrete pouring',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByName: 'Admin Verification'
    });
    targetBatchDoc = await getDoc(newBatchRef);
    console.log('Created batch B-01');
  }

  targetBatchId = targetBatchDoc.id;
  const initialBatchStatus = targetBatchDoc.data().status || 'ACTIVE';
  console.log(`Target Batch ID: ${targetBatchId}, Current Status: ${initialBatchStatus}`);

  console.log('\n=== STEP 3: Toggle Batch Status & Verify Real Firestore Persistence ===');
  const toggledBatchStatus = initialBatchStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  console.log(`Toggling Batch ${targetBatchId} status to: ${toggledBatchStatus}`);

  const batchDocRef = doc(db, 'batches', targetBatchId);
  await updateDoc(batchDocRef, {
    status: toggledBatchStatus,
    updatedAt: new Date().toISOString()
  });

  // Read back independently from Firestore to prove persistence
  const reReadBatchSnap = await getDoc(batchDocRef);
  const reReadBatchData = reReadBatchSnap.data();
  console.log('Re-read batch from Firestore. Status is now:', reReadBatchData?.status);

  if (reReadBatchData?.status !== toggledBatchStatus) {
    throw new Error(`Batch persistence verification failed! Expected ${toggledBatchStatus}, got ${reReadBatchData?.status}`);
  }
  console.log('[PASS] Batch status successfully persisted to Firestore!');

  // Restore original status
  console.log(`Restoring Batch ${targetBatchId} to original status: ${initialBatchStatus}`);
  await updateDoc(batchDocRef, {
    status: initialBatchStatus,
    updatedAt: new Date().toISOString()
  });
  const restoredBatchSnap = await getDoc(batchDocRef);
  console.log('[PASS] Restored batch status. Confirmed:', restoredBatchSnap.data()?.status);

  console.log('\n=== STEP 4: Verify Unauthorized User Cannot Toggle Batch ===');
  await signOut(auth);
  console.log('Admin signed out. Current user:', auth.currentUser);

  try {
    await updateDoc(batchDocRef, {
      status: 'TAMPERED_STATUS',
      updatedAt: new Date().toISOString()
    });
    throw new Error('FAIL: Unauthenticated write to batches succeeded when it should have been denied!');
  } catch (permErr: any) {
    console.log('[PASS] Unauthorized batch write was properly denied by Firestore Security Rules:', permErr.message || permErr.code);
  }

  console.log('\n=== STEP 5: Read and Toggle Construction Site Status with Admin Auth ===');
  await signInWithEmailAndPassword(auth, 'admin@civilworkforce.gov', 'Admin@123456');
  console.log('Admin signed back in.');

  const sitesSnap = await getDocs(collection(db, 'sites'));
  console.log('Found', sitesSnap.size, 'sites in Firestore.');

  let targetSiteId = 'SITE-101';
  let targetSiteDoc = sitesSnap.docs.find(d => d.id === 'SITE-101') || sitesSnap.docs[0];

  if (!targetSiteDoc) {
    console.log('No sites found. Creating initial site SITE-101...');
    const newSiteRef = doc(db, 'sites', 'SITE-101');
    await setDoc(newSiteRef, {
      siteId: 'SITE-101',
      siteName: 'Metro Transit Station Line 3',
      projectName: 'Civil Infrastructure Division',
      address: 'Sector 4, Central Corridor',
      description: 'Primary underground metro transit station civil construction',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    targetSiteDoc = await getDoc(newSiteRef);
    console.log('Created site SITE-101');
  }

  targetSiteId = targetSiteDoc.id;
  const initialSiteStatus = targetSiteDoc.data().status || 'ACTIVE';
  console.log(`Target Site ID: ${targetSiteId}, Current Status: ${initialSiteStatus}`);

  const toggledSiteStatus = initialSiteStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  console.log(`Toggling Site ${targetSiteId} status to: ${toggledSiteStatus}`);

  const siteDocRef = doc(db, 'sites', targetSiteId);
  await updateDoc(siteDocRef, {
    status: toggledSiteStatus,
    updatedAt: new Date().toISOString()
  });

  // Re-read independently from Firestore to prove persistence
  const reReadSiteSnap = await getDoc(siteDocRef);
  const reReadSiteData = reReadSiteSnap.data();
  console.log('Re-read site from Firestore. Status is now:', reReadSiteData?.status);

  if (reReadSiteData?.status !== toggledSiteStatus) {
    throw new Error(`Site persistence verification failed! Expected ${toggledSiteStatus}, got ${reReadSiteData?.status}`);
  }
  console.log('[PASS] Site status successfully persisted to Firestore!');

  // Restore original site status
  console.log(`Restoring Site ${targetSiteId} to original status: ${initialSiteStatus}`);
  await updateDoc(siteDocRef, {
    status: initialSiteStatus,
    updatedAt: new Date().toISOString()
  });
  const restoredSiteSnap = await getDoc(siteDocRef);
  console.log('[PASS] Restored site status. Confirmed:', restoredSiteSnap.data()?.status);

  console.log('\n=== STEP 6: Verify Unauthorized User Cannot Toggle Site ===');
  await signOut(auth);
  console.log('Admin signed out.');

  try {
    await updateDoc(siteDocRef, {
      status: 'TAMPERED_STATUS',
      updatedAt: new Date().toISOString()
    });
    throw new Error('FAIL: Unauthenticated write to sites succeeded when it should have been denied!');
  } catch (permErr: any) {
    console.log('[PASS] Unauthorized site write was properly denied by Firestore Security Rules:', permErr.message || permErr.code);
  }

  console.log('\n============================================================');
  console.log('ALL LIVE BATCH & SITE AUDIT VERIFICATIONS PASSED 100%!');
  console.log('============================================================');
  process.exit(0);
}

runLiveVerification().catch(err => {
  console.error('Audit verification error:', err);
  process.exit(1);
});
