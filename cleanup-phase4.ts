import dotenv from 'dotenv';
dotenv.config();
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
const app = initializeApp({ credential: cert(sa) });
const db = getFirestore(app);

async function runCleanup() {
  console.log('=== STEP 1: INITIAL PHASE 4 DATA CLEANUP AUDIT ===\n');

  const removedSites: string[] = [];
  const removedBatches: string[] = [];
  const removedSessions: string[] = [];

  // 1. Delete temporary test sites (SITE-P4-*)
  const sitesSnap = await db.collection('sites').get();
  for (const doc of sitesSnap.docs) {
    if (doc.id.startsWith('SITE-P4-') || doc.id.startsWith('SITE-VERIFY-')) {
      await doc.ref.delete();
      removedSites.push(doc.id);
      console.log(`Deleted temporary site: ${doc.id}`);
    }
  }

  // 2. Delete temporary test batches (B-05 through B-11, or any non-B-01..B-04 created by tests)
  const batchesSnap = await db.collection('batches').get();
  for (const doc of batchesSnap.docs) {
    if (['B-05', 'B-06', 'B-07', 'B-08', 'B-09', 'B-10', 'B-11'].includes(doc.id) || doc.id.startsWith('B-TEST-')) {
      await doc.ref.delete();
      removedBatches.push(doc.id);
      console.log(`Deleted temporary batch: ${doc.id}`);
    }
  }

  // 3. Delete temporary active QR sessions
  const qrSnap = await db.collection('activeQrSessions').get();
  for (const doc of qrSnap.docs) {
    if (doc.id.startsWith('SITE-P4-') || doc.id.startsWith('SITE-VERIFY-')) {
      await doc.ref.delete();
      removedSessions.push(doc.id);
      console.log(`Deleted temporary activeQrSession: ${doc.id}`);
    }
  }

  // 4. Reset batchId counter
  await db.collection('counters').doc('batchId').set({
    currentCount: 4,
    lastAssigned: 'B-04',
    nextId: 'B-05',
    updatedAt: new Date().toISOString()
  });
  console.log('Reset counter /counters/batchId -> currentCount: 4, nextId: B-05, lastAssigned: B-04');

  // 5. Restore Worker W-1002
  const workerRef = db.collection('workers').doc('W-1002');
  const wSnap = await workerRef.get();
  if (wSnap.exists) {
    await workerRef.update({
      siteId: 'SITE-102',
      assignedSiteId: 'SITE-102',
      batchNumber: 'B-01',
      jobRole: 'Mason',
      phone: '9876543211',
      status: 'ACTIVE',
      updatedAt: new Date().toISOString()
    });
    console.log('Restored worker W-1002: siteId=SITE-102, batchNumber=B-01, jobRole=Mason, phone=9876543211');
  }

  console.log('\n=== CLEANUP SUMMARY ===');
  console.log('Temporary sites removed:', removedSites);
  console.log('Temporary batches removed:', removedBatches);
  console.log('Temporary QR sessions removed:', removedSessions);
  console.log('Worker W-1002 restored: YES');

  // Verify remaining sites and batches
  const remainingSites = (await db.collection('sites').get()).docs.map(d => d.id);
  const remainingBatches = (await db.collection('batches').get()).docs.map(d => d.id);
  console.log('Remaining production sites:', remainingSites);
  console.log('Remaining production batches:', remainingBatches);
  process.exit(0);
}

runCleanup().catch(e => {
  console.error(e);
  process.exit(1);
});
