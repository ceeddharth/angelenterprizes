import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  deleteUser,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

async function runTest() {
  const testEmail = `verify.worker.${Date.now()}@civilworkforce.test`;
  const testPin = 'WorkerPin@123';
  const testWorkerId = `W-${Math.floor(1000 + Math.random() * 9000)}`;

  console.log('=== TEST 1: Worker Auth Creation and Authenticated Firestore Writes ===');
  console.log('Creating worker auth account:', testEmail);

  let workerCred;
  try {
    workerCred = await createUserWithEmailAndPassword(auth, testEmail, testPin);
    console.log('Auth user created successfully, UID:', workerCred.user.uid);
  } catch (err: any) {
    console.error('Auth creation failed:', err.message);
    process.exit(1);
  }

  const workerUid = workerCred.user.uid;

  // Verify auth.currentUser is populated
  console.log('Current authenticated user is:', auth.currentUser?.uid);

  // Write users/{workerUid} with status PENDING while authenticated
  console.log('Writing users/' + workerUid + ' while authenticated...');
  const userDocRef = doc(db, 'users', workerUid);
  try {
    await setDoc(userDocRef, {
      uid: workerUid,
      role: 'WORKER',
      name: 'Test Verification Worker',
      email: testEmail,
      phone: '9876543210',
      status: 'PENDING',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    console.log('users doc created successfully while authenticated!');
  } catch (err: any) {
    console.error('Failed to create users doc:', err.message);
    process.exit(1);
  }

  // Write workerRegistrations/{regId} with status PENDING while authenticated
  const regId = `REG-TEST-${Date.now()}`;
  console.log('Writing workerRegistrations/' + regId + ' while authenticated...');
  const regDocRef = doc(db, 'workerRegistrations', regId);
  try {
    await setDoc(regDocRef, {
      registrationId: regId,
      workerId: testWorkerId,
      submittedData: {
        fullName: 'Test Verification Worker',
        dateOfBirth: '1995-01-01',
        phone: '9876543210',
        email: testEmail,
        address: 'Site Camp 4',
        emergencyContactName: 'Family',
        emergencyContactPhone: '9876543211',
        workerId: testWorkerId,
        batchNumber: 'B-01',
        jobRole: 'Mason',
        siteId: 'SITE-101',
        joiningDate: '2026-10-15',
        dailyWage: 850.0
      },
      status: 'PENDING',
      submittedAt: Timestamp.now(),
      reviewedAt: null,
      reviewedBy: null
    });
    console.log('workerRegistrations doc created successfully while authenticated!');
  } catch (err: any) {
    console.error('Failed to create workerRegistrations doc:', err.message);
    process.exit(1);
  }

  // Now sign out, exactly as RegistrationRepository does upon completing the writes
  console.log('Signing out worker after writes complete...');
  await signOut(auth);
  console.log('Worker signed out. auth.currentUser is now:', auth.currentUser);

  console.log('\n=== TEST 2: Admin Reads Pending Registrations ===');
  // Sign in as Admin
  await signInWithEmailAndPassword(auth, 'admin@civilworkforce.gov', 'Admin@123456');
  console.log('Admin signed in:', auth.currentUser?.email);

  const pendingQuery = query(
    collection(db, 'workerRegistrations'),
    where('status', '==', 'PENDING')
  );
  const pendingSnap = await getDocs(pendingQuery);
  console.log('Total pending registrations found by Admin:', pendingSnap.size);

  const foundTestReg = pendingSnap.docs.find(d => d.id === regId);
  if (!foundTestReg) {
    console.error('FAIL: Test registration was not found in Admin pending registrations list!');
    process.exit(1);
  }
  console.log('SUCCESS: Admin successfully queried and found test registration:', foundTestReg.id, foundTestReg.data().submittedData?.fullName);

  console.log('\n=== TEST 3: Cleanup Test Artifacts ===');
  await deleteDoc(regDocRef);
  await deleteDoc(userDocRef);
  console.log('Firestore test documents deleted.');

  // Clean up Auth user
  await signOut(auth);
  await signInWithEmailAndPassword(auth, testEmail, testPin);
  if (auth.currentUser) {
    await deleteUser(auth.currentUser);
    console.log('Test Auth account deleted cleanly.');
  }

  console.log('\n=== ALL REGISTRATION WORKFLOW TESTS PASSED PERFECTLY ===');
  process.exit(0);
}

runTest().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
