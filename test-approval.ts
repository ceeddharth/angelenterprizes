import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, runTransaction } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  console.log('Testing Admin login...');
  let userCred;
  try {
    userCred = await signInWithEmailAndPassword(auth, 'admin@civilworkforce.gov', 'Admin@123456');
    console.log('Admin signed in:', userCred.user.uid);
  } catch (err: any) {
    console.log('Sign in failed:', err.message);
    try {
      userCred = await createUserWithEmailAndPassword(auth, 'admin@civilworkforce.gov', 'Admin@123456');
      console.log('Admin created:', userCred.user.uid);
    } catch (createErr: any) {
      console.error('Create admin failed:', createErr.message);
      return;
    }
  }

  const uid = userCred.user.uid;
  const userDocRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userDocRef);
  console.log('Admin profile exists:', userSnap.exists());
  if (!userSnap.exists() || userSnap.data()?.role !== 'ADMIN' || userSnap.data()?.status !== 'ACTIVE') {
    await setDoc(userDocRef, {
      uid,
      email: 'admin@civilworkforce.gov',
      role: 'ADMIN',
      status: 'ACTIVE',
      fullName: 'Site Administrator',
      createdAt: new Date().toISOString()
    });
    console.log('Admin user document created/updated');
  }

  // Check pending registrations
  const regSnap = await getDocs(query(collection(db, 'workerRegistrations'), where('status', '==', 'PENDING')));
  console.log('Pending registrations found:', regSnap.size);
  regSnap.forEach(d => {
    console.log(' - Reg ID:', d.id, d.data().submittedData?.fullName);
  });

  // Test counter read & write
  console.log('Testing counter read /counters/workerId...');
  try {
    const counterRef = doc(db, 'counters', 'workerId');
    const cSnap = await getDoc(counterRef);
    console.log('Counter exists:', cSnap.exists(), cSnap.data());
  } catch (cErr: any) {
    console.error('Counter read failed:', cErr.message);
  }

  // Test transaction on counter
  console.log('Testing counter transaction...');
  try {
    const counterRef = doc(db, 'counters', 'workerId');
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const curr = snap.exists() ? (snap.data().currentId || 1000) : 1000;
      tx.set(counterRef, { currentId: curr, updatedAt: new Date().toISOString() }, { merge: true });
    });
    console.log('Counter transaction succeeded!');
  } catch (txErr: any) {
    console.error('Counter transaction failed:', txErr.message);
  }
}

run().catch(console.error);
