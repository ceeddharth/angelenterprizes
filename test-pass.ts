import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const auth = getAuth(app);

async function test() {
  try {
    await createUserWithEmailAndPassword(auth, 'testworker' + Date.now() + '@gmail.com', '123456');
    console.log('Success with 123456');
  } catch (e: any) {
    console.log('Error with 123456:', e.code, e.message);
  }
}
test();
