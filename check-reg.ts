import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function check() {
  const d = await getDoc(doc(db, 'workerRegistrations', 'REG-602930'));
  console.log('Doc exists:', d.exists(), d.data());
}
check();
