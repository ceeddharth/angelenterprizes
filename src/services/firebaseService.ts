import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import {
  AppUser,
  WorkerRecord,
  ConstructionSite,
  WorkerRegistrationRecord,
  WorkerRegistrationSubmission,
  DashboardStats,
  AttendanceRecord,
  ActiveQrSession,
  QrTokenResponse,
  ApplicationStatusInfo,
  BatchRecord,
  WorkforceDistribution,
  LeaveRequest,
  LeaveType,
  LeaveStatus,
  OvertimeRecord,
  OvertimeStatus,
  SalaryRecord,
  SalaryStatus,
  ReportType,
  ReportOverviewStats,
  AttendanceReportResponse,
  WorkforceReportResponse,
  LeaveReportResponse,
  OvertimeReportResponse,
  SalaryReportResponse,
  SecurityDashboardData,
  AiManagementInsightsResponse,
  AskOperationsAiResponse,
  SiteDeactivationImpact,
  SitePhotoMetadata,
  WorkerProfilePhoto
} from '../types';
import { validateIndianMobile, isValidEmail, normalizeEmail, isValidBatchId } from '../utils/validation';
import { processAndCompressImage } from '../utils/imageProcessor';

export class FirebaseService {
  // Collections
  private static usersCol = 'users';
  private static workersCol = 'workers';
  private static sitesCol = 'sites';
  private static regCol = 'workerRegistrations';
  private static attendanceCol = 'attendance';
  private static activeQrSessionsCol = 'activeQrSessions';
  private static batchesCol = 'batches';
  private static countersCol = 'counters';

  /**
   * Parse Firebase errors into friendly user messages while preserving detailed debugging information
   */
  static parseError(error: any): string {
    if (!error) return 'An unknown error occurred.';
    if (typeof error === 'string') return error;
    const code = error.code || error.error?.code || '';
    const message = error.message || error.error?.message || error.error || '';

    console.error('[Firebase Error Details]', { code, message, error });

    switch (code) {
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in provider is disabled in Firebase Authentication. Please enable Email/Password under Authentication > Sign-in method in Firebase Console.';
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Invalid credentials. Please check your email and password.';
      case 'auth/email-already-in-use':
        return 'An account with this email is already registered. Please sign in or use another email.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters long.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/network-request-failed':
        return 'Network connection failed. Please check your internet connection.';
      case 'auth/too-many-requests':
        return 'Too many login attempts. Access is temporarily disabled. Try again shortly.';
      case 'permission-denied':
        return message ? `Access denied (permission-denied): ${message}` : 'Access denied. You do not have permission for this operation in Firestore.';
      case 'unauthenticated':
        return 'Authentication required. Please sign in with an authorized account to proceed.';
      case 'unavailable':
        return 'The workforce database service is temporarily unavailable. Please retry.';
      default:
        return message || (code ? `Firebase error (${code})` : 'Operation could not be completed. Please try again.');
    }
  }

