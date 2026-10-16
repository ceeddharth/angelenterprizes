import { FirebaseService } from './src/services/firebaseService';

async function test() {
  try {
    await FirebaseService.submitWorkerRegistration({
      fullName: 'Duplicate Worker',
      dateOfBirth: '1998-05-15',
      phone: '9876543210',
      email: 'admin@civilworkforce.gov', // already exists with different password!
      address: 'Test Site Camp',
      emergencyContactName: 'Family Contact',
      emergencyContactPhone: '9876543211',
      workerId: '',
      batchNumber: 'B-01',
      jobRole: 'Mason',
      siteId: 'SITE-101',
      joiningDate: '2026-09-28'
    }, 'Different@123456');
  } catch (e: any) {
    console.log('Error caught:', e.message);
  }
}
test();