  /**
   * 1. ADMIN AUTHENTICATION
   * Email/password authentication, validates role = ADMIN or SITE_SUPERVISOR from Firestore.
   */
  static async loginAdmin(email: string, password: string): Promise<{ user: FirebaseUser; profile: AppUser }> {
    if (!isValidEmail(email)) {
      throw new Error('Please enter a valid administrator email address (max 254 characters).');
    }
    const cleanEmail = normalizeEmail(email);

    let userCred: any;
    try {
      userCred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (err: any) {
      throw new Error(this.parseError(err));
    }

    const uid = userCred.user.uid;
    const userDocRef = doc(db, this.usersCol, uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      await signOut(auth);
      throw new Error('No administrator profile found in database. Access denied.');
    }

    const profile = userDocSnap.data() as AppUser;
    const isRoleAdmin = profile.role === 'ADMIN' || (profile.role as string) === 'SITE_SUPERVISOR';

    if (!isRoleAdmin) {
      await signOut(auth);
      throw new Error('Access denied. This portal is strictly restricted to site administrators.');
    }

    if (profile.status !== 'ACTIVE') {
      await signOut(auth);
      throw new Error('Your administrator account is currently suspended or inactive.');
    }

    return { user: userCred.user, profile: { ...profile, uid } };
  }

  /**
   * 1. WORKER AUTHENTICATION
   * Worker enters Worker ID, Phone, or Email + Security PIN/Password.
   */
  static async loginWorker(identifier: string, pin: string): Promise<{ user: FirebaseUser; worker: WorkerRecord }> {
    const cleanId = identifier.trim();
    const upperId = cleanId.toUpperCase();

    // 1. Locate the worker record from Firestore workers collection or users collection
    let targetEmail = '';
    let targetWorkerId = '';

    // Direct resolution for standard formats or email
    if (cleanId.includes('@')) {
      targetEmail = cleanId;
    } else if (/^W-\d+$/i.test(upperId)) {
      targetEmail = `worker.${upperId.toLowerCase().replace(/[^a-z0-9]/g, '')}@civilworkforce.gov`;
      targetWorkerId = upperId;
    }

    // Direct document lookup by Worker ID (e.g. workers/W-1002, workers/W-22, workers/W-1003) if not yet resolved
    if (!targetEmail) {
      try {
        const directWorkerDoc = await getDoc(doc(db, this.workersCol, upperId));
        if (directWorkerDoc.exists()) {
          const wData = directWorkerDoc.data() as WorkerRecord;
          targetEmail = wData.email;
          targetWorkerId = wData.workerId || upperId;
        }
      } catch (e) {
        // Continue to query or pattern match
      }
    }

    // Check by Worker ID query (case-insensitive fallback)
    if (!targetEmail) {
      try {
        const workerQuery = query(collection(db, this.workersCol), where('workerId', '==', upperId));
        const workerSnap = await getDocs(workerQuery);
        if (!workerSnap.empty) {
          const wData = workerSnap.docs[0].data() as WorkerRecord;
          targetEmail = wData.email;
          targetWorkerId = wData.workerId;
        }
      } catch (e) {
        // Continue
      }
    }

    if (!targetEmail) {
      try {
        const origQuery = query(collection(db, this.workersCol), where('workerId', '==', cleanId));
        const origSnap = await getDocs(origQuery);
        if (!origSnap.empty) {
          const wData = origSnap.docs[0].data() as WorkerRecord;
          targetEmail = wData.email;
          targetWorkerId = wData.workerId;
        }
      } catch (e) {
        // Continue
      }
    }

    // Check users collection by workerId
    if (!targetEmail) {
      try {
        const userWQuery = query(collection(db, this.usersCol), where('workerId', '==', upperId));
        const userWSnap = await getDocs(userWQuery);
        if (!userWSnap.empty) {
          const uData = userWSnap.docs[0].data() as AppUser;
          targetEmail = uData.email;
          targetWorkerId = uData.workerId || upperId;
        }
      } catch (e) {
        // Continue
      }
    }

    if (!targetEmail) {
      // Check by Phone number
      try {
        const phoneQuery = query(collection(db, this.workersCol), where('phone', '==', cleanId));
        const phoneSnap = await getDocs(phoneQuery);
        if (!phoneSnap.empty) {
          const wData = phoneSnap.docs[0].data() as WorkerRecord;
          targetEmail = wData.email;
          targetWorkerId = wData.workerId;
        }
      } catch (e) {
        // Continue
      }
    }

    if (!targetEmail) {
      // Also check pending registrations to give accurate feedback
      try {
        const regQuery = query(collection(db, this.regCol), where('assignedWorkerId', '==', upperId));
        const regSnap = await getDocs(regQuery);
        if (!regSnap.empty) {
          const rData = regSnap.docs[0].data() as WorkerRegistrationRecord;
          if (rData.status === 'PENDING') {
            throw new Error('Your worker registration is currently PENDING verification by site supervisors. Please wait for approval before signing in.');
          } else if (rData.status === 'REJECTED') {
            throw new Error('Your worker registration was not approved. Please contact the site supervisor.');
          }
        }
      } catch (err: any) {
        if (err?.message?.includes('registration')) throw err;
      }

      try {
        const phoneRegQuery = query(collection(db, this.regCol), where('submittedData.phone', '==', cleanId));
        const phoneRegSnap = await getDocs(phoneRegQuery);
        if (!phoneRegSnap.empty) {
          const rData = phoneRegSnap.docs[0].data() as WorkerRegistrationRecord;
          if (rData.status === 'PENDING') {
            throw new Error('Your worker registration is currently PENDING verification by site supervisors. Please wait for approval before signing in.');
          } else if (rData.status === 'REJECTED') {
            throw new Error('Your worker registration was not approved. Please contact the site supervisor.');
          }
        }
      } catch (err: any) {
        if (err?.message?.includes('registration')) throw err;
      }

      throw new Error(`No registered worker found with identifier '${cleanId}'. Please complete First-Time Registration.`);
    }

    if (!targetEmail) {
      throw new Error(`Unable to resolve registered login credentials for '${cleanId}'.`);
    }

    // 2. Perform real Firebase Authentication
    let userCred: any;
    try {
      userCred = await signInWithEmailAndPassword(auth, targetEmail.toLowerCase(), pin);
    } catch (err: any) {
      throw new Error(this.parseError(err));
    }

    // 3. Verify user document role and status
    const uid = userCred.user.uid;
    const userDocRef = doc(db, this.usersCol, uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const uData = userDocSnap.data() as AppUser;
      if (uData.status === 'PENDING') {
        await signOut(auth);
        throw new Error('Your account is currently PENDING approval by site supervisors. Access is restricted.');
      }
      if (uData.status === 'SUSPENDED') {
        await signOut(auth);
        throw new Error('Your worker profile has been suspended by site management.');
      }
      if (uData.status === 'REJECTED') {
        await signOut(auth);
        throw new Error('Your worker registration was rejected by site management.');
      }
    }

    // 4. Retrieve Worker Record
    let workerRecord: WorkerRecord | null = null;
    if (targetWorkerId) {
      const wDoc = await getDoc(doc(db, this.workersCol, targetWorkerId));
      if (wDoc.exists()) {
        workerRecord = wDoc.data() as WorkerRecord;
      }
    }

    if (!workerRecord) {
      // Find worker by UID
      const uidWorkerQuery = query(collection(db, this.workersCol), where('uid', '==', uid));
      const uidWorkerSnap = await getDocs(uidWorkerQuery);
      if (!uidWorkerSnap.empty) {
        workerRecord = uidWorkerSnap.docs[0].data() as WorkerRecord;
      }
    }

    if (!workerRecord) {
      await signOut(auth);
      throw new Error('Active worker profile not found. Please contact your site supervisor.');
    }

    if (workerRecord.status === 'SUSPENDED') {
      await signOut(auth);
      throw new Error('This worker profile has been suspended by site management.');
    }

    if (workerRecord.status === 'REJECTED') {
      await signOut(auth);
      throw new Error('This worker profile has been rejected by site management.');
    }

    if (workerRecord.status === 'PENDING') {
      await signOut(auth);
      throw new Error('Your worker registration is currently PENDING verification by site supervisors. Please wait for approval before signing in.');
    }

    return { user: userCred.user, worker: workerRecord };
  }

  /**
   * 3. WORKER REGISTRATION
   * - Worker does NOT choose or enter a Worker ID.
   * - Worker selects an assigned cohort from active Batches (B-01, B-02...).
   * - Account created in Firebase Auth.
   * - WorkerRegistration record created with status = PENDING and assignedWorkerId = null.
   * - User record created with status = PENDING.
   * - Signs out user immediately so no unapproved access is granted.
   */
  static async submitWorkerRegistration(
    data: WorkerRegistrationSubmission,
    passwordPin: string
  ): Promise<string> {
    // 1. Validation
    if (!data.fullName.trim()) throw new Error('Full legal name is required.');
    
    const phoneRes = validateIndianMobile(data.phone);
    if (!phoneRes.isValid) {
      throw new Error(phoneRes.errorMessage || 'Invalid Indian mobile number.');
    }
    const cleanPhone = phoneRes.normalized;

    let cleanEmergencyPhone = cleanPhone;
    if (data.emergencyContactPhone && data.emergencyContactPhone.trim()) {
      const emergencyRes = validateIndianMobile(data.emergencyContactPhone);
      if (!emergencyRes.isValid) {
        throw new Error(`Emergency contact phone: ${emergencyRes.errorMessage || 'Invalid mobile number.'}`);
      }
      cleanEmergencyPhone = emergencyRes.normalized;
    }

    if (!isValidEmail(data.email)) {
      throw new Error('A valid email address (maximum 254 characters) is required.');
    }
    if (!data.siteId.trim()) throw new Error('Please select an assigned construction site.');
    if (!data.batchNumber || !data.batchNumber.trim()) {
      throw new Error('Please select an assigned Workforce Batch from the active dropdown list.');
    }
    if (!data.jobRole.trim()) throw new Error('Job trade/role is required.');
    if (!passwordPin || passwordPin.length < 6) throw new Error('Security PIN/password must be at least 6 characters.');

    const cleanBatchNumber = data.batchNumber.trim();
    const cleanEmail = normalizeEmail(data.email);

    // 2. Create or Link Firebase Authentication Account
    let authUid = '';
    try {
      const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, passwordPin);
      authUid = userCred.user.uid;

      // 3. Create User profile document with status = PENDING (workerId empty until Admin approval)
      try {
        const userDocRef = doc(db, this.usersCol, authUid);
        const userProfile: AppUser = {
          uid: authUid,
          email: cleanEmail,
          role: 'WORKER',
          status: 'PENDING',
          workerId: '',
          fullName: data.fullName.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDoc(userDocRef, userProfile);
      } catch (userDocErr) {
        console.warn('Notice: Worker user profile creation in users collection deferred or restricted:', userDocErr);
      }
    } catch (authErr: any) {
      if (authErr.code === 'auth/email-already-in-use') {
        try {
          const signInCred = await signInWithEmailAndPassword(auth, cleanEmail, passwordPin);
          authUid = signInCred.user.uid;
        } catch {
          throw new Error('An account with this email is already registered with a different security PIN/password. Please sign in or use another email.');
        }
      } else if (authErr.code === 'auth/operation-not-allowed') {
        throw new Error(
          'Email/Password sign-in provider is disabled in Firebase Authentication. Please enable Email/Password under Authentication > Sign-in method in Firebase Console.'
        );
      } else {
        throw new Error(this.parseError(authErr));
      }
    }

    try {
      // 4. Create Registration Document in workerRegistrations/{registrationId}
      // Note: Worker ID is not specified by the applicant; it will be atomically assigned on Admin approval
      const regId = `REG-${Math.floor(100000 + Math.random() * 900000)}`;
      const regDocRef = doc(db, this.regCol, regId);
      const regRecord: WorkerRegistrationRecord = {
        registrationId: regId,
        workerId: '',
        submittedData: {
          fullName: data.fullName.trim(),
          dateOfBirth: data.dateOfBirth?.trim() || '1995-01-01',
          phone: cleanPhone,
          email: cleanEmail,
          address: data.address?.trim() || 'Civil site quarters',
          emergencyContactName: data.emergencyContactName?.trim() || 'Family',
          emergencyContactPhone: cleanEmergencyPhone,
          workerId: '',
          batchNumber: cleanBatchNumber,
          jobRole: data.jobRole.trim(),
          siteId: data.siteId.trim(),
          joiningDate: data.joiningDate?.trim() || new Date().toISOString().split('T')[0]
        },
        status: 'PENDING',
        submittedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewedBy: null
      };
      await setDoc(regDocRef, regRecord);

      // 5. Sign out user immediately so pending applicants cannot access protected worker routes
      if (auth.currentUser) {
        await signOut(auth);
      }

      return regId;
    } catch (err: any) {
      if (auth.currentUser) {
        await signOut(auth);
      }
      throw new Error(this.parseError(err));
    }
  }

  /**
   * 4. BATCH MANAGEMENT (Admin-Controlled)
   */

  /**
   * Retrieve all batches ordered by batchId
   */
  static async getBatches(): Promise<BatchRecord[]> {
    // 1. Prefer trusted backend API
    try {
      const res = await fetch('/api/batches');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.batches) && data.batches.length > 0) {
          return data.batches;
        }
      }
    } catch (err) {
      console.warn('[firebaseService] /api/batches fetch error, using Firestore fallback:', err);
    }

    // 2. Direct Firestore fallback
    try {
      const q = collection(db, this.batchesCol);
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ batchId: d.id, ...d.data() } as BatchRecord));
      return list.sort((a, b) => a.batchId.localeCompare(b.batchId, undefined, { numeric: true }));
    } catch (err) {
      console.warn('Could not fetch batches from Firestore:', err);
      return [];
    }
  }

  /**
   * Retrieve active batches for registration dropdown selection
   */
  static async getActiveBatches(): Promise<BatchRecord[]> {
    try {
      const batches = await this.getBatches();
      const active = batches.filter((b) => b.status === 'ACTIVE');
      if (active.length === 0) {
        return await this.ensureDefaultBatches();
      }
      return active;
    } catch (err) {
      console.warn('Could not fetch active batches:', err);
      return [];
    }
  }

  /**
   * Ensure default batches exist in Firestore (B-01, B-02, B-03, B-04)
   */
  static async ensureDefaultBatches(): Promise<BatchRecord[]> {
    try {
      const q = collection(db, this.batchesCol);
      const snap = await getDocs(q);
      if (!snap.empty) {
        const list = snap.docs.map((d) => d.data() as BatchRecord);
        return list.filter((b) => b.status === 'ACTIVE');
      }

      const defaults: Array<Omit<BatchRecord, 'createdAt'>> = [
        {
          batchId: 'B-01',
          name: 'Foundation & Structural',
          description: 'Civil earthwork, piling, rebar, concrete pouring, and structural framing',
          status: 'ACTIVE',
          createdByName: 'System Setup'
        },
        {
          batchId: 'B-02',
          name: 'Civil & Masonry',
          description: 'Brick masonry, blockwork, plastering, scaffolding, and exterior walls',
          status: 'ACTIVE',
          createdByName: 'System Setup'
        },
        {
          batchId: 'B-03',
          name: 'Electrical & MEP Services',
          description: 'Electrical conduits, power distribution, plumbing, HVAC, and fire systems',
          status: 'ACTIVE',
          createdByName: 'System Setup'
        },
        {
          batchId: 'B-04',
          name: 'Finishing, Tiling & Painting',
          description: 'Flooring, tiling, interior/exterior painting, waterproofing, and architectural glazing',
          status: 'ACTIVE',
          createdByName: 'System Setup'
        }
      ];

      const now = new Date().toISOString();
      const created: BatchRecord[] = [];
      for (const item of defaults) {
        const rec: BatchRecord = { ...item, createdAt: now, updatedAt: now };
        await setDoc(doc(db, this.batchesCol, item.batchId), rec);
        created.push(rec);
      }

      // Initialize atomic counter
      await setDoc(
        doc(db, this.countersCol, 'batchId'),
        {
          currentCount: defaults.length,
          nextId: `B-${String(defaults.length + 1).padStart(2, '0')}`,
          lastAssigned: `B-${String(defaults.length).padStart(2, '0')}`,
          updatedAt: now
        },
        { merge: true }
      );

      return created;
    } catch (e: any) {
      console.error('[FirebaseService.ensureDefaultBatches] Error ensuring default batches:', e);
      // Re-throw permission and security errors so callers are properly informed rather than falsely assuming success
      if (e?.code === 'permission-denied' || e?.message?.includes('Missing or insufficient permissions') || e?.message?.includes('PERMISSION_DENIED')) {
        throw new Error(this.parseError(e));
      }
      throw e;
    }
  }

  /**
   * CREATE WORKFORCE BATCH WITH CONCURRENCY-SAFE BATCH ID ALLOCATION
   * Sequential format: B-01, B-02, B-03...
   * Uses backend service or Firestore transaction.
   */
  static async createBatch(name: string, description: string, adminName: string): Promise<BatchRecord> {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Batch name is required.');
    const cleanDesc = (description || '').trim();

    // 1. Try server endpoint first
    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/admin/create-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ name: cleanName, description: cleanDesc, adminName })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.batch) return data.batch;
        }
      } catch (err) {
        console.warn('[firebaseService] /api/admin/create-batch error, attempting client fallback:', err);
      }
    }

    const counterRef = doc(db, this.countersCol, 'batchId');

    // Baseline fallback scan
    let fallbackCount = 0;
    try {
      const allBatches = await getDocs(collection(db, this.batchesCol));
      allBatches.forEach((b) => {
        const id = (b.data().batchId || b.id || '').toUpperCase();
        const m = id.match(/^B-(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && num > fallbackCount) {
            fallbackCount = num;
          }
        }
      });
    } catch (err) {
      console.warn('Could not scan existing batches:', err);
    }

    const createdBatch = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      let currentCount = fallbackCount;
      if (counterSnap.exists()) {
        const cData = counterSnap.data();
        if (typeof cData?.currentCount === 'number' && cData.currentCount >= fallbackCount) {
          currentCount = cData.currentCount;
        }
      }

      let nextNum = currentCount + 1;
      let candidateBatchId = `B-${String(nextNum).padStart(2, '0')}`;
      let batchDocRef = doc(db, this.batchesCol, candidateBatchId);
      let batchDocSnap = await transaction.get(batchDocRef);

      while (batchDocSnap.exists()) {
        nextNum++;
        candidateBatchId = `B-${String(nextNum).padStart(2, '0')}`;
        batchDocRef = doc(db, this.batchesCol, candidateBatchId);
        batchDocSnap = await transaction.get(batchDocRef);
      }

      const now = new Date().toISOString();
      const batchRecord: BatchRecord = {
        batchId: candidateBatchId,
        name: cleanName,
        description: cleanDesc,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        createdByName: adminName || 'Site Administrator'
      };

      transaction.set(
        counterRef,
        {
          currentCount: nextNum,
          nextId: `B-${String(nextNum + 1).padStart(2, '0')}`,
          lastAssigned: candidateBatchId,
          updatedAt: now
        },
        { merge: true }
      );

      transaction.set(batchDocRef, batchRecord);
      return batchRecord;
    });

    return createdBatch;
  }

  /**
   * Toggle Batch Active / Inactive status
   */
  static async toggleBatchStatus(batchId: string, newStatus: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    const cleanId = batchId.trim();
    if (!cleanId) {
      throw new Error('Batch ID is required.');
    }

    if (!auth.currentUser) {
      throw new Error('Authentication required to update workforce batch status.');
    }

    const idToken = await auth.currentUser.getIdToken();
    let res: Response;
    try {
      res = await fetch('/api/admin/toggle-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ batchId: cleanId, newStatus })
      });
    } catch (networkErr: any) {
      // Network transport error reaching backend - fallback to direct authenticated Firestore write
      console.warn('[firebaseService] Network error reaching /api/admin/toggle-batch, attempting direct authenticated Firestore write:', networkErr);
      const batchRef = doc(db, this.batchesCol, cleanId);
      await setDoc(batchRef, {
        batchId: cleanId,
        status: newStatus,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return;
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Server rejected batch update (HTTP ${res.status}).`);
    }
  }

  static async updateBatchStatus(batchId: string, newStatus: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    return this.toggleBatchStatus(batchId, newStatus);
  }

  /**
   * Edit Batch Name, Description, and Status
   */
  static async updateBatchDetails(batchId: string, updates: Partial<BatchRecord>): Promise<BatchRecord> {
    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/admin/update-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ batchId, updates })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.batch) return data.batch;
        }
      } catch (err) {
        console.warn('[firebaseService] /api/admin/update-batch error, falling back to client:', err);
      }
    }

    const batchRef = doc(db, this.batchesCol, batchId);
    const sanitized: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (updates.name !== undefined) sanitized.name = updates.name.trim();
    if (updates.description !== undefined) sanitized.description = updates.description.trim();
    if (updates.status !== undefined) sanitized.status = updates.status;
    await updateDoc(batchRef, sanitized);
    const snap = await getDoc(batchRef);
    return snap.data() as BatchRecord;
  }

  /**
   * 5. ADMIN PENDING REGISTRATIONS
   * Retrieve real pending registration documents from Firestore.
   */
  static async getPendingRegistrations(): Promise<WorkerRegistrationRecord[]> {
    const q = query(collection(db, this.regCol), where('status', '==', 'PENDING'));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => d.data() as WorkerRegistrationRecord);
    return list.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  }

  /**
   * APPROVE REGISTRATION WITH ATOMIC CONCURRENCY-SAFE WORKER ID ALLOCATION
   * - Format: strictly W-1001, W-1002, W-1003...
   * - Concurrency-safe: uses atomic backend transaction via Admin SDK, or fallback client transaction.
   * - Prevents collisions even under simultaneous approvals.
   * - Existing worker accounts (W-22, W-25, W-34, W-1002) are preserved without renaming.
   * - Atomically creates /workers/{workerId}.
   * - Updates /workerRegistrations/{regId} with assignedWorkerId and status ACTIVE.
   * - Updates linked /users/{uid} with workerId and status ACTIVE.
   */
  static async approveRegistration(registrationId: string, adminUid: string): Promise<WorkerRecord> {
    // 1. Attempt trusted Server-Authoritative Approval API
    // This executes securely using Firebase Admin credentials and bypasses client permission blocks on /counters
    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/admin/approve-registration', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ registrationId, adminUid })
        });

        const data = await res.json();
        if (res.ok && data.success && data.worker) {
          console.log('[firebaseService] Approved via backend service. Assigned Worker ID:', data.workerId);
          return data.worker;
        } else if (data.error) {
          console.warn('[firebaseService] Backend approval returned error:', data.error);
          throw new Error(data.error);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch') && !err.message.includes('Failed to fetch')) {
          // If server explicitly returned a logic error (e.g. already approved), rethrow it
          throw err;
        }
        console.warn('[firebaseService] Server approval API unavailable, attempting client Firestore transaction:', err);
      }
    }

    // 2. Direct Firestore transaction fallback
    const regDocRef = doc(db, this.regCol, registrationId);
    const counterRef = doc(db, this.countersCol, 'workerId');

    // Initial lookup of registration document
    const regSnapCheck = await getDoc(regDocRef);
    if (!regSnapCheck.exists()) {
      throw new Error('Registration record not found.');
    }
    const initialReg = regSnapCheck.data() as WorkerRegistrationRecord;
    if (initialReg.status === 'ACTIVE' || initialReg.status === 'APPROVED') {
      throw new Error('This registration has already been approved.');
    }

    // Pre-query user document by email to obtain DocumentReference for transaction
    let userDocRef: any = null;
    let existingUid = '';
    const userQuery = query(collection(db, this.usersCol), where('email', '==', initialReg.submittedData.email.toLowerCase()));
    const userQuerySnap = await getDocs(userQuery);
    if (!userQuerySnap.empty) {
      existingUid = userQuerySnap.docs[0].id;
      userDocRef = doc(db, this.usersCol, existingUid);
    }

    // Scan existing workers to find highest numerical suffix (e.g. W-1002 -> 1002)
    let fallbackMaxNum = 1000;
    try {
      const allWorkersSnap = await getDocs(collection(db, this.workersCol));
      allWorkersSnap.forEach((w) => {
        const id = (w.data().workerId || w.id || '').toUpperCase();
        const m = id.match(/^W-(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && num > fallbackMaxNum) {
            fallbackMaxNum = num;
          }
        }
      });
    } catch (err) {
      console.warn('Could not scan existing workers for max ID:', err);
    }

    const resultWorker = await runTransaction(db, async (transaction) => {
      // READ 1: Registration document inside transaction
      const txRegSnap = await transaction.get(regDocRef);
      if (!txRegSnap.exists()) {
        throw new Error('Registration record not found during transaction.');
      }
      const regData = txRegSnap.data() as WorkerRegistrationRecord;
      if (regData.status === 'ACTIVE' || regData.status === 'APPROVED') {
        throw new Error('This registration was already approved by another administrator.');
      }

      // READ 2: Counter document
      let currentNum = fallbackMaxNum;
      try {
        const txCounterSnap = await transaction.get(counterRef);
        if (txCounterSnap.exists()) {
          const cData = txCounterSnap.data();
          if (typeof cData?.currentId === 'number' && cData.currentId >= fallbackMaxNum) {
            currentNum = cData.currentId;
          }
        }
      } catch (counterReadErr: any) {
        console.warn('Counter read in transaction failed:', counterReadErr);
        throw counterReadErr;
      }

      // Compute next candidate Worker ID (W-1001, W-1002, W-1003...)
      let nextNum = currentNum + 1;
      let candidateWorkerId = `W-${nextNum}`;

      // READ 3: Check candidate worker document doesn't already exist
      let candidateWorkerRef = doc(db, this.workersCol, candidateWorkerId);
      let candidateWorkerSnap = await transaction.get(candidateWorkerRef);
      while (candidateWorkerSnap.exists()) {
        nextNum++;
        candidateWorkerId = `W-${nextNum}`;
        candidateWorkerRef = doc(db, this.workersCol, candidateWorkerId);
        candidateWorkerSnap = await transaction.get(candidateWorkerRef);
      }

      // READ 4: User document if known
      if (userDocRef) {
        await transaction.get(userDocRef);
      }

      // ALL READS COMPLETE. PERFORM WRITES:
      const now = new Date().toISOString();
      const sub = regData.submittedData;

      // WRITE 1: Advance counter document
      transaction.set(
        counterRef,
        {
          currentId: nextNum,
          nextId: nextNum + 1,
          lastAssigned: candidateWorkerId,
          updatedAt: now
        },
        { merge: true }
      );

      // WRITE 2: Create new worker document in /workers/{candidateWorkerId}
      const newWorkerRecord: WorkerRecord = {
        workerId: candidateWorkerId,
        uid: existingUid,
        fullName: sub.fullName,
        phone: sub.phone,
        email: sub.email,
        batchNumber: sub.batchNumber || 'B-01',
        jobRole: sub.jobRole,
        siteId: sub.siteId,
        dateOfBirth: sub.dateOfBirth,
        address: sub.address,
        emergencyContactName: sub.emergencyContactName,
        emergencyContactPhone: sub.emergencyContactPhone,
        joiningDate: sub.joiningDate,
        status: 'ACTIVE',
        createdAt: regData.submittedAt || now,
        updatedAt: now
      };
      transaction.set(candidateWorkerRef, newWorkerRecord);

      // WRITE 3: Update registration record with assigned Worker ID and ACTIVE status
      transaction.update(regDocRef, {
        status: 'ACTIVE',
        assignedWorkerId: candidateWorkerId,
        workerId: candidateWorkerId,
        reviewedAt: now,
        reviewedBy: adminUid || 'admin'
      });

      // WRITE 4: Update user profile document if present
      if (userDocRef) {
        transaction.update(userDocRef, {
          role: 'WORKER',
          status: 'ACTIVE',
          workerId: candidateWorkerId,
          updatedAt: now
        });
      }

      return newWorkerRecord;
    });

    return resultWorker;
  }

  /**
   * REJECT REGISTRATION
   * 1. Requires rejection reason explaining decision to applicant.
   * 2. Calls trusted server endpoint /api/admin/reject-registration (with direct Firestore fallback).
   * 3. Stores rejectionReason, reviewedAt, reviewedBy in workerRegistrations.
   * 4. Updates linked user profile and triggers push notification.
   */
  static async rejectRegistration(registrationId: string, adminUid: string, rejectionReason: string): Promise<void> {
    const cleanReason = (rejectionReason || '').trim() || 'Application does not meet current verification criteria.';

    // 1. Prefer Server-Authoritative Admin API
    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/admin/reject-registration', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ registrationId, rejectionReason: cleanReason, adminUid })
        });
        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          if (json.success) return;
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errData.error) throw new Error(errData.error);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) throw err;
        console.warn('[firebaseService] /api/admin/reject-registration note, attempting direct Firestore update:', err);
      }
    }

    // 2. Direct Firestore fallback
    const regDocRef = doc(db, this.regCol, registrationId);
    const now = new Date().toISOString();

    await updateDoc(regDocRef, {
      status: 'REJECTED',
      rejectionReason: cleanReason,
      reviewedAt: now,
      reviewedBy: adminUid || 'admin'
    });

    // Also update matching user record if exists
    const regSnap = await getDoc(regDocRef);
    if (regSnap.exists()) {
      const reg = regSnap.data() as WorkerRegistrationRecord;
      if (reg.submittedData?.email) {
        const userQuery = query(collection(db, this.usersCol), where('email', '==', reg.submittedData.email.toLowerCase()));
        const userSnap = await getDocs(userQuery);
        if (!userSnap.empty) {
          await updateDoc(doc(db, this.usersCol, userSnap.docs[0].id), {
            status: 'REJECTED',
            updatedAt: now
          });
        }
      }
    }
  }

  /**
   * 5. ADMIN DASHBOARD STATS
   * Real Firestore queries for dashboard statistics.
   */
  static async getDashboardStats(): Promise<DashboardStats> {
    // Total Workers
    const workersSnap = await getDocs(collection(db, this.workersCol));
    const totalWorkers = workersSnap.size;
    let activeWorkers = 0;
    workersSnap.forEach((d) => {
      if ((d.data() as WorkerRecord).status === 'ACTIVE') {
        activeWorkers++;
      }
    });

    // Pending Registrations
    const pendingSnap = await getDocs(
      query(collection(db, this.regCol), where('status', '==', 'PENDING'))
    );
    const pendingRegistrations = pendingSnap.size;

    // Total Sites
    const sitesSnap = await getDocs(collection(db, this.sitesCol));
    const totalSites = sitesSnap.size;

    return {
      totalWorkers,
      activeWorkers,
      pendingRegistrations,
      totalSites
    };
  }

  /**
   * 6. WORKER LIST
   * Fetch all workers from Firestore workers collection.
   */
  static async getWorkers(): Promise<WorkerRecord[]> {
    const snap = await getDocs(collection(db, this.workersCol));
    return snap.docs.map((d) => d.data() as WorkerRecord);
  }

  /**
   * Get Worker Record by Firebase Auth UID
   */
  static async getWorkerByUid(uid: string): Promise<WorkerRecord | null> {
    const q = query(collection(db, this.workersCol), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data() as WorkerRecord;
  }

  /**
   * Update Worker Status (Activate / Suspend)
   */
  static async updateWorkerStatus(workerId: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<void> {
    const workerRef = doc(db, this.workersCol, workerId);
    await updateDoc(workerRef, {
      status,
      updatedAt: new Date().toISOString()
    });

    // Also update matching user record if linked
    const workerSnap = await getDoc(workerRef);
    if (workerSnap.exists()) {
      const wData = workerSnap.data() as WorkerRecord;
      if (wData.uid) {
        await updateDoc(doc(db, this.usersCol, wData.uid), {
          status: status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Update Worker Details & Authoritative Site/Batch Assignment
   */
  static async updateWorkerDetails(workerId: string, updates: Partial<WorkerRecord>): Promise<WorkerRecord> {
    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/admin/update-worker', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ workerId, updates })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.worker) return data.worker;
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errData.error) throw new Error(errData.error);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
        console.warn('[firebaseService] /api/admin/update-worker network note, attempting client fallback:', err);
      }
    }

    const workerRef = doc(db, this.workersCol, workerId);
    const sanitized: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (updates.siteId !== undefined) sanitized.siteId = updates.siteId.trim();
    if (updates.batchNumber !== undefined) sanitized.batchNumber = updates.batchNumber.trim();
    if (updates.jobRole !== undefined) sanitized.jobRole = updates.jobRole.trim();
    if (updates.status !== undefined) sanitized.status = updates.status;
    if (updates.fullName !== undefined) sanitized.fullName = updates.fullName.trim();
    if (updates.phone !== undefined) sanitized.phone = updates.phone.trim();
    if (updates.email !== undefined) sanitized.email = updates.email.trim().toLowerCase();
    if (updates.address !== undefined) sanitized.address = updates.address.trim();
    if (updates.emergencyContactName !== undefined) sanitized.emergencyContactName = updates.emergencyContactName.trim();
    if (updates.emergencyContactPhone !== undefined) sanitized.emergencyContactPhone = updates.emergencyContactPhone.trim();

    await updateDoc(workerRef, sanitized);

    if (sanitized.status) {
      const snap = await getDoc(workerRef);
      const wData = snap.data() as WorkerRecord;
      if (wData?.uid) {
        try {
          await updateDoc(doc(db, this.usersCol, wData.uid), {
            status: sanitized.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
            updatedAt: sanitized.updatedAt
          });
        } catch (uErr) {
          console.warn('Note: user doc status sync:', uErr);
        }
      }
    }

    const updatedSnap = await getDoc(workerRef);
    return updatedSnap.data() as WorkerRecord;
  }

  static async reassignWorker(workerId: string, newSiteId: string, newBatchId: string): Promise<WorkerRecord> {
    return this.updateWorkerDetails(workerId, { siteId: newSiteId, batchNumber: newBatchId });
  }

  /**
   * 7. SITES MANAGEMENT
   * Real Firestore sites collection operations.
   */
  static async getSites(): Promise<ConstructionSite[]> {
    const snap = await getDocs(collection(db, this.sitesCol));
    return snap.docs.map((d) => ({ siteId: d.id, ...d.data() } as ConstructionSite));
  }

  static async createSite(site: Omit<ConstructionSite, 'createdAt'>): Promise<ConstructionSite> {
    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/admin/create-site', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify(site)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.site) return data.site;
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errData.error) throw new Error(errData.error);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) throw err;
        console.warn('[firebaseService] /api/admin/create-site network note, using client fallback:', err);
      }
    }

    const siteRef = doc(db, this.sitesCol, site.siteId);
    const newSite: ConstructionSite = {
      ...site,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await setDoc(siteRef, newSite);
    return newSite;
  }

  static async updateSiteStatus(siteId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    await this.updateSiteDetails(siteId, { status });
  }

  static async updateSiteDetails(siteId: string, updates: Partial<ConstructionSite>): Promise<ConstructionSite> {
    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/admin/update-site', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ siteId, updates })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.site) return data.site;
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errData.error) throw new Error(errData.error);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) throw err;
        console.warn('[firebaseService] /api/admin/update-site network note, using client fallback:', err);
      }
    }

    const siteRef = doc(db, this.sitesCol, siteId);
    const sanitized: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (updates.siteName !== undefined) sanitized.siteName = updates.siteName.trim();
    if (updates.projectName !== undefined) sanitized.projectName = updates.projectName.trim();
    if (updates.address !== undefined) sanitized.address = updates.address.trim();
    if (updates.description !== undefined) sanitized.description = updates.description.trim();
    if (updates.status !== undefined) sanitized.status = updates.status;

    await updateDoc(siteRef, sanitized);
    const snap = await getDoc(siteRef);
    return snap.data() as ConstructionSite;
  }

  /**
   * Phase 4: Retrieve aggregated workforce distribution
   */
  static async getWorkforceDistribution(): Promise<WorkforceDistribution> {
    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/admin/workforce-distribution', {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.distribution) return data.distribution;
        }
      } catch (err) {
        console.warn('[firebaseService] /api/admin/workforce-distribution fetch note:', err);
      }
    }

    // Client-side computation fallback
    const [workersSnap, sitesSnap, batchesSnap, regSnap] = await Promise.all([
      getDocs(collection(db, this.workersCol)),
      getDocs(collection(db, this.sitesCol)),
      getDocs(collection(db, this.batchesCol)),
      getDocs(query(collection(db, this.regCol), where('status', '==', 'PENDING')))
    ]);

    const bySite: Record<string, { siteName: string; count: number; activeCount: number; suspendedCount: number }> = {};
    const byBatch: Record<string, { batchName: string; count: number; activeCount: number; suspendedCount: number }> = {};
    const byRole: Record<string, number> = {};
    const byStatus = { ACTIVE: 0, SUSPENDED: 0, PENDING: regSnap.size };

    sitesSnap.forEach((s) => {
      const d = s.data() as ConstructionSite;
      bySite[s.id] = { siteName: d.siteName || s.id, count: 0, activeCount: 0, suspendedCount: 0 };
    });

    batchesSnap.forEach((b) => {
      const d = b.data() as BatchRecord;
      byBatch[b.id] = { batchName: d.name || b.id, count: 0, activeCount: 0, suspendedCount: 0 };
    });

    workersSnap.forEach((docSnap) => {
      const w = docSnap.data() as WorkerRecord;
      const st = w.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED';
      if (st === 'ACTIVE') byStatus.ACTIVE++;
      else byStatus.SUSPENDED++;

      const sId = (w.siteId || (w as any).assignedSiteId || 'UNASSIGNED').trim();
      if (!bySite[sId]) {
        bySite[sId] = { siteName: sId, count: 0, activeCount: 0, suspendedCount: 0 };
      }
      bySite[sId].count++;
      if (st === 'ACTIVE') bySite[sId].activeCount++;
      else bySite[sId].suspendedCount++;

      const bId = (w.batchNumber || 'UNASSIGNED').trim();
      if (!byBatch[bId]) {
        byBatch[bId] = { batchName: bId, count: 0, activeCount: 0, suspendedCount: 0 };
      }
      byBatch[bId].count++;
      if (st === 'ACTIVE') byBatch[bId].activeCount++;
      else byBatch[bId].suspendedCount++;

      const role = (w.jobRole || 'General Labor').trim();
      byRole[role] = (byRole[role] || 0) + 1;
    });

    return {
      totalWorkers: workersSnap.size,
      bySite,
      byBatch,
      byRole,
      byStatus
    };
  }

  /**
   * Helper: Ensure default site exists in Firestore so registrations have a site available.
   * Only called when an Admin is authenticated.
   */
  static async ensureDefaultSites(): Promise<ConstructionSite[]> {
    const defaultSite: ConstructionSite = {
      siteId: 'SITE-101',
      siteName: 'Metro Transit Station - Phase 2',
      projectName: 'Civil Infrastructure Expansion',
      address: 'Sector 62, Metro Corridor North',
      description: 'Underground rail terminal civil engineering and structural framing works.',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };

    const currentSites = await this.getSites();
    if (currentSites.length === 0) {
      await setDoc(doc(db, this.sitesCol, defaultSite.siteId), defaultSite);
      return [defaultSite];
    }
    return currentSites;
  }

  public static getApiBaseUrl(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return '';
    }
    return 'http://localhost:3000';
  }

  /**
   * 8. PHASE 2 SMART ATTENDANCE & ROTATING QR
   */

  /**
   * Fetch trusted server-generated 30s rotating QR token for a construction site
   * Requires Admin authentication (Bearer token)
   */
  static async fetchServerActiveQr(siteId: string): Promise<QrTokenResponse> {
    if (!auth.currentUser) {
      throw new Error('Authentication required to generate site QR token.');
    }

    const idToken = await auth.currentUser.getIdToken();
    const baseUrl = this.getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/attendance/active-qr?siteId=${encodeURIComponent(siteId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error (${response.status}) fetching active QR token.`);
    }

    return await response.json() as QrTokenResponse;
  }

  /**
   * Cryptographically verify the QR token with the backend Express server
   * Enforces server-side HMAC validation and Firebase ID token auth
   */
  static async verifyQrToken(siteId: string, token: string): Promise<{ valid: boolean; siteId: string; timestamp?: number; error?: string }> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required to verify QR code.');
    }

    const idToken = await user.getIdToken();
    const baseUrl = this.getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/attendance/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ siteId, token })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Server QR verification failed with HTTP ${response.status}`);
    }

    return data;
  }

  /**
   * Perform atomic Check-In or Check-Out for the logged-in civil worker via
   * trusted server-side endpoint POST /api/attendance/record.
   * Enforces server-side Bearer ID token auth, rotating HMAC token validation,
   * active worker status, assigned site matching, Asia/Kolkata date protection,
   * and atomic state transitions (preventing duplicate check-in or shift tampering).
   */
  static async recordAttendance(params: {
    siteId: string;
    qrSessionId: string;
    qrToken: string;
    action?: 'CHECK_IN' | 'CHECK_OUT' | 'AUTO';
    operationId?: string;
  }): Promise<{ type: 'CHECK_IN' | 'CHECK_OUT'; attendanceId: string; operationId?: string; idempotentReplay?: boolean }> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required to record attendance.');
    }

    // Pre-flight client-side verification of worker state & site assignment
    const worker = await this.getWorkerByUid(user.uid);
    if (!worker) {
      throw new Error('No registered civil worker profile associated with this account.');
    }

    if (worker.status !== 'ACTIVE') {
      throw new Error(`Worker account status is ${worker.status}. Only ACTIVE workers can record attendance.`);
    }

    const effectiveSiteId = (worker.siteId || (worker as any).assignedSiteId || '').trim();
    if (effectiveSiteId !== params.siteId) {
      throw new Error(`Worker ${worker.workerId} is assigned to site "${effectiveSiteId}", but scanned QR code is for site "${params.siteId}". Cross-site attendance is strictly rejected.`);
    }

    // Acquire current Firebase Auth ID Token for Bearer authentication
    const idToken = await user.getIdToken();

    // Call trusted server-side endpoint POST /api/attendance/record
    const baseUrl = this.getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/attendance/record`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        siteId: params.siteId,
        qrToken: params.qrToken,
        qrSessionId: params.qrSessionId,
        action: params.action || 'AUTO',
        operationId: params.operationId
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(data.error || `Failed to record attendance (Server error ${response.status}).`);
    }

    return {
      type: data.type as 'CHECK_IN' | 'CHECK_OUT',
      attendanceId: data.attendanceId,
      operationId: data.operationId,
      idempotentReplay: data.idempotentReplay
    };
  }

  /**
   * Get today's attendance record for a specific worker
   */
  static async getTodayAttendance(workerId: string): Promise<AttendanceRecord | null> {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateStr = formatter.format(new Date());
    const attendanceDocId = `${workerId}_${dateStr}`;

    const snap = await getDoc(doc(db, this.attendanceCol, attendanceDocId));
    if (!snap.exists()) {
      return null;
    }
    return snap.data() as AttendanceRecord;
  }

  /**
   * Query site attendance records for a specific date (for supervisor/admin view)
   */
  static async getSiteAttendanceForDate(siteId: string, dateStr: string): Promise<AttendanceRecord[]> {
    const q = query(
      collection(db, this.attendanceCol),
      where('siteId', '==', siteId),
      where('date', '==', dateStr)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AttendanceRecord);
  }

  /**
   * Secure Worker Application Status Tracking
   * Queries real Firestore data via backend endpoint without exposing private data
   * or weakening Firestore rules.
   */
  static async trackApplicationStatus(identifier: string): Promise<ApplicationStatusInfo> {
    const cleanId = identifier.trim();
    if (!cleanId) {
      throw new Error('Please enter a valid Worker ID or Registration ID.');
    }

    const response = await fetch('/api/registration/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ identifier: cleanId })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Status check failed (${response.status}).`);
    }

    return await response.json() as ApplicationStatusInfo;
  }

  /**
   * Register Device FCM Token for Authenticated Worker
   * Associates token with current worker UID via backend API.
   * If offline or API unavailable, persists to deviceTokens collection in Firestore.
   */
  static async registerDeviceToken(fcmToken: string, platform: 'android' | 'web' = 'web'): Promise<void> {
    const cleanToken = (fcmToken || '').trim();
    if (!cleanToken) return;

    const user = auth.currentUser;
    if (!user) {
      console.warn('[firebaseService] Cannot register device token: user not authenticated');
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/device/register-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ fcmToken: cleanToken, platform })
      });
      if (res.ok) {
        return;
      }
    } catch (apiErr) {
      console.warn('[firebaseService] /api/device/register-token error, attempting direct Firestore save:', apiErr);
    }

    // Direct Firestore fallback
    try {
      const tokenDocRef = doc(db, 'deviceTokens', `${user.uid}_${cleanToken.slice(0, 32)}`);
      await setDoc(tokenDocRef, {
        token: cleanToken,
        uid: user.uid,
        platform,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (dbErr) {
      console.warn('[firebaseService] Direct device token registration note:', dbErr);
    }
  }

  /**
   * Unregister Device FCM Token on Sign Out
   */
  static async unregisterDeviceToken(fcmToken: string): Promise<void> {
    const cleanToken = (fcmToken || '').trim();
    if (!cleanToken) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
      const idToken = await user.getIdToken();
      await fetch('/api/device/unregister-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ fcmToken: cleanToken })
      });
    } catch (err) {
      console.warn('[firebaseService] Device unregister note:', err);
    }
  }

  // =========================================================================
  // PHASE 5: LEAVE, OVERTIME & SALARY CLIENT METHODS
  // =========================================================================

  /**
   * Helper: Get current auth token for API calls
   */
  private static async getAuthHeader(): Promise<{ Authorization: string }> {
    let user = auth.currentUser;
    if (!user) {
      await new Promise<void>((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((u) => {
          if (u) user = u;
          unsubscribe();
          resolve();
        });
        setTimeout(() => {
          unsubscribe();
          resolve();
        }, 1500);
      });
    }
    user = auth.currentUser;
    if (!user) {
      throw new Error('User is not authenticated.');
    }
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }

  // --- LEAVE MANAGEMENT ---

  static async submitLeaveRequest(data: {
    workerId: string;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    reason: string;
  }): Promise<LeaveRequest> {
    const headers = await this.getAuthHeader();
    const res = await fetch('/api/leave/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to submit leave request (${res.status}).`);
    }
    return json.leave;
  }

  static async updateLeaveStatus(data: {
    leaveId: string;
    status: LeaveStatus;
    reviewerNotes?: string;
  }): Promise<LeaveRequest> {
    const headers = await this.getAuthHeader();
    const res = await fetch('/api/leave/update-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to update leave status (${res.status}).`);
    }
    return json.leave;
  }

  static async getWorkerLeaves(workerId: string): Promise<LeaveRequest[]> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`/api/leave/worker/${workerId}`, {
      headers
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve worker leave records (${res.status}).`);
    }
    return json.leaves;
  }

  static async getAllLeaves(): Promise<LeaveRequest[]> {
    const headers = await this.getAuthHeader();
    const res = await fetch('/api/leave/all', {
      headers
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve leave records (${res.status}).`);
    }
    return json.leaves;
  }

  // --- OVERTIME MANAGEMENT ---

  static async recordOvertime(data: {
    workerId: string;
    date: string;
    hours: number;
    reason: string;
    siteId?: string;
    hourlyRate?: number;
    status?: OvertimeStatus;
  }): Promise<OvertimeRecord> {
    const headers = await this.getAuthHeader();
    const res = await fetch('/api/overtime/record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to record overtime (${res.status}).`);
    }
    return json.overtime;
  }

  static async updateOvertimeStatus(data: {
    overtimeId: string;
    status: OvertimeStatus;
    reviewerNotes?: string;
  }): Promise<OvertimeRecord> {
    const headers = await this.getAuthHeader();
    const res = await fetch('/api/overtime/update-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to update overtime status (${res.status}).`);
    }
    return json.overtime;
  }

  static async getWorkerOvertime(workerId: string): Promise<OvertimeRecord[]> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`/api/overtime/worker/${workerId}`, {
      headers
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve worker overtime records (${res.status}).`);
    }
    return json.overtimeRecords;
  }

  static async getAllOvertime(): Promise<OvertimeRecord[]> {
    const headers = await this.getAuthHeader();
    const res = await fetch('/api/overtime/all', {
      headers
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve overtime records (${res.status}).`);
    }
    return json.overtimeRecords;
  }

  // --- SALARY MANAGEMENT ---

  static async calculateSalary(data: {
    workerId: string;
    payPeriod: string;
    customDailyRate?: number;
    allowances?: number;
    deductions?: number;
    deductionBreakdown?: {
      taxOrPf?: number;
      advance?: number;
      unpaidLeave?: number;
      other?: number;
    };
    notes?: string;
  }): Promise<SalaryRecord> {
    const headers = await this.getAuthHeader();
    const res = await fetch('/api/salary/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to calculate salary (${res.status}).`);
    }
    return json.salary;
  }

  static async updateSalaryStatus(data: {
    salaryId: string;
    status: SalaryStatus;
    notes?: string;
  }): Promise<SalaryRecord> {
    const headers = await this.getAuthHeader();
    const res = await fetch('/api/salary/update-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to update salary status (${res.status}).`);
    }
    return json.salary;
  }

  static async getWorkerSalaryRecords(workerId: string): Promise<SalaryRecord[]> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`/api/salary/worker/${workerId}`, {
      headers
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve worker salary records (${res.status}).`);
    }
    return json.salaryRecords;
  }

  static async getAllSalaryRecords(payPeriod?: string): Promise<SalaryRecord[]> {
    const headers = await this.getAuthHeader();
    const url = payPeriod ? `/api/salary/all?payPeriod=${encodeURIComponent(payPeriod)}` : '/api/salary/all';
    const res = await fetch(url, {
      headers
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve salary records (${res.status}).`);
    }
    return json.salaryRecords;
  }

  // =========================================================================
  // PHASE 6: MANAGEMENT REPORTS & EXPORT METHODS
  // =========================================================================

  static async getReportsOverview(): Promise<ReportOverviewStats> {
    const headers = await this.getAuthHeader();
    const res = await fetch('/api/reports/overview', { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve management overview (${res.status}).`);
    }
    return json.stats;
  }

  static async getAttendanceReport(filters: {
    startDate?: string;
    endDate?: string;
    date?: string;
    workerId?: string;
    siteId?: string;
    batchNumber?: string;
    jobRole?: string;
    status?: string;
    limit?: number;
  }): Promise<AttendanceReportResponse> {
    const headers = await this.getAuthHeader();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, String(v));
      }
    });
    const url = `/api/reports/attendance?${params.toString()}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve attendance report (${res.status}).`);
    }
    return json;
  }

  static async getWorkforceReport(filters: {
    siteId?: string;
    batchNumber?: string;
    jobRole?: string;
    status?: string;
  }): Promise<WorkforceReportResponse> {
    const headers = await this.getAuthHeader();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, String(v));
      }
    });
    const url = `/api/reports/workforce?${params.toString()}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve workforce report (${res.status}).`);
    }
    return json;
  }

  static async getLeaveReport(filters: {
    startDate?: string;
    endDate?: string;
    workerId?: string;
    siteId?: string;
    leaveType?: string;
    status?: string;
  }): Promise<LeaveReportResponse> {
    const headers = await this.getAuthHeader();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, String(v));
      }
    });
    const url = `/api/reports/leave?${params.toString()}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve leave report (${res.status}).`);
    }
    return json;
  }

  static async getOvertimeReport(filters: {
    startDate?: string;
    endDate?: string;
    workerId?: string;
    siteId?: string;
    batchNumber?: string;
    status?: string;
  }): Promise<OvertimeReportResponse> {
    const headers = await this.getAuthHeader();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, String(v));
      }
    });
    const url = `/api/reports/overtime?${params.toString()}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve overtime report (${res.status}).`);
    }
    return json;
  }

  static async getSalaryReport(filters: {
    payPeriod?: string;
    workerId?: string;
    status?: string;
  }): Promise<SalaryReportResponse> {
    const headers = await this.getAuthHeader();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, String(v));
      }
    });
    const url = `/api/reports/salary?${params.toString()}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve salary report (${res.status}).`);
    }
    return json;
  }

  static async exportReportCsv(reportType: ReportType, filters: Record<string, any> = {}): Promise<string> {
    const headers = await this.getAuthHeader();
    const params = new URLSearchParams();
    params.append('reportType', reportType);
    params.append('format', 'json');
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, String(v));
      }
    });
    const url = `/api/reports/export?${params.toString()}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to export report (${res.status}).`);
    }
    return json.csv;
  }

  // ==========================================
  // PHASE 7: SECURITY AUDIT & AI INSIGHTS APIS
  // ==========================================

  static async getSecurityEvents(filters: {
    startDate?: string;
    endDate?: string;
    severity?: string;
    eventType?: string;
    workerId?: string;
    siteId?: string;
    limit?: number;
  } = {}): Promise<SecurityDashboardData> {
    const headers = await this.getAuthHeader();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, String(v));
      }
    });
    const url = `/api/security/events?${params.toString()}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve security events (${res.status}).`);
    }
    return json;
  }

  static async getAiManagementInsights(params: {
    startDate?: string;
    endDate?: string;
    forceRefresh?: boolean;
  } = {}): Promise<AiManagementInsightsResponse> {
    const headers = await this.getAuthHeader();
    headers['Content-Type'] = 'application/json';
    const url = '/api/ai/management-insights';
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to generate AI management insights (${res.status}).`);
    }
    return json;
  }

  /**
   * Ask Operations AI (Phase 8: read-only managerial operational assistant)
   */
  static async askOperationsAi(
    question: string,
    params: {
      startDate?: string;
      endDate?: string;
    } = {}
  ): Promise<AskOperationsAiResponse> {
    const headers = await this.getAuthHeader();
    headers['Content-Type'] = 'application/json';
    const url = '/api/ai/ask-operations';
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question, ...params })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to query Operations AI (${res.status}).`);
    }
    return json;
  }

  /**
   * Execute Confirmed Administrative Command (Admin Command Mode)
   * Sends allowlisted command to verified backend endpoint
   */
  static async executeAdminCommand(
    commandType: string,
    targetId: string,
    actionId: string
  ): Promise<{ success: boolean; message: string; commandType: string; targetId: string; [key: string]: any }> {
    const headers = await this.getAuthHeader();
    headers['Content-Type'] = 'application/json';
    const url = '/api/admin/execute-command';
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ commandType, targetId, actionId })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to execute administrative command (${res.status}).`);
    }
    return json;
  }

  /**
   * Get Site Deactivation Impact Preview (Read-only operational impact calculation)
   */
  static async getSiteDeactivationImpact(siteId: string): Promise<SiteDeactivationImpact> {
    const headers = await this.getAuthHeader();
    headers['Content-Type'] = 'application/json';
    const url = '/api/admin/site-deactivation-impact';
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ siteId })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to calculate site deactivation impact (${res.status}).`);
    }
    return json.impact;
  }

  // ==========================================================================
  // MEDIA & PHOTOS — CONTROLLED IMAGE FEATURE
  // ==========================================================================

  /**
   * Fetch all photos associated with a construction site (1-5 limit)
   */
  static async getSitePhotos(siteId: string): Promise<SitePhotoMetadata[]> {
    const headers = await this.getAuthHeader();
    const url = `/api/storage/site-photos/${encodeURIComponent(siteId)}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve site photos (${res.status}).`);
    }
    return json.photos || [];
  }

  /**
   * Compress and upload a construction-site photo
   * Validates MIME type, compresses image (< 1920x1080), enforces 1-5 limit
   */
  static async uploadSitePhoto(
    siteId: string,
    file: File | Blob,
    originalFileName?: string,
    displayOrder?: number
  ): Promise<SitePhotoMetadata> {
    const processed = await processAndCompressImage(file, 'site', originalFileName);
    const headers = await this.getAuthHeader();
    headers['Content-Type'] = 'application/json';

    const url = '/api/storage/site-photo/upload';
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        siteId,
        fileBase64: processed.base64Data,
        fileName: processed.fileName,
        contentType: processed.contentType,
        displayOrder
      })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to upload site photo (${res.status}).`);
    }
    return json.photo;
  }

  /**
   * Delete a construction-site photo from Storage and Firestore metadata
   */
  static async deleteSitePhoto(siteId: string, photoId: string): Promise<void> {
    const headers = await this.getAuthHeader();
    const url = `/api/storage/site-photo/${encodeURIComponent(siteId)}/${encodeURIComponent(photoId)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to delete site photo (${res.status}).`);
    }
  }

  /**
   * Fetch a worker's profile photo (only owner worker or admin authorized)
   */
  static async getWorkerProfilePhoto(workerId: string): Promise<WorkerProfilePhoto | null> {
    const headers = await this.getAuthHeader();
    const url = `/api/storage/worker-photo/${encodeURIComponent(workerId)}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to retrieve worker profile photo (${res.status}).`);
    }
    return json.profilePhoto || null;
  }

  /**
   * Compress and upload a worker profile photo (max 1 per worker)
   * Enforces worker authorization, MIME validation, and resizing (< 800x800)
   * NO BIOMETRICS / NO FACIAL RECOGNITION
   */
  static async uploadWorkerProfilePhoto(
    workerId: string,
    file: File | Blob,
    originalFileName?: string
  ): Promise<WorkerProfilePhoto> {
    const processed = await processAndCompressImage(file, 'worker', originalFileName);
    const headers = await this.getAuthHeader();
    headers['Content-Type'] = 'application/json';

    const url = '/api/storage/worker-photo/upload';
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        workerId,
        fileBase64: processed.base64Data,
        fileName: processed.fileName,
        contentType: processed.contentType
      })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to upload worker profile photo (${res.status}).`);
    }
    return json.profilePhoto;
  }

  /**
   * Delete a worker's profile photo (Storage object deleted and Firestore field removed)
   */
  static async deleteWorkerProfilePhoto(workerId: string): Promise<void> {
    const headers = await this.getAuthHeader();
    const url = `/api/storage/worker-photo/${encodeURIComponent(workerId)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to delete worker profile photo (${res.status}).`);
    }
  }
}

