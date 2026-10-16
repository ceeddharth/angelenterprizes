/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ANDROID_FILES, AndroidFile } from './androidProjectData';
import {
  Smartphone,
  FolderTree,
  FileCode,
  Download,
  Copy,
  Check,
  Search,
  BookOpen,
  Wrench,
  Building2,
  Users,
  Shield,
  Lock,
  ArrowLeft,
  ArrowRight,
  Plus,
  RefreshCw,
  LogOut,
  LogIn,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Clock,
  MapPin,
  FileText,
  BadgeAlert,
  HardHat,
  ChevronRight,
  ExternalLink,
  QrCode,
  Calendar,
  DollarSign,
  FileCheck,
  Sun,
  Moon,
  UserCheck,
  UserX,
  Layers,
  ShieldCheck,
  Edit3,
  Filter,
  BarChart3,
  PieChart,
  Briefcase,
  ShieldAlert,
  User,
  Sparkles,
  AlertOctagon,
  Camera,
  ChevronDown,
  Save,
  Image as ImageIcon
} from 'lucide-react';
import { FirebaseService } from './services/firebaseService';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut, sendPasswordResetEmail, type User as AuthUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import {
  AppUser,
  WorkerRecord,
  ConstructionSite,
  BatchRecord,
  WorkerRegistrationRecord,
  DashboardStats,
  ApplicationStatusInfo,
  QrTokenResponse,
  WorkforceDistribution,
  SiteDeactivationImpact,
  SitePhotoMetadata,
  WorkerProfilePhoto
} from './types';
import { AdminQrKiosk } from './components/AdminQrKiosk';
import { WorkerAttendance } from './components/WorkerAttendance';
import { WorkerLeave } from './components/WorkerLeave';
import { WorkerOvertime } from './components/WorkerOvertime';
import { WorkerSalary } from './components/WorkerSalary';
import { AdminLeave } from './components/AdminLeave';
import { AdminOvertime } from './components/AdminOvertime';
import { AdminSalary } from './components/AdminSalary';
import { AdminReports } from './components/AdminReports';
import { AdminSecurityDashboard } from './components/AdminSecurityDashboard';
import { AdminAiOperationsAssistant } from './components/AdminAiOperationsAssistant';
import { SitePhotoManager } from './components/SitePhotoManager';
import { WorkerPhotoManager } from './components/WorkerPhotoManager';
import {
  isValidPhone,
  isValidEmail,
  normalizeEmail,
  sanitizePhoneInput,
  sanitizeEmailInput,
  MAX_PHONE_LENGTH,
  MAX_EMAIL_LENGTH
} from './utils/validation';

type ScreenName =
  | 'splash'
  | 'welcome'
  | 'admin_login'
  | 'worker_login'
  | 'worker_registration'
  | 'track_status'
  | 'admin_dashboard'
  | 'admin_workers'
  | 'admin_sites'
  | 'admin_batches'
  | 'pending_registrations'
  | 'admin_qr_kiosk'
  | 'admin_leave'
  | 'admin_overtime'
  | 'admin_salary'
  | 'admin_reports'
  | 'admin_security'
  | 'worker_dashboard'
  | 'worker_attendance'
  | 'worker_leave'
  | 'worker_overtime'
  | 'worker_salary'
  | 'worker_profile';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'guide'>('simulator');
  const [selectedFile, setSelectedFile] = useState<AndroidFile>(ANDROID_FILES[0]);
  const [fileSearch, setFileSearch] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Live Simulator States
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('splash');
  const [registrationStep, setRegistrationStep] = useState<1 | 2 | 3>(1);
  const [authRole, setAuthRole] = useState<'ADMIN' | 'WORKER' | null>(null);

  // Real Firestore-backed state for interactive preview
  const [sites, setSites] = useState<ConstructionSite[]>([]);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [registrations, setRegistrations] = useState<WorkerRegistrationRecord[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalWorkers: 0,
    activeWorkers: 0,
    pendingRegistrations: 0,
    totalSites: 0
  });

  // Current authenticated sessions
  const [authUser, setAuthUser] = useState<AuthUser | null>(auth.currentUser);
  const [currentWorker, setCurrentWorker] = useState<WorkerRecord | null>(null);
  const [currentAdmin, setCurrentAdmin] = useState<AppUser | null>(null);
  const [isAdminSessionVerified, setIsAdminSessionVerified] = useState<boolean>(false);
  const [pendingWorkerScreen, setPendingWorkerScreen] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState<boolean>(false);

  // Loading and feedback states
  const [isDbLoading, setIsDbLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [activeRegistrationModal, setActiveRegistrationModal] = useState<WorkerRegistrationRecord | null>(null);
  const [selectedKioskSiteId, setSelectedKioskSiteId] = useState<string>('SITE-101');
  const [activeKioskSession, setActiveKioskSession] = useState<QrTokenResponse | null>(null);

  // Form states in simulator
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [workerIdentifier, setWorkerIdentifier] = useState('');
  const [workerPin, setWorkerPin] = useState('');
  const [simError, setSimError] = useState<string | null>(null);
  const [simNotice, setSimNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Status Tracking states
  const [statusLookupInput, setStatusLookupInput] = useState('');
  const [statusResult, setStatusResult] = useState<ApplicationStatusInfo | null>(null);
  const [statusSearchLoading, setStatusSearchLoading] = useState(false);
  const [statusSearchError, setStatusSearchError] = useState<string | null>(null);
  const [lastSubmittedRegId, setLastSubmittedRegId] = useState<string | null>(null);

  // Workforce Batches state
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [batchTogglingId, setBatchTogglingId] = useState<string | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchForm, setBatchForm] = useState({
    name: '',
    description: ''
  });

  // New Registration form state
  const [regForm, setRegForm] = useState({
    fullName: '',
    dateOfBirth: '',
    phone: '',
    email: '',
    address: '',
    emergencyName: '',
    emergencyPhone: '',
    workerId: '',
    batchNumber: 'B-01',
    jobRole: 'Helper',
    siteId: 'SITE-101',
    joiningDate: '',
    passwordPin: '',
    confirmPin: '',
    termsAccepted: false
  });

  // Admin search & filters
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerStatusFilter, setWorkerStatusFilter] = useState<string>('ALL');
  const [workerSiteFilter, setWorkerSiteFilter] = useState<string>('ALL');
  const [workerBatchFilter, setWorkerBatchFilter] = useState<string>('ALL');
  const [workerRoleFilter, setWorkerRoleFilter] = useState<string>('ALL');
  const [activeWorkerModal, setActiveWorkerModal] = useState<WorkerRecord | null>(null);
  const [isEditingWorker, setIsEditingWorker] = useState(false);
  const [workerEditForm, setWorkerEditForm] = useState({
    siteId: '',
    batchNumber: '',
    jobRole: '',
    phone: '',
    email: '',
    emergencyContactName: '',
    emergencyContactPhone: ''
  });

  // Site modal
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [siteForm, setSiteForm] = useState({
    siteId: 'SITE-' + Math.floor(100 + Math.random() * 900),
    siteName: '',
    projectName: '',
    address: '',
    description: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE'
  });

  // Edit Site modal
  const [showEditSiteModal, setShowEditSiteModal] = useState(false);
  const [selectedPhotoSite, setSelectedPhotoSite] = useState<ConstructionSite | null>(null);
  const [editSiteForm, setEditSiteForm] = useState({
    siteId: '',
    siteName: '',
    projectName: '',
    address: '',
    description: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE'
  });

  // Site Deactivation Impact Preview modal
  const [deactivatingSiteImpact, setDeactivatingSiteImpact] = useState<SiteDeactivationImpact | null>(null);
  const [isFetchingDeactivationImpact, setIsFetchingDeactivationImpact] = useState(false);

  // Edit Batch modal
  const [showEditBatchModal, setShowEditBatchModal] = useState(false);
  const [updatingBatchId, setUpdatingBatchId] = useState<string | null>(null);
  const [editBatchForm, setEditBatchForm] = useState({
    batchId: '',
    name: '',
    description: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE'
  });

  // Workforce Distribution View
  const [distributionTab, setDistributionTab] = useState<'sites' | 'batches' | 'roles' | 'status'>('sites');
  const [workforceDist, setWorkforceDist] = useState<WorkforceDistribution | null>(null);

  // Load and sync real Firestore data
  // Only called when an authenticated Admin session is active
  const refreshAllData = async () => {
    if (!auth.currentUser) {
      console.warn('Skipping refreshAllData: No active authenticated session.');
      return;
    }
    try {
      setIsDbLoading(true);
      setSimError(null);
      // Fetch sites, workers, pending registrations, dashboard stats, batches, and workforce distribution from Firestore
      const [dbSites, dbWorkers, dbPending, stats, dbBatches, dist] = await Promise.all([
        FirebaseService.ensureDefaultSites(),
        FirebaseService.getWorkers(),
        FirebaseService.getPendingRegistrations(),
        FirebaseService.getDashboardStats(),
        FirebaseService.ensureDefaultBatches(),
        FirebaseService.getWorkforceDistribution().catch(() => null)
      ]);

      if (dbSites) setSites(dbSites);
      if (dbWorkers) setWorkers(dbWorkers);
      if (dbPending) setRegistrations(dbPending);
      if (stats) setDashboardStats(stats);
      if (dist) setWorkforceDist(dist);
      if (dbBatches) {
        setBatches(dbBatches);
        if (!regForm.batchNumber && dbBatches.length > 0) {
          setRegForm((prev) => ({ ...prev, batchNumber: dbBatches[0].batchId }));
        }
      }
    } catch (err: any) {
      console.error('Firestore admin sync error:', err);
      setSimError(FirebaseService.parseError(err));
      throw err;
    } finally {
      setIsDbLoading(false);
    }
  };

  // Initial mount: load public active sites and active batches for dropdowns (unauthenticated safe)
  useEffect(() => {
    Promise.all([
      FirebaseService.getSites(),
      FirebaseService.getActiveBatches()
    ])
      .then(([loadedSites, loadedBatches]) => {
        if (loadedSites && loadedSites.length > 0) {
          setSites(loadedSites);
        }
        if (loadedBatches && loadedBatches.length > 0) {
          setBatches(loadedBatches);
          setRegForm((prev) => ({
            ...prev,
            batchNumber: prev.batchNumber || loadedBatches[0].batchId
          }));
        }
      })
      .catch((e) => {
        console.warn('Initial public sites/batches notice:', e);
      })
      .finally(() => {
        setIsDbLoading(false);
      });
  }, []);

  // Dedicated helper to route to admin authentication flow
  const initiateAdminLogin = async (notice?: string) => {
    // If an admin session is already active, navigate directly to admin dashboard
    if (authRole === 'ADMIN' && currentAdmin && currentAdmin.status === 'ACTIVE') {
      setCurrentScreen('admin_dashboard');
      return;
    }
    // If user is currently signed in as a WORKER, clear worker session
    if (authRole === 'WORKER') {
      try {
        await signOut(auth);
      } catch (e) {
        console.warn('Sign out during admin login initialization:', e);
      }
      setAuthUser(null);
      setCurrentWorker(null);
      setAuthRole(null);
    }
    setAdminEmail('');
    setAdminPassword('');
    setSimError(null);
    if (notice) {
      setSimNotice(notice);
    }
    setCurrentScreen('admin_login');
  };

  // Listen for Firebase Auth state changes and sync authenticated session
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      try {
        if (user) {
          const userDocSnap = await getDoc(doc(db, 'users', user.uid));
          if (userDocSnap.exists()) {
            const profile = userDocSnap.data() as AppUser;
            const isRoleAdmin = profile.role === 'ADMIN' || (profile.role as string) === 'SITE_SUPERVISOR';
            if (isRoleAdmin && profile.status === 'ACTIVE') {
              setCurrentAdmin({ ...profile, uid: user.uid });
              setAuthRole('ADMIN');
              setIsAdminSessionVerified(true);
              setCurrentWorker(null);
              refreshAllData().catch((e) => console.warn('Admin background sync:', e));
            } else if (profile.role === 'WORKER' && profile.status === 'ACTIVE') {
              const workerRec = await FirebaseService.getWorkerByUid(user.uid);
              if (workerRec && workerRec.status === 'ACTIVE') {
                setCurrentAdmin(null);
                setIsAdminSessionVerified(false);
                setAuthRole('WORKER');
                setCurrentWorker(workerRec);
              } else {
                setCurrentAdmin(null);
                setCurrentWorker(null);
                setAuthRole(null);
                setIsAdminSessionVerified(false);
                if (workerRec && workerRec.status !== 'ACTIVE') {
                  await signOut(auth);
                }
              }
            } else {
              // User has pending, rejected, suspended, or inactive status
              setCurrentAdmin(null);
              setCurrentWorker(null);
              setAuthRole(null);
              setIsAdminSessionVerified(false);
              await signOut(auth);
            }
          } else {
            // Check if user is an active worker directly in workers collection
            const workerRec = await FirebaseService.getWorkerByUid(user.uid);
            if (workerRec && workerRec.status === 'ACTIVE') {
              setCurrentAdmin(null);
              setIsAdminSessionVerified(false);
              setAuthRole('WORKER');
              setCurrentWorker(workerRec);
            } else {
              setCurrentAdmin(null);
              setCurrentWorker(null);
              setAuthRole(null);
              setIsAdminSessionVerified(false);
              if (workerRec && workerRec.status !== 'ACTIVE') {
                await signOut(auth);
              }
            }
          }
        } else {
          setCurrentAdmin(null);
          setCurrentWorker(null);
          setAuthRole(null);
          setIsAdminSessionVerified(false);
        }
      } catch (e) {
        console.warn('Auth state restore error:', e);
        setCurrentAdmin(null);
        setCurrentWorker(null);
        setAuthRole(null);
        setIsAdminSessionVerified(false);
      } finally {
        setAuthInitialized(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleUniversalSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out notice:', e);
    }
    setAuthUser(null);
    setCurrentAdmin(null);
    setCurrentWorker(null);
    setAuthRole(null);
    setIsAdminSessionVerified(false);
    setAdminEmail('');
    setAdminPassword('');
    setWorkerIdentifier('');
    setWorkerPin('');
    setPendingWorkerScreen(null);
    setSimError(null);
    setSimNotice('You have signed out successfully.');
    setCurrentScreen('welcome');
  };

  const ADMIN_SCREENS: ScreenName[] = [
    'admin_dashboard',
    'admin_workers',
    'admin_sites',
    'admin_batches',
    'pending_registrations',
    'admin_qr_kiosk',
    'admin_leave',
    'admin_overtime',
    'admin_salary',
    'admin_reports',
    'admin_security'
  ];

  const WORKER_SCREENS: ScreenName[] = [
    'worker_dashboard',
    'worker_attendance',
    'worker_leave',
    'worker_overtime',
    'worker_salary',
    'worker_profile'
  ];

  // Boolean guards for role-restricted render and navigation
  // Authoritative admin guard: requires active Firebase Auth session, verified in-session login,
  // matching UID between Firebase Auth currentUser and Firestore user doc, role ADMIN/SITE_SUPERVISOR, and ACTIVE status.
  const effectiveAuthUser = auth.currentUser || authUser;
  const isFirebaseAdminValid =
    effectiveAuthUser !== null &&
    currentAdmin !== null &&
    effectiveAuthUser.uid === currentAdmin.uid &&
    (currentAdmin.role === 'ADMIN' || (currentAdmin.role as string) === 'SITE_SUPERVISOR') &&
    currentAdmin.status === 'ACTIVE';

  const isAdminAuthenticated = isAdminSessionVerified && authRole === 'ADMIN' && isFirebaseAdminValid;
  const isWorkerAuthenticated = authRole === 'WORKER' && currentWorker !== null && currentWorker.status === 'ACTIVE';

  // Secure navigation handler strictly enforcing role boundaries
  const navigateToScreen = (target: ScreenName) => {
    setSimError(null);
    setSimNotice(null);

    // If target is an admin-only screen
    if (ADMIN_SCREENS.includes(target)) {
      if (authRole === 'WORKER') {
        setSimError('Access Denied: Worker accounts cannot access Administrator management console.');
        return;
      }
      if (!isAdminAuthenticated) {
        initiateAdminLogin('Administrator authentication required. Please sign in with an active Admin account.');
        return;
      }
      setCurrentScreen(target);
      return;
    }

    // If target is a worker-only screen
    if (WORKER_SCREENS.includes(target)) {
      if (authRole === 'ADMIN') {
        setSimError('Access Denied: Administrator accounts cannot access Worker personal portal. Worker credentials are required.');
        return;
      }
      if (!isWorkerAuthenticated) {
        setPendingWorkerScreen(target);
        setSimNotice('Active worker authentication required. Please sign in with your Worker credentials.');
        setCurrentScreen('worker_login');
        return;
      }
      setCurrentScreen(target);
      return;
    }

    // Public screens
    setCurrentScreen(target);
  };

  // Automated route guard: strictly enforces role boundaries on screen changes
  useEffect(() => {
    // CRITICAL: Await Firebase Auth state restoration before running route guards!
    if (!authInitialized) {
      return;
    }

    if (ADMIN_SCREENS.includes(currentScreen)) {
      if (authRole === 'WORKER') {
        setSimError('Access Denied: Worker accounts cannot access Administrator management console.');
        setCurrentScreen('worker_dashboard');
      } else if (!isAdminAuthenticated) {
        initiateAdminLogin('Administrator authentication required. Please sign in with an active Admin account.');
      }
    } else if (WORKER_SCREENS.includes(currentScreen)) {
      if (authRole === 'ADMIN') {
        setSimError('Access Denied: Administrator accounts cannot access Worker personal portal.');
        setCurrentScreen('admin_dashboard');
      } else if (!isWorkerAuthenticated) {
        setPendingWorkerScreen(currentScreen);
        setSimNotice('Active worker authentication required. Please sign in with your Worker credentials.');
        setCurrentScreen('worker_login');
      }
    }
  }, [currentScreen, isAdminAuthenticated, isWorkerAuthenticated, authRole, authInitialized]);

  // Manual entry handler from Splash Screen to Operations Portal
  // ALWAYS opens the public Welcome screen. Never bypasses entry or authentication.
  const handleEnterOperationsPortal = () => {
    setCurrentScreen('welcome');
  };

  // Non-blocking temporary notifications auto-dismiss after 3000ms (3.0 seconds)
  useEffect(() => {
    if (!simNotice) return;
    const timer = setTimeout(() => setSimNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [simNotice]);

  useEffect(() => {
    if (!simError) return;
    const timer = setTimeout(() => setSimError(null), 3000);
    return () => clearTimeout(timer);
  }, [simError]);

  useEffect(() => {
    if (!statusSearchError) return;
    const timer = setTimeout(() => setStatusSearchError(null), 3000);
    return () => clearTimeout(timer);
  }, [statusSearchError]);

  // Material 3 Theme state (Light theme is primary default; Dark theme preview architecture)
  const [simTheme, setSimTheme] = useState<'light' | 'dark'>('light');

  // Handle Status Lookup for Workers
  const handleStatusLookup = async () => {
    const trimmed = statusLookupInput.trim();
    if (!trimmed) {
      setStatusSearchError('Please enter a Worker ID or Registration ID.');
      return;
    }
    try {
      setStatusSearchLoading(true);
      setStatusSearchError(null);
      setStatusResult(null);
      const result = await FirebaseService.trackApplicationStatus(trimmed);
      setStatusResult(result);
    } catch (err: any) {
      setStatusSearchError(err.message || 'Unable to find application record.');
    } finally {
      setStatusSearchLoading(false);
    }
  };

  // Material 3 Confirmation Dialog state for destructive actions
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    isDestructive: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Rejection Dialog with Required Reason
  const [rejectDialog, setRejectDialog] = useState<{
    isOpen: boolean;
    registrationId: string;
    workerName: string;
    reasonPreset: string;
    customReason: string;
    error: string | null;
  } | null>(null);

  // Status Badge Component adhering to Material 3 tonal palettes
  const renderStatusBadge = (status: string) => {
    const isDark = simTheme === 'dark';
    switch (status) {
      case 'ACTIVE':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
            isDark ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            ACTIVE
          </span>
        );
      case 'PENDING':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
            isDark ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60' : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            <Clock className="w-2.5 h-2.5" />
            PENDING
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
            isDark ? 'bg-purple-950/80 text-purple-300 border border-purple-700/60' : 'bg-purple-50 text-purple-700 border border-purple-200'
          }`}>
            <AlertCircle className="w-2.5 h-2.5" />
            SUSPENDED
          </span>
        );
      case 'REJECTED':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
            isDark ? 'bg-red-950/80 text-red-300 border border-red-700/60' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            REJECTED
          </span>
        );
      case 'INACTIVE':
      default:
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
            isDark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-slate-100 text-slate-600 border border-slate-200'
          }`}>
            INACTIVE
          </span>
        );
    }
  };

  // Download entire Android Studio Project as ZIP from authoritative server packager
  const downloadAndroidZip = async () => {
    try {
      setIsDownloadingZip(true);
      // Download the complete Android project ZIP package generated from /app/applet/android
      let response = await fetch('/ANGEL_ENTERPRISES_Civil_Workforce_BUILDABLE.zip');
      if (!response.ok) {
        response = await fetch('/ANGEL_ENTERPRISES_Civil_Workforce_FINAL_AUDITED.zip');
      }
      if (!response.ok) {
        response = await fetch('/api/android/export-zip', { method: 'POST' });
      }
      if (!response.ok) {
        response = await fetch('/api/android/export-zip');
      }
      if (!response.ok) {
        throw new Error('Failed to download project archive');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ANGEL_ENTERPRISES_Civil_Workforce_BUILDABLE.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading project ZIP:', err);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const copyCode = (text: string, path: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Filtered files for code browser
  const filteredFiles = ANDROID_FILES.filter(
    (f) =>
      f.name.toLowerCase().includes(fileSearch.toLowerCase()) ||
      f.path.toLowerCase().includes(fileSearch.toLowerCase()) ||
      f.category.toLowerCase().includes(fileSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <nav className="h-16 bg-slate-900 text-white flex items-center justify-between px-4 lg:px-8 border-b border-slate-800 flex-shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center shadow-md shadow-amber-500/20 border border-amber-400/40">
            <HardHat className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base lg:text-lg font-bold tracking-tight text-white">ANGEL ENTERPRISES</h1>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full">
                Civil Workforce
              </span>
            </div>
            <p className="hidden md:block text-[11px] text-slate-400 font-medium leading-none mt-0.5">
              Attendance & Workforce Management System
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3.5 py-1.5 rounded-md text-xs transition-all flex items-center gap-2 ${
              activeTab === 'simulator'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50 font-medium'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Live App Simulator
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3.5 py-1.5 rounded-md text-xs transition-all flex items-center gap-2 ${
              activeTab === 'code'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50 font-medium'
            }`}
          >
            <FileCode className="w-4 h-4" />
            Android Studio Files ({ANDROID_FILES.length})
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3.5 py-1.5 rounded-md text-xs transition-all flex items-center gap-2 ${
              activeTab === 'guide'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50 font-medium'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Architecture & Setup
          </button>
        </div>

        {/* Action & Admin Badge */}
        <div className="flex items-center gap-4">
          <button
            onClick={downloadAndroidZip}
            disabled={isDownloadingZip}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-md flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {isDownloadingZip ? <RefreshCw className="w-4 h-4 animate-spin text-amber-300" /> : <Download className="w-4 h-4 text-amber-300" />}
            Export Android Studio ZIP
          </button>

          <div className="hidden md:flex items-center gap-3 pl-2 border-l border-slate-800">
            {authRole === 'ADMIN' && currentAdmin ? (
              <>
                <div className="text-right">
                  <p className="text-[10px] text-amber-400 font-medium uppercase tracking-wider">Site Administrator</p>
                  <p className="text-xs font-semibold text-white">{currentAdmin.fullName || currentAdmin.email}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-indigo-700 flex items-center justify-center border-2 border-indigo-500 font-bold text-xs text-white">
                  {(currentAdmin.fullName || currentAdmin.email || 'AD').substring(0, 2).toUpperCase()}
                </div>
                <button
                  id="btn-header-admin-signout"
                  onClick={handleUniversalSignOut}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-900/50 hover:text-rose-200 border border-slate-700 hover:border-rose-700/60 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : authRole === 'WORKER' && currentWorker ? (
              <>
                <div className="text-right">
                  <p className="text-[10px] text-amber-400 font-medium uppercase tracking-wider">Worker ({currentWorker.workerId})</p>
                  <p className="text-xs font-semibold text-white">{currentWorker.fullName}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-amber-600 flex items-center justify-center border-2 border-amber-400 font-bold text-xs text-white">
                  {(currentWorker.fullName || 'WK').substring(0, 2).toUpperCase()}
                </div>
                <button
                  id="btn-header-worker-signout"
                  onClick={handleUniversalSignOut}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-900/50 hover:text-rose-200 border border-slate-700 hover:border-rose-700/60 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">ANGEL ENTERPRISES</p>
                  <p className="text-xs font-semibold text-slate-300">Unauthenticated</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-700 font-bold text-xs text-slate-400">
                  <User className="w-4 h-4" />
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 lg:p-8 overflow-x-hidden">
        {/* TAB 1: LIVE ANDROID SIMULATOR */}
        {activeTab === 'simulator' && (
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 items-start justify-center">
            {/* Control Panel / Screen Selector */}
            <div className="w-full lg:w-72 bg-white border border-slate-250 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col flex-shrink-0">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-amber-400">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">Operations Console</h2>
                    <p className="text-[10px] text-slate-500 font-medium">Navigation Architecture</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  23 Screens
                </span>
              </div>

              <div className="space-y-1 text-xs">
                {/* 1. PUBLIC ENTRY */}
                <div className="flex items-center justify-between text-[10px] font-black tracking-wider text-slate-600 uppercase px-2 pt-2 pb-1 border-b border-slate-100 mb-1">
                  <span>Public Gateway</span>
                  <span className="text-[9px] font-normal text-slate-500 lowercase font-mono">1-6</span>
                </div>
                <button
                  onClick={() => navigateToScreen('splash')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'splash'
                      ? 'bg-amber-500/10 text-amber-900 font-bold border-l-4 border-amber-500 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">01</span>
                    <span>Splash Screen</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  onClick={() => navigateToScreen('welcome')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'welcome'
                      ? 'bg-amber-500/10 text-amber-900 font-bold border-l-4 border-amber-500 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">02</span>
                    <span>Welcome Portal</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  onClick={() => initiateAdminLogin()}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'admin_login'
                      ? 'bg-amber-500/10 text-amber-900 font-bold border-l-4 border-amber-500 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">03</span>
                    <span>Admin Sign In</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  onClick={() => navigateToScreen('worker_login')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'worker_login'
                      ? 'bg-amber-500/10 text-amber-900 font-bold border-l-4 border-amber-500 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">04</span>
                    <span>Worker Sign In</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  onClick={() => {
                    setRegistrationStep(1);
                    navigateToScreen('worker_registration');
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'worker_registration'
                      ? 'bg-amber-500/10 text-amber-900 font-bold border-l-4 border-amber-500 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">05</span>
                    <span>Multi-Step Registration</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  onClick={() => {
                    setStatusSearchError(null);
                    navigateToScreen('track_status');
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'track_status'
                      ? 'bg-amber-500/10 text-amber-900 font-bold border-l-4 border-amber-500 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">06</span>
                    <span>Track Status</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>

                {/* 2. ADMIN COMMAND CENTER */}
                <div className="flex items-center justify-between text-[10px] font-black tracking-wider text-indigo-700 uppercase px-2 pt-3 pb-1 border-b border-slate-100 mb-1 mt-2">
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3 h-3 text-indigo-600" />
                    <span>Command Center (Admin)</span>
                  </span>
                  <span className="text-[9px] font-normal text-slate-400 lowercase font-mono">7-17</span>
                </div>
                <button
                  onClick={() => navigateToScreen('admin_dashboard')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'admin_dashboard'
                      ? 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-500 font-bold">07</span>
                    <span>Command Center</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  onClick={() => navigateToScreen('admin_workers')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'admin_workers'
                      ? 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-500 font-bold">08</span>
                    <span>Workers Registry</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-bold">
                    {workers.length}
                  </span>
                </button>
                <button
                  onClick={() => navigateToScreen('admin_sites')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'admin_sites'
                      ? 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-500 font-bold">09</span>
                    <span>Geofenced Sites</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-bold">
                    {sites.length}
                  </span>
                </button>
                <button
                  id="sidebar-admin-batches-btn"
                  onClick={() => navigateToScreen('admin_batches')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'admin_batches'
                      ? 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-500 font-bold">10</span>
                    <span>Workforce Batches</span>
                  </span>
                  <span className="bg-indigo-100 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {batches.length}
                  </span>
                </button>
                <button
                  onClick={() => navigateToScreen('pending_registrations')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between relative ${
                    currentScreen === 'pending_registrations'
                      ? 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-500 font-bold">11</span>
                    <span>Registration Queue</span>
                  </span>
                  {registrations.filter((r) => r.status === 'PENDING').length > 0 ? (
                    <span className="bg-amber-500 text-slate-950 text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                      {registrations.filter((r) => r.status === 'PENDING').length}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-medium">0</span>
                  )}
                </button>
                <button
                  id="sidebar-admin-qr-kiosk-btn"
                  onClick={() => navigateToScreen('admin_qr_kiosk')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'admin_qr_kiosk'
                      ? 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-500 font-bold">12</span>
                    <span>Site QR Gate Kiosk</span>
                  </span>
                  <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-300">
                    GATE
                  </span>
                </button>
                <button
                  onClick={() => navigateToScreen('admin_leave')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'admin_leave'
                      ? 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-500 font-bold">13</span>
                    <span>Leave Approvals</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  onClick={() => navigateToScreen('admin_overtime')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'admin_overtime'
                      ? 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-500 font-bold">14</span>
                    <span>Overtime Claims</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  onClick={() => navigateToScreen('admin_salary')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'admin_salary'
                      ? 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-500 font-bold">15</span>
                    <span>Payroll & Wage Slips</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  id="sidebar-admin-reports-btn"
                  onClick={() => navigateToScreen('admin_reports')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'admin_reports'
                      ? 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-500 font-bold">16</span>
                    <span>Executive Reports</span>
                  </span>
                  <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded">
                    Audit
                  </span>
                </button>
                <button
                  onClick={() => navigateToScreen('admin_security')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'admin_security'
                      ? 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-500 font-bold">17</span>
                    <span>Security & AI SIEM</span>
                  </span>
                  <span className="text-[9px] bg-red-100 text-red-800 font-bold px-1.5 py-0.5 rounded">
                    SIEM
                  </span>
                </button>

                {/* 3. WORKER FIELD OPERATIONS */}
                <div className="flex items-center justify-between text-[10px] font-black tracking-wider text-emerald-800 uppercase px-2 pt-3 pb-1 border-b border-slate-100 mb-1 mt-2">
                  <span className="flex items-center gap-1.5">
                    <HardHat className="w-3 h-3 text-emerald-600" />
                    <span>Field Operations (Worker)</span>
                  </span>
                  <span className="text-[9px] font-normal text-slate-400 lowercase font-mono">18-23</span>
                </div>
                <button
                  onClick={() => navigateToScreen('worker_dashboard')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'worker_dashboard'
                      ? 'bg-emerald-50 text-emerald-900 font-bold border-l-4 border-emerald-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-emerald-600 font-bold">18</span>
                    <span>Field Dashboard</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  id="sidebar-worker-attendance-btn"
                  onClick={() => navigateToScreen('worker_attendance')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'worker_attendance'
                      ? 'bg-emerald-50 text-emerald-900 font-bold border-l-4 border-emerald-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-emerald-600 font-bold">19</span>
                    <span>QR Check-In Scanner</span>
                  </span>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded border border-emerald-300">
                    SCAN
                  </span>
                </button>
                <button
                  onClick={() => navigateToScreen('worker_leave')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'worker_leave'
                      ? 'bg-emerald-50 text-emerald-900 font-bold border-l-4 border-emerald-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-emerald-600 font-bold">20</span>
                    <span>Leave Requests</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  onClick={() => navigateToScreen('worker_overtime')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'worker_overtime'
                      ? 'bg-emerald-50 text-emerald-900 font-bold border-l-4 border-emerald-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-emerald-600 font-bold">21</span>
                    <span>Overtime Claims</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  onClick={() => navigateToScreen('worker_salary')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'worker_salary'
                      ? 'bg-emerald-50 text-emerald-900 font-bold border-l-4 border-emerald-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-emerald-600 font-bold">22</span>
                    <span>Salary & Slips</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
                <button
                  onClick={() => navigateToScreen('worker_profile')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                    currentScreen === 'worker_profile'
                      ? 'bg-emerald-50 text-emerald-900 font-bold border-l-4 border-emerald-600 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-emerald-600 font-bold">23</span>
                    <span>Safety Pass Profile</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Production Security Standards Enforced
                </div>
                <p>Role-based routing, server-authoritative Firebase integration, and tamper-resistant audit trail.</p>
              </div>
            </div>

            {/* Android Device Mockup */}
            <div className="relative flex flex-col items-center">
              {/* Preview Bar with Material 3 Theme Toggle */}
              <div className="w-[380px] flex items-center justify-between mb-3 px-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="font-semibold text-slate-700">Pixel 8 Frame</span>
                  <span className="text-[10px] text-slate-400 font-mono">380×780dp</span>
                  {authRole === 'WORKER' && currentWorker ? (
                    <span className="ml-1 text-[10px] bg-amber-100 text-amber-800 border border-amber-300 font-bold px-1.5 py-0.5 rounded">
                      Worker: {currentWorker.workerId}
                    </span>
                  ) : authRole === 'ADMIN' ? (
                    <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-800 border border-indigo-300 font-bold px-1.5 py-0.5 rounded">
                      Admin Session
                    </span>
                  ) : (
                    <span className="ml-1 text-[10px] bg-slate-100 text-slate-600 border border-slate-300 font-medium px-1.5 py-0.5 rounded">
                      Signed Out
                    </span>
                  )}
                </div>

                {/* Theme Mode Toggle */}
                <div className="flex items-center bg-slate-200/90 p-0.5 rounded-lg border border-slate-300 shadow-2xs">
                  <button
                    onClick={() => setSimTheme('light')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      simTheme === 'light'
                        ? 'bg-white text-slate-900 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Primary Light Theme (Material 3)"
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    Light Theme
                  </button>
                  <button
                    onClick={() => setSimTheme('dark')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      simTheme === 'dark'
                        ? 'bg-slate-900 text-white shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Dark Theme Architecture Preview"
                  >
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    Dark M3
                  </button>
                </div>
              </div>

              {/* Phone Frame */}
              <div className="w-[380px] h-[780px] bg-slate-950 rounded-[48px] p-3.5 shadow-2xl shadow-black/80 border-4 border-slate-800 ring-1 ring-slate-700/50 flex flex-col relative overflow-hidden">
                {/* Phone Top Notch / Speaker */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-6 bg-slate-950 rounded-b-2xl z-40 flex items-center justify-center gap-3">
                  <div className="w-10 h-1 bg-slate-800 rounded-full" />
                  <div className="w-2.5 h-2.5 bg-slate-900 rounded-full ring-1 ring-slate-800" />
                </div>

                {/* Android Status Bar */}
                <div className="pt-2 px-6 pb-2 text-[11px] font-semibold text-slate-400 flex items-center justify-between z-30 select-none bg-slate-900">
                  <span>9:41 AM</span>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span>5G</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Screen Viewport with Dynamic Material 3 Theme */}
                <div className={`flex-1 ${simTheme === 'dark' ? 'bg-[#0F172A] text-slate-100' : 'bg-slate-50 text-slate-900'} overflow-y-auto relative flex flex-col select-none`}>
                  {/* Material 3 Confirmation Dialog Overlay */}
                  {confirmDialog && confirmDialog.isOpen && (
                    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fadeIn">
                      <div className={`w-full max-w-[300px] rounded-2xl p-5 shadow-2xl space-y-3.5 border ${
                        simTheme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                      }`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            confirmDialog.isDestructive ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'
                          }`}>
                            {confirmDialog.isDestructive ? <AlertCircle className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                          </div>
                          <div>
                            <h4 className={`font-bold text-sm leading-tight ${simTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                              {confirmDialog.title}
                            </h4>
                            <p className={`text-xs mt-1.5 leading-relaxed ${simTheme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                              {confirmDialog.message}
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-700">
                          <button
                            onClick={() => setConfirmDialog(null)}
                            className={`px-3 py-2 text-xs font-semibold rounded-lg ${
                              simTheme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              const action = confirmDialog.onConfirm;
                              setConfirmDialog(null);
                              action();
                            }}
                            className={`px-4 py-2 text-xs font-bold rounded-lg shadow-sm transition-colors ${
                              confirmDialog.isDestructive
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            }`}
                          >
                            {confirmDialog.confirmLabel}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Auth initializing state for protected screens */}
                  {(ADMIN_SCREENS.includes(currentScreen) || WORKER_SCREENS.includes(currentScreen)) && !authInitialized && (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#090A0F]">
                      <RefreshCw className="w-6 h-6 animate-spin text-amber-400 mb-3" />
                      <p className="text-xs text-zinc-400">Verifying session credentials...</p>
                    </div>
                  )}

                  {/* Render-level security fallback: if state is set to an admin screen without active Admin auth */}
                  {ADMIN_SCREENS.includes(currentScreen) && authInitialized && !isAdminAuthenticated && (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#090A0F]">
                      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-sm">
                        <Lock className="w-7 h-7" />
                      </div>
                      <h4 className="text-base font-bold text-white mb-1">Supervisor Authentication Required</h4>
                      <p className="text-xs text-zinc-400 max-w-xs mb-5">
                        This screen is strictly restricted to verified Site Administrators with active system status. Please sign in to continue.
                      </p>
                      <button
                        id="btn-guard-redirect-admin-login"
                        onClick={() => initiateAdminLogin()}
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Go to Admin Sign In</span>
                      </button>
                    </div>
                  )}

                  {/* Render-level security fallback: if state is set to a worker screen without active Worker auth */}
                  {WORKER_SCREENS.includes(currentScreen) && authInitialized && !isWorkerAuthenticated && (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#090A0F]">
                      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-sm">
                        <HardHat className="w-7 h-7" />
                      </div>
                      <h4 className="text-base font-bold text-white mb-1">Worker Authentication Required</h4>
                      <p className="text-xs text-zinc-400 max-w-xs mb-5">
                        This screen is restricted to registered civil workers with active profile status. Please sign in with your Worker ID and PIN.
                      </p>
                      <button
                        id="btn-guard-redirect-worker-login"
                        onClick={() => {
                          setPendingWorkerScreen(currentScreen);
                          setCurrentScreen('worker_login');
                        }}
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Go to Worker Sign In</span>
                      </button>
                    </div>
                  )}

                  {/* --- 1. SPLASH SCREEN --- */}
                  {currentScreen === 'splash' && (
                    <div className="flex-1 bg-[#0b1329] text-white flex flex-col items-center justify-between p-8 text-center relative overflow-hidden animate-fadeIn">
                      {/* Subtle blueprint grid overlay */}
                      <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />

                      <div className="pt-6 w-full flex justify-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          ANGEL ENTERPRISES
                        </span>
                      </div>

                      <div className="my-auto flex flex-col items-center max-w-xs">
                        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-xl shadow-amber-500/20 border-2 border-amber-300/40 mb-6">
                          <HardHat className="w-12 h-12 text-slate-950" />
                        </div>
                        <h2 className="text-2xl font-black text-white tracking-tight uppercase">ANGEL ENTERPRISES</h2>
                        <h3 className="text-sm font-bold text-amber-400 mt-1 uppercase tracking-wider">Civil Workforce Attendance System</h3>
                        <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                          Server-Authoritative QR Attendance, Geofenced Civil Sites, and Field Workforce Records.
                        </p>

                        <div className="mt-6 flex items-center gap-2 px-3 py-1 rounded-md bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
                          <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                          <span>Connecting to Secure Field Auth...</span>
                        </div>
                      </div>

                      <div className="w-full max-w-xs pb-4">
                        <button
                          id="btn-enter-operations-portal"
                          onClick={handleEnterOperationsPortal}
                          className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 rounded-xl text-xs font-black tracking-wider uppercase transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                        >
                          <span>Enter Operations Portal</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* --- 2. WELCOME SCREEN --- */}
                  {currentScreen === 'welcome' && (
                    <div className="flex-1 bg-[#090A0F] text-zinc-100 p-5 flex flex-col justify-between overflow-y-auto">
                      <div className="pt-4 text-center">
                        <div className="w-14 h-14 rounded-xl bg-amber-500 mx-auto flex items-center justify-center shadow-lg shadow-amber-500/20 border border-amber-400/50 mb-3">
                          <HardHat className="w-8 h-8 text-slate-950" />
                        </div>
                        <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase bg-amber-500/10 text-amber-300 border border-amber-500/30 mb-1">
                          ANGEL ENTERPRISES
                        </span>
                        <h2 className="text-xl font-black text-white tracking-tight">Civil Workforce Attendance System</h2>
                        <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                          Choose your portal to access field attendance, live rotating QR kiosk, and workforce deployment.
                        </p>
                      </div>

                      <div className="space-y-3 my-auto py-4">
                        {/* Worker Access Card */}
                        <div
                          onClick={() => setCurrentScreen('worker_login')}
                          className="bg-[#11141C] border border-[#202534] hover:border-amber-500/60 rounded-xl p-4 shadow-sm cursor-pointer transition-all hover:bg-[#151923] active:scale-[0.99] group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-sm font-bold">
                              <Users className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h3 className="font-bold text-sm text-white group-hover:text-amber-400 transition-colors">
                                  Civil Worker Portal
                                </h3>
                                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                  Field Access
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                                Mark attendance via site QR scanner, check today's status, and access payroll wage slips.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentScreen('worker_login');
                            }}
                            className="w-full mt-3 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-black text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            <span>Worker Sign In</span>
                          </button>
                        </div>

                        {/* Supervisor Access Card */}
                        <div
                          id="welcome-supervisor-card"
                          onClick={() => initiateAdminLogin()}
                          className="bg-[#11141C] border border-[#202534] hover:border-amber-500/60 rounded-xl p-4 shadow-sm cursor-pointer transition-all hover:bg-[#151923] active:scale-[0.99] group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#1B202D] text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-sm font-bold">
                              <ShieldCheck className="w-5 h-5 text-amber-400" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h3 className="font-bold text-sm text-white group-hover:text-amber-400 transition-colors">
                                  Supervisor / Admin Console
                                </h3>
                                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                                  Site Admin
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                                Launch live 30s rotating QR kiosk, verify workers, monitor active deployments, and audit reports.
                              </p>
                            </div>
                          </div>
                          <button
                            id="welcome-supervisor-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              initiateAdminLogin();
                            }}
                            className="w-full mt-3 py-2.5 bg-[#1B202D] hover:bg-[#23293A] text-amber-300 border border-amber-500/30 rounded-lg font-black text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                          >
                            <Shield className="w-3.5 h-3.5 text-amber-400" />
                            <span>Supervisor Sign In</span>
                          </button>
                        </div>
                      </div>

                      {/* Secondary Public Actions */}
                      <div className="pt-2 pb-2 border-t border-[#1E232E] flex items-center justify-between gap-2 text-xs">
                        <button
                          onClick={() => {
                            setRegistrationStep(1);
                            setCurrentScreen('worker_registration');
                          }}
                          className="flex-1 py-2 px-3 bg-[#11141C] hover:bg-[#161A24] border border-[#202534] text-zinc-300 rounded-lg text-center font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          First-Time Registration
                        </button>
                        <button
                          onClick={() => {
                            setSimError(null);
                            setStatusSearchError(null);
                            setCurrentScreen('track_status');
                          }}
                          className="flex-1 py-2 px-3 bg-[#11141C] hover:bg-[#161A24] border border-[#202534] text-zinc-300 rounded-lg text-center font-bold text-[11px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>Track Application</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* --- 3. ADMIN LOGIN --- */}
                  {currentScreen === 'admin_login' && (
                    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100">
                      <div className="bg-[#0E1118] text-white p-4 flex items-center gap-3 border-b border-[#1E232E]">
                        <button onClick={() => setCurrentScreen('welcome')} className="p-1 hover:bg-[#161A24] rounded text-zinc-400 hover:text-white transition-colors">
                          <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h3 className="font-bold text-base">Admin Portal</h3>
                      </div>

                      <div className="p-6 flex-1 flex flex-col justify-center">
                        <div className="bg-[#11141C] border border-[#202534] rounded-xl p-5 shadow-sm space-y-4">
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                              Site Operations
                            </span>
                            <h4 className="text-xl font-black text-white mt-2">Administrator Sign In</h4>
                            <p className="text-xs text-zinc-400 mt-0.5">Sign in with verified site administrator credentials.</p>
                          </div>

                          <div className="space-y-3.5">
                            <div>
                              <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Admin Email</label>
                              <input
                                id="input-admin-email"
                                type="email"
                                maxLength={MAX_EMAIL_LENGTH}
                                value={adminEmail}
                                onChange={(e) => setAdminEmail(e.target.value)}
                                placeholder="Enter supervisor email"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#202534] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 text-white placeholder:text-zinc-600 transition-colors"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Password</label>
                              <div className="relative">
                                <input
                                  id="input-admin-password"
                                  type={showPassword ? 'text' : 'password'}
                                  value={adminPassword}
                                  onChange={(e) => setAdminPassword(e.target.value)}
                                  placeholder="Enter password"
                                  autoComplete="new-password"
                                  className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#202534] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 text-white placeholder:text-zinc-600 transition-colors"
                                />
                                <button
                                  id="btn-toggle-admin-password"
                                  type="button"
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200"
                                >
                                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            <div className="text-right">
                              <button
                                type="button"
                                onClick={async () => {
                                  const sanitizedEmail = sanitizeEmailInput(adminEmail);
                                  if (!sanitizedEmail || !isValidEmail(sanitizedEmail)) {
                                    setSimError('Please enter your administrator email address above to receive a password reset link.');
                                    return;
                                  }
                                  try {
                                    setIsActionLoading(true);
                                    await sendPasswordResetEmail(auth, sanitizedEmail);
                                    setSimNotice(`Password reset instructions have been sent to ${sanitizedEmail}.`);
                                  } catch (err: any) {
                                    setSimError(FirebaseService.parseError(err));
                                  } finally {
                                    setIsActionLoading(false);
                                  }
                                }}
                                className="text-xs font-semibold text-amber-400 hover:text-amber-300 hover:underline"
                              >
                                Forgot Password?
                              </button>
                            </div>

                            <button
                              disabled={isActionLoading}
                              onClick={async () => {
                                const sanitizedEmail = sanitizeEmailInput(adminEmail);
                                if (!isValidEmail(sanitizedEmail) || !adminPassword) {
                                  setSimError('Please enter a valid administrator email address (max 254 characters) and password.');
                                  return;
                                }
                                try {
                                  setIsActionLoading(true);
                                  setSimError(null);
                                  const { profile, user } = await FirebaseService.loginAdmin(sanitizedEmail, adminPassword);
                                  setAuthUser(user || auth.currentUser);
                                  setIsAdminSessionVerified(true);
                                  setCurrentAdmin(profile);
                                  setAuthRole('ADMIN');
                                  try {
                                    await refreshAllData();
                                  } catch (syncErr) {
                                    console.warn('Initial admin data sync warning:', syncErr);
                                  }
                                  setCurrentScreen('admin_dashboard');
                                } catch (err: any) {
                                  setIsAdminSessionVerified(false);
                                  setCurrentAdmin(null);
                                  setAuthRole(null);
                                  setSimError(FirebaseService.parseError(err));
                                } finally {
                                  setIsActionLoading(false);
                                }
                              }}
                              id="btn-admin-signin"
                              className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-lg font-black text-xs uppercase tracking-wider transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                            >
                              {isActionLoading ? <RefreshCw className="w-4 h-4 animate-spin text-slate-950" /> : null}
                              <span>Sign In as Admin</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* --- 4. WORKER LOGIN --- */}
                  {currentScreen === 'worker_login' && (
                    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100">
                      <div className="bg-[#0E1118] text-white p-4 flex items-center gap-3 border-b border-[#1E232E]">
                        <button onClick={() => setCurrentScreen('welcome')} className="p-1 hover:bg-[#161A24] rounded text-zinc-400 hover:text-white transition-colors">
                          <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h3 className="font-bold text-base">Worker Sign In</h3>
                      </div>

                      <div className="p-6 flex-1 flex flex-col justify-center">
                        <div className="bg-[#11141C] border border-[#202534] rounded-xl p-5 shadow-sm space-y-4">
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              Field Personnel
                            </span>
                            <h4 className="text-xl font-black text-white mt-2">Worker Access</h4>
                            <p className="text-xs text-zinc-400 mt-0.5">Enter your assigned Worker ID or registered phone number.</p>
                          </div>

                          <div className="space-y-3.5">
                            <div>
                              <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Worker ID or Mobile Number</label>
                              <input
                                type="text"
                                value={workerIdentifier}
                                onChange={(e) => setWorkerIdentifier(e.target.value)}
                                placeholder="e.g. W-1001 or 9876543210"
                                className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#202534] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 text-white placeholder:text-zinc-600 transition-colors"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">PIN / Password</label>
                              <input
                                type="password"
                                value={workerPin}
                                onChange={(e) => setWorkerPin(e.target.value)}
                                placeholder="Security PIN"
                                className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#202534] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 text-white placeholder:text-zinc-600 transition-colors"
                              />
                            </div>

                            <div className="flex items-center justify-end text-xs pt-0.5">
                              <button
                                type="button"
                                onClick={() => setSimNotice('Worker PIN resets are handled by your assigned Site Supervisor. Please report to the site office with your Worker ID.')}
                                className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 hover:underline"
                              >
                                Forgot PIN?
                              </button>
                            </div>

                            <button
                              disabled={isActionLoading}
                              onClick={async () => {
                                if (!workerIdentifier.trim() || !workerPin.trim()) {
                                  setSimError('Please enter your Worker ID/Mobile and PIN.');
                                  return;
                                }
                                try {
                                  setIsActionLoading(true);
                                  setSimError(null);
                                  const { worker } = await FirebaseService.loginWorker(workerIdentifier, workerPin);
                                  setCurrentWorker(worker);
                                  setCurrentAdmin(null);
                                  setAuthRole('WORKER');
                                  if (pendingWorkerScreen) {
                                    setCurrentScreen(pendingWorkerScreen as any);
                                    setPendingWorkerScreen(null);
                                  } else {
                                    setCurrentScreen('worker_dashboard');
                                  }
                                } catch (err: any) {
                                  setSimError(FirebaseService.parseError(err));
                                } finally {
                                  setIsActionLoading(false);
                                }
                              }}
                              className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-lg font-black text-xs uppercase tracking-wider transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                            >
                              {isActionLoading ? <RefreshCw className="w-4 h-4 animate-spin text-slate-950" /> : null}
                              <span>Sign In to Field Portal</span>
                            </button>

                            <div className="relative py-2 text-center">
                              <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-[#1E232E]"></div>
                              </div>
                              <span className="relative bg-[#11141C] px-2 text-[10px] text-zinc-500 uppercase tracking-wider font-mono font-bold">or</span>
                            </div>

                            <button
                              onClick={() => {
                                setCurrentScreen('worker_registration');
                                setRegistrationStep(1);
                              }}
                              className="w-full py-2.5 bg-[#12151D] hover:bg-[#181C26] border border-[#202534] text-zinc-200 rounded-lg font-bold text-xs transition-colors cursor-pointer"
                            >
                              First-Time Registration
                            </button>

                            <button
                              onClick={() => {
                                setSimError(null);
                                setStatusSearchError(null);
                                setCurrentScreen('track_status');
                              }}
                              className="w-full py-2.5 bg-[#12151D] hover:bg-[#181C26] border border-[#202534] text-zinc-300 rounded-lg font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              <span>Track Application Status</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* --- 5. MULTI-STEP WORKER REGISTRATION --- */}
                  {currentScreen === 'worker_registration' && (
                    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
                      {/* Top Header */}
                      <div className="bg-[#0E1118] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-[#1E232E]">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              if (registrationStep > 1) setRegistrationStep((prev) => (prev - 1) as any);
                              else setCurrentScreen('worker_login');
                            }}
                            className="w-8 h-8 rounded-lg bg-[#161A24] hover:bg-[#202534] border border-[#252C3D] text-zinc-300 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
                            aria-label="Back"
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </button>
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              ANGEL ENTERPRISES
                            </span>
                            <h3 className="font-bold text-sm sm:text-base text-zinc-100 mt-0.5">Worker Onboarding & Credential Registration</h3>
                          </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
                          <span>STEP {registrationStep} OF 3</span>
                        </div>
                      </div>

                      {/* Engineering-Style Step Indicator */}
                      <div className="bg-[#11141C] px-4 sm:px-6 py-3 border-b border-[#1E232E]">
                        <div className="max-w-md mx-auto grid grid-cols-3 gap-2">
                          {[
                            { num: 1, label: 'Personal', code: '01. IDENT' },
                            { num: 2, label: 'Trade & Site', code: '02. TRADE' },
                            { num: 3, label: 'Security', code: '03. PIN' }
                          ].map((s) => {
                            const isCurrent = registrationStep === s.num;
                            const isCompleted = registrationStep > s.num;
                            return (
                              <div
                                key={s.num}
                                className={`flex flex-col items-center py-1.5 px-2 rounded-lg border transition-all ${
                                  isCurrent
                                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                                    : isCompleted
                                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                                    : 'bg-[#161A24] border-[#202534] text-zinc-400'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  {isCompleted ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <span className={`text-[10px] font-mono font-bold ${isCurrent ? 'text-amber-400' : 'text-zinc-400'}`}>
                                      {s.code}
                                    </span>
                                  )}
                                </div>
                                <span className={`text-[11px] font-semibold tracking-tight truncate max-w-full ${isCurrent ? 'text-white' : 'text-zinc-300'}`}>
                                  {s.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="p-4 sm:p-5 flex-1 max-w-xl mx-auto w-full space-y-4">
                        {/* Step 1: Personal Info */}
                        {registrationStep === 1 && (
                          <div className="bg-[#11141C] rounded-xl border border-[#202534] p-4 sm:p-5 shadow-sm space-y-4">
                            <div className="border-b border-[#1E232E] pb-3">
                              <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block">
                                SECTION 01 // CIV-ID
                              </span>
                              <h4 className="font-bold text-sm text-zinc-100 mt-0.5">Personal Identity & Legal Contact</h4>
                              <p className="text-xs text-zinc-400 mt-0.5">Government verified details for civil contractor workforce enrollment.</p>
                            </div>

                            <div className="space-y-3.5">
                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">
                                  Full Legal Name <span className="text-amber-400">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={regForm.fullName}
                                  onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                                  placeholder="e.g. Ramesh Kumar Patel"
                                  className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-medium placeholder:text-zinc-600 transition-colors"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">
                                    Date of Birth <span className="text-amber-400">*</span>
                                  </label>
                                  <input
                                    type="date"
                                    value={regForm.dateOfBirth}
                                    onChange={(e) => setRegForm({ ...regForm, dateOfBirth: e.target.value })}
                                    className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-medium transition-colors"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">
                                    Mobile Number (10 Digits) <span className="text-amber-400">*</span>
                                  </label>
                                  <input
                                    type="tel"
                                    maxLength={MAX_PHONE_LENGTH}
                                    value={regForm.phone}
                                    onChange={(e) => setRegForm({ ...regForm, phone: sanitizePhoneInput(e.target.value) })}
                                    placeholder="9876543210"
                                    className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-mono font-medium placeholder:text-zinc-600 transition-colors"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">
                                  Email Address <span className="text-amber-400">*</span>
                                </label>
                                <input
                                  type="email"
                                  maxLength={MAX_EMAIL_LENGTH}
                                  value={regForm.email}
                                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                                  placeholder="worker.name@civilwork.com"
                                  className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-medium placeholder:text-zinc-600 transition-colors"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">
                                  Permanent Residential Address <span className="text-amber-400">*</span>
                                </label>
                                <textarea
                                  value={regForm.address}
                                  onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                                  placeholder="Village/Town, District, State, Pincode"
                                  rows={2}
                                  className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-medium placeholder:text-zinc-600 transition-colors"
                                />
                              </div>

                              <div className="pt-2 border-t border-[#1E232E]">
                                <span className="text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider block mb-2">
                                  Emergency Site Contact
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <input
                                    type="text"
                                    value={regForm.emergencyName}
                                    onChange={(e) => setRegForm({ ...regForm, emergencyName: e.target.value })}
                                    placeholder="Contact Person Name"
                                    className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-medium placeholder:text-zinc-600 transition-colors"
                                  />
                                  <input
                                    type="tel"
                                    maxLength={MAX_PHONE_LENGTH}
                                    value={regForm.emergencyPhone}
                                    onChange={(e) => setRegForm({ ...regForm, emergencyPhone: sanitizePhoneInput(e.target.value) })}
                                    placeholder="Emergency Phone"
                                    className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-mono font-medium placeholder:text-zinc-600 transition-colors"
                                  />
                                </div>
                              </div>

                              <button
                                onClick={() => {
                                  const sanitizedEmail = sanitizeEmailInput(regForm.email);
                                  if (!regForm.fullName.trim() || !regForm.phone.trim() || !sanitizedEmail) {
                                    setSimError('Please fill in required personal fields (Name, Phone, Email).');
                                    return;
                                  }
                                  if (!isValidPhone(regForm.phone)) {
                                    setSimError('Mobile phone number must be exactly 10 digits starting with 6, 7, 8, or 9 (digits only, no +91, spaces or symbols).');
                                    return;
                                  }
                                  if (regForm.emergencyPhone.trim() && !isValidPhone(regForm.emergencyPhone)) {
                                    setSimError('Emergency contact phone must be exactly 10 digits starting with 6, 7, 8, or 9 (digits only, no +91, spaces or symbols).');
                                    return;
                                  }
                                  if (!isValidEmail(sanitizedEmail)) {
                                    setSimError('Please enter a valid email address (maximum 254 characters, e.g. name@example.com).');
                                    return;
                                  }
                                  setRegForm({ ...regForm, email: sanitizedEmail });
                                  setRegistrationStep(2);
                                }}
                                className="w-full min-h-[44px] py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer mt-2"
                              >
                                <span>Continue to Trade & Site</span>
                                <ArrowLeft className="w-4 h-4 rotate-180 text-zinc-950" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Step 2: Employment Info */}
                        {registrationStep === 2 && (
                          <div className="bg-[#11141C] rounded-xl border border-[#202534] p-4 sm:p-5 shadow-sm space-y-4">
                            <div className="border-b border-[#1E232E] pb-3">
                              <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block">
                                SECTION 02 // TRADE & DEPLOYMENT
                              </span>
                              <h4 className="font-bold text-sm text-zinc-100 mt-0.5">Trade Role & Site Allocation</h4>
                              <p className="text-xs text-zinc-400 mt-0.5">Designate operational batch and primary civil construction project site.</p>
                            </div>

                            {/* System-Assigned Worker ID Info */}
                            <div className="p-3 bg-[#161A24] border border-[#202534] rounded-lg flex items-start gap-2.5 text-zinc-200">
                              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                              <div className="text-xs">
                                <p className="font-bold text-amber-400">Sequential Worker ID Provisioning</p>
                                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                                  Your permanent civil identity (e.g. <span className="font-mono font-bold text-amber-400">W-1001</span>) will be sequentially generated and bound to this site upon supervisor approval.
                                </p>
                              </div>
                            </div>

                            <div className="space-y-3.5">
                              {/* Batch Selection */}
                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">
                                  Operational Workforce Batch <span className="text-amber-400">*</span>
                                </label>
                                <select
                                  id="select-reg-batch"
                                  value={regForm.batchNumber}
                                  onChange={(e) => setRegForm({ ...regForm, batchNumber: e.target.value })}
                                  className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-medium transition-colors cursor-pointer"
                                >
                                  {batches.filter((b) => b.status === 'ACTIVE').length === 0 ? (
                                    <option value="B-01">B-01 - Standard Civil Construction Cohort</option>
                                  ) : (
                                    batches
                                      .filter((b) => b.status === 'ACTIVE')
                                      .map((batch) => (
                                        <option key={batch.batchId} value={batch.batchId}>
                                          {batch.batchId} — {batch.name}
                                        </option>
                                      ))
                                  )}
                                </select>
                                <p className="text-[10px] text-zinc-400 mt-1">Designated work crew and supervisor reporting unit.</p>
                              </div>

                              {/* Job Role / Trade */}
                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">
                                  Primary Trade Specialization <span className="text-amber-400">*</span>
                                </label>
                                <select
                                  value={regForm.jobRole}
                                  onChange={(e) => setRegForm({ ...regForm, jobRole: e.target.value })}
                                  className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-medium transition-colors cursor-pointer"
                                >
                                  {[
                                    'Mason',
                                    'Helper',
                                    'Carpenter',
                                    'Bar Bender',
                                    'Concrete Worker',
                                    'Scaffolder',
                                    'Excavation Laborer',
                                    'Site Foreman',
                                    'Supervisor',
                                    'Other'
                                  ].map((role) => (
                                    <option key={role} value={role}>
                                      {role}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Construction Site */}
                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">
                                  Primary Construction Site <span className="text-amber-400">*</span>
                                </label>
                                <select
                                  id="select-reg-site"
                                  value={regForm.siteId}
                                  onChange={(e) => setRegForm({ ...regForm, siteId: e.target.value })}
                                  className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-medium transition-colors cursor-pointer"
                                >
                                  {sites.filter((s) => s.status === 'ACTIVE').length === 0 ? (
                                    <option value="SITE-101">SITE-101 - Metro Transit Station (Default)</option>
                                  ) : (
                                    sites
                                      .filter((s) => s.status === 'ACTIVE')
                                      .map((site) => (
                                        <option key={site.siteId} value={site.siteId}>
                                          {site.siteId} — {site.siteName}
                                        </option>
                                      ))
                                  )}
                                </select>
                              </div>

                              {/* Joining Date */}
                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">
                                  Target Site Reporting Date <span className="text-amber-400">*</span>
                                </label>
                                <input
                                  type="date"
                                  value={regForm.joiningDate}
                                  onChange={(e) => setRegForm({ ...regForm, joiningDate: e.target.value })}
                                  className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-medium transition-colors"
                                />
                              </div>

                              <div className="flex gap-2.5 pt-2">
                                <button
                                  onClick={() => setRegistrationStep(1)}
                                  className="w-1/3 min-h-[44px] py-3 bg-[#161A24] hover:bg-[#202534] border border-[#252C3D] text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                                >
                                  Back
                                </button>
                                <button
                                  onClick={() => {
                                    if (!regForm.batchNumber) {
                                      setSimError('Please select an assigned workforce batch.');
                                      return;
                                    }
                                    setRegistrationStep(3);
                                  }}
                                  className="w-2/3 min-h-[44px] py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                >
                                  <span>Proceed to PIN Setup</span>
                                  <ArrowLeft className="w-4 h-4 rotate-180 text-zinc-950" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Step 3: Account Security */}
                        {registrationStep === 3 && (
                          <div className="bg-[#11141C] rounded-xl border border-[#202534] p-4 sm:p-5 shadow-sm space-y-4">
                            <div className="border-b border-[#1E232E] pb-3">
                              <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block">
                                SECTION 03 // SECURITY & SUBMIT
                              </span>
                              <h4 className="font-bold text-sm text-zinc-100 mt-0.5">Authentication PIN & Verification</h4>
                              <p className="text-xs text-zinc-400 mt-0.5">Set a 6-digit security PIN used for quick daily attendance and portal sign in.</p>
                            </div>

                            <div className="space-y-3.5">
                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">
                                  Security PIN / Password (min 6 chars) <span className="text-amber-400">*</span>
                                </label>
                                <input
                                  type="password"
                                  value={regForm.passwordPin}
                                  onChange={(e) => setRegForm({ ...regForm, passwordPin: e.target.value })}
                                  placeholder="••••••"
                                  className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-mono font-medium placeholder:text-zinc-600 transition-colors"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">
                                  Confirm Security PIN <span className="text-amber-400">*</span>
                                </label>
                                <input
                                  type="password"
                                  value={regForm.confirmPin}
                                  onChange={(e) => setRegForm({ ...regForm, confirmPin: e.target.value })}
                                  placeholder="••••••"
                                  className="w-full px-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-zinc-100 font-mono font-medium placeholder:text-zinc-600 transition-colors"
                                />
                              </div>

                              <div className="p-3 bg-[#161A24] border border-[#202534] rounded-lg flex items-start gap-2.5">
                                <input
                                  type="checkbox"
                                  id="terms"
                                  checked={regForm.termsAccepted}
                                  onChange={(e) => setRegForm({ ...regForm, termsAccepted: e.target.checked })}
                                  className="mt-0.5 h-4 w-4 accent-amber-500 cursor-pointer rounded"
                                />
                                <label htmlFor="terms" className="text-[11px] text-zinc-300 leading-snug cursor-pointer font-medium">
                                  I certify that all submitted identification, trade details, and emergency contacts are genuine. I agree to in-person identity verification by the site supervisor before field deployment.
                                </label>
                              </div>

                              <div className="flex gap-2.5 pt-2">
                                <button
                                  onClick={() => setRegistrationStep(2)}
                                  className="w-1/3 min-h-[44px] py-3 bg-[#161A24] hover:bg-[#202534] border border-[#252C3D] text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                                >
                                  Back
                                </button>
                                <button
                                  disabled={isActionLoading}
                                  onClick={async () => {
                                    if (!regForm.passwordPin || regForm.passwordPin.length < 6) {
                                      setSimError('PIN/Password must be at least 6 characters.');
                                      return;
                                    }
                                    if (regForm.passwordPin !== regForm.confirmPin) {
                                      setSimError('Passwords do not match.');
                                      return;
                                    }
                                    if (!regForm.termsAccepted) {
                                      setSimError('Please accept verification terms.');
                                      return;
                                    }
                                    if (!isValidPhone(regForm.phone)) {
                                      setSimError('Mobile phone number must be exactly 10 digits starting with 6, 7, 8, or 9 (digits only, no +91, spaces or symbols).');
                                      return;
                                    }
                                    if (regForm.emergencyPhone.trim() && !isValidPhone(regForm.emergencyPhone)) {
                                      setSimError('Emergency contact phone must be exactly 10 digits starting with 6, 7, 8, or 9 (digits only, no +91, spaces or symbols).');
                                      return;
                                    }
                                    const sanitizedEmail = sanitizeEmailInput(regForm.email);
                                    if (!isValidEmail(sanitizedEmail)) {
                                      setSimError('Please enter a valid email address (maximum 254 characters).');
                                      return;
                                    }

                                    try {
                                      setIsActionLoading(true);
                                      setSimError(null);
                                      const chosenSiteId = regForm.siteId || (sites[0]?.siteId ?? 'SITE-101');
                                      const regId = await FirebaseService.submitWorkerRegistration(
                                        {
                                          fullName: regForm.fullName.trim() || 'New Applicant',
                                          dateOfBirth: regForm.dateOfBirth.trim() || '1996-01-01',
                                          phone: sanitizePhoneInput(regForm.phone),
                                          email: normalizeEmail(sanitizedEmail),
                                          address: regForm.address.trim() || 'Civil site camp',
                                          emergencyContactName: regForm.emergencyName.trim() || 'Site Supervisor',
                                          emergencyContactPhone: sanitizePhoneInput(regForm.emergencyPhone) || sanitizePhoneInput(regForm.phone),
                                          workerId: '',
                                          batchNumber: regForm.batchNumber.trim() || (batches[0]?.batchId ?? 'B-01'),
                                          jobRole: regForm.jobRole,
                                          siteId: chosenSiteId,
                                          joiningDate: regForm.joiningDate.trim() || new Date().toISOString().split('T')[0]
                                        },
                                        regForm.passwordPin
                                      );

                                      setLastSubmittedRegId(regId);
                                      setStatusLookupInput(regId);
                                      setSimNotice(
                                        `Registration submitted successfully. Registration ID: ${regId}. Status: PENDING (Under supervisor review).`
                                      );
                                      setRegistrationStep(1);
                                      setRegForm({
                                        fullName: '',
                                        dateOfBirth: '',
                                        phone: '',
                                        email: '',
                                        address: '',
                                        emergencyName: '',
                                        emergencyPhone: '',
                                        workerId: '',
                                        batchNumber: batches[0]?.batchId || 'B-01',
                                        jobRole: 'Helper',
                                        siteId: sites[0]?.siteId || 'SITE-101',
                                        joiningDate: '',
                                        passwordPin: '',
                                        confirmPin: '',
                                        termsAccepted: false
                                      });
                                      setCurrentScreen('track_status');
                                      try {
                                        const res = await FirebaseService.trackApplicationStatus(regId);
                                        setStatusResult(res);
                                      } catch (e) {
                                        console.warn('Auto status lookup error:', e);
                                      }
                                    } catch (err: any) {
                                      setSimError(FirebaseService.parseError(err));
                                    } finally {
                                      setIsActionLoading(false);
                                    }
                                  }}
                                  className="w-2/3 min-h-[44px] py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                >
                                  {isActionLoading ? <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" /> : <ShieldCheck className="w-4 h-4" />}
                                  <span>Submit Application</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* --- TRACK APPLICATION STATUS SCREEN --- */}
                  {currentScreen === 'track_status' && (
                    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
                      {/* Top Header */}
                      <div className="bg-[#0E1118] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-20 border-b border-[#1E232E]">
                        <button
                          onClick={() => {
                            setStatusSearchError(null);
                            setCurrentScreen('worker_login');
                          }}
                          className="w-8 h-8 rounded-lg bg-[#161A24] hover:bg-[#202534] border border-[#252C3D] text-zinc-300 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
                          title="Back to Worker Login"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            ANGEL ENTERPRISES
                          </span>
                          <h3 className="font-bold text-sm sm:text-base text-zinc-100 mt-0.5">Application Verification & Status</h3>
                        </div>
                      </div>

                      <div className="p-4 sm:p-5 flex-1 max-w-xl mx-auto w-full space-y-4">
                        {/* Notice or quick prefilled banner */}
                        {lastSubmittedRegId && (
                          <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl p-3.5 text-xs text-amber-200 flex items-start gap-3">
                            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-amber-300">Application Submitted Under Review</p>
                              <p className="text-[11px] text-amber-300/80 mt-0.5 leading-snug">
                                Registration ID: <span className="font-mono font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">{lastSubmittedRegId}</span>. Status is actively queued for site supervisor approval.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Search Card */}
                        <div className="bg-[#11141C] border border-[#202534] rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 block mb-1">
                              CIVIL IDENTITY LOOKUP
                            </span>
                            <label className="block text-xs font-bold text-zinc-200 mb-1">
                              Registration ID or Worker ID
                            </label>
                            <p className="text-[11px] text-zinc-400 mb-2.5">
                              Lookup real-time status using your assigned Worker ID (<span className="font-mono text-amber-400">W-1001</span>) or Application ID (<span className="font-mono text-amber-400">REG-XXXXXX</span>).
                            </p>
                            <div className="relative">
                              <input
                                type="text"
                                value={statusLookupInput}
                                onChange={(e) => setStatusLookupInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleStatusLookup();
                                  }
                                }}
                                placeholder="e.g. W-1001 or REG-481920"
                                className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-[#090A0F] border border-[#252C3D] rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 font-mono text-zinc-100 font-medium placeholder:text-zinc-600 transition-colors"
                              />
                              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                            </div>
                          </div>

                          <button
                            disabled={statusSearchLoading || !statusLookupInput.trim()}
                            onClick={handleStatusLookup}
                            className={`w-full min-h-[44px] py-2.5 rounded-lg font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer ${
                              statusSearchLoading || !statusLookupInput.trim()
                                ? 'bg-[#161A24] text-zinc-600 border border-[#202534] cursor-not-allowed'
                                : 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                            }`}
                          >
                            {statusSearchLoading ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
                                <span>Verifying Records...</span>
                              </>
                            ) : (
                              <>
                                <Search className="w-4 h-4 text-zinc-950" />
                                <span>Check Application Status</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Error Message */}
                        {statusSearchError && (
                          <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-200">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold">Record Not Found</p>
                              <p className="text-[11px] text-red-300 mt-0.5">{statusSearchError}</p>
                            </div>
                          </div>
                        )}

                        {/* Result Display Card (Applicant Dossier / Timeline) */}
                        {statusResult && (
                          <div className="bg-[#11141C] border border-[#202534] rounded-xl overflow-hidden shadow-sm">
                            {/* Dossier Header */}
                            <div className="bg-[#0E1118] p-4 text-white border-b border-[#1E232E] flex items-start justify-between gap-2">
                              <div>
                                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                                  OFFICIAL CIVIL APPLICANT DOSSIER
                                </span>
                                <h4 className="font-bold text-base text-zinc-100 mt-0.5">{statusResult.workerName}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                                    ID: {statusResult.workerId}
                                  </span>
                                </div>
                              </div>

                              {/* Status Badge */}
                              {statusResult.status === 'PENDING' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                  <span>PENDING REVIEW</span>
                                </span>
                              )}
                              {statusResult.status === 'ACTIVE' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>VERIFIED & ACTIVE</span>
                                </span>
                              )}
                              {statusResult.status === 'REJECTED' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  <UserX className="w-3.5 h-3.5 text-rose-400" />
                                  <span>REJECTED</span>
                                </span>
                              )}
                              {statusResult.status === 'SUSPENDED' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-[#161A24] text-zinc-300 border border-[#252C3D]">
                                  <BadgeAlert className="w-3.5 h-3.5 text-zinc-400" />
                                  <span>SUSPENDED</span>
                                </span>
                              )}
                            </div>

                            {/* Visual Timeline */}
                            <div className="p-4 bg-[#161A24] border-b border-[#1E232E]">
                              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 block mb-2.5">
                                VERIFICATION PIPELINE
                              </span>
                              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
                                <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 font-mono">
                                  <span>1. SUBMITTED</span>
                                </div>
                                <div
                                  className={`p-2 rounded-lg border font-mono ${
                                    statusResult.status === 'PENDING'
                                      ? 'bg-amber-950/40 border-amber-500/40 text-amber-300 animate-pulse'
                                      : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                                  }`}
                                >
                                  <span>2. SUPERVISOR REVIEW</span>
                                </div>
                                <div
                                  className={`p-2 rounded-lg border font-mono ${
                                    statusResult.status === 'ACTIVE'
                                      ? 'bg-emerald-600 text-white border-emerald-500'
                                      : statusResult.status === 'REJECTED'
                                      ? 'bg-rose-600 text-white border-rose-500'
                                      : 'bg-[#0E1118] border-[#252C3D] text-zinc-500'
                                  }`}
                                >
                                  <span>3. {statusResult.status === 'ACTIVE' ? 'APPROVED' : statusResult.status === 'REJECTED' ? 'REJECTED' : 'DECISION'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="p-4 sm:p-5 space-y-4">
                              {/* Metadata grid */}
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-[#161A24] p-2.5 rounded-lg border border-[#202534]">
                                  <span className="text-[10px] font-mono uppercase font-bold text-zinc-400 block">Record ID</span>
                                  <span className="font-mono font-bold text-zinc-200">{statusResult.workerId}</span>
                                </div>
                                <div className="bg-[#161A24] p-2.5 rounded-lg border border-[#202534]">
                                  <span className="text-[10px] font-mono uppercase font-bold text-zinc-400 block">Filing Timestamp</span>
                                  <span className="font-medium text-zinc-300">
                                    {statusResult.submittedAt ? statusResult.submittedAt.split('T')[0] : 'Recently'}
                                  </span>
                                </div>
                              </div>

                              {/* Explanation Callout */}
                              <div
                                className={`p-3.5 rounded-xl border text-xs ${
                                  statusResult.status === 'PENDING'
                                    ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                                    : statusResult.status === 'ACTIVE'
                                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                                    : statusResult.status === 'REJECTED'
                                    ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                                    : 'bg-[#161A24] border-[#202534] text-zinc-300'
                                }`}
                              >
                                <div className="font-bold text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5 font-mono">
                                  {statusResult.status === 'PENDING' && <span>Notice: Physical Verification Queued</span>}
                                  {statusResult.status === 'ACTIVE' && <span>Notice: Ready for Daily Site Attendance</span>}
                                  {statusResult.status === 'REJECTED' && (
                                    <>
                                      <UserX className="w-3.5 h-3.5 text-rose-400" />
                                      <span>Notice: Verification Unsuccessful</span>
                                    </>
                                  )}
                                  {statusResult.status === 'SUSPENDED' && <span>Notice: Account Suspended</span>}
                                </div>

                                {statusResult.status === 'REJECTED' && statusResult.rejectionReason && (
                                  <div className="my-2 p-2.5 bg-[#0E1118] border border-rose-500/40 rounded-lg shadow-xs">
                                    <span className="font-mono font-bold text-rose-400 block text-[10px] uppercase tracking-wider mb-0.5">
                                      Supervisor Reason:
                                    </span>
                                    <p className="text-xs text-rose-200 font-medium leading-relaxed">
                                      {statusResult.rejectionReason}
                                    </p>
                                  </div>
                                )}

                                <p className="text-xs leading-relaxed text-zinc-300">{statusResult.statusExplanation}</p>
                              </div>

                              {/* Contextual actions */}
                              {statusResult.status === 'ACTIVE' && (
                                <button
                                  onClick={() => {
                                    setWorkerIdentifier(statusResult.workerId);
                                    setSimError(null);
                                    setSimNotice('Application approved! Please enter your worker password PIN to sign in.');
                                    setCurrentScreen('worker_login');
                                  }}
                                  className="w-full min-h-[44px] py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                                >
                                  <Users className="w-4 h-4" />
                                  <span>Proceed to Worker Sign In</span>
                                </button>
                              )}

                              {statusResult.status === 'REJECTED' && (
                                <button
                                  onClick={() => {
                                    setCurrentScreen('worker_registration');
                                    setRegistrationStep(1);
                                  }}
                                  className="w-full min-h-[44px] py-3 bg-[#161A24] hover:bg-[#202534] border border-[#252C3D] text-zinc-200 font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                                >
                                  Submit New Application
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setStatusResult(null);
                                  setStatusLookupInput('');
                                  setStatusSearchError(null);
                                }}
                                className="w-full py-2 text-zinc-400 hover:text-zinc-200 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
                              >
                                Clear & Lookup Another ID
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Informational Card */}
                        <div className="bg-[#11141C] border border-[#202534] rounded-xl p-3.5 text-zinc-400 text-xs space-y-1">
                          <p className="font-bold text-zinc-200 flex items-center gap-1.5">
                            <HardHat className="w-3.5 h-3.5 text-amber-400" />
                            <span>Site Verification Policy</span>
                          </p>
                          <p className="text-[11px] leading-relaxed">
                            Site administration verifies identity, trade role, and biometric attendance suitability before approving registrations. Once approved, workers can immediately record attendance on civil construction sites.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* --- 7. ADMIN DASHBOARD --- */}
                  {isAdminAuthenticated && currentScreen === 'admin_dashboard' && (
                    <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto">
                      {/* Command Center Header */}
                      <div className="bg-[#0B1120] text-white p-3.5 sm:p-4 flex items-center justify-between sticky top-0 z-20 border-b border-slate-800 shadow-md">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <Shield className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-sm sm:text-base text-white tracking-tight">Supervisor Command Center</h3>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                LIVE
                              </span>
                            </div>
                            <span className="text-[10px] text-amber-400 font-mono tracking-wider">ANGEL ENTERPRISES // CIVIL OPS</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => refreshAllData()}
                            disabled={isDbLoading}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-[10px] font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
                            title="Sync Live Firestore Data"
                          >
                            <RefreshCw className={`w-3 h-3 text-amber-400 ${isDbLoading ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">Sync Live</span>
                          </button>
                          <button
                            id="btn-admin-dashboard-signout"
                            onClick={handleUniversalSignOut}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
                            title="Sign Out"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="p-3 sm:p-4 space-y-3.5">
                        {/* Section 1: Hero Deployment Operations (Asymmetric Focus) */}
                        <div className="bg-[#0f172a] text-white rounded-2xl border border-slate-800 p-4 shadow-sm relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-48 h-48 bg-radial from-amber-500/10 to-transparent pointer-events-none" />

                          <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2.5">
                            <div className="flex items-center gap-2">
                              <HardHat className="w-4 h-4 text-amber-400" />
                              <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">
                                Real-Time Workforce Deployment
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                              GEOFENCE ENFORCED
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                            {/* Primary Massive Metric */}
                            <div className="sm:col-span-2 bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                                Active on Construction Sites
                              </span>
                              <div className="flex items-baseline gap-2 mt-1 mb-2">
                                <span className="text-3xl font-black text-emerald-400 font-mono tracking-tight">
                                  {dashboardStats.activeWorkers}
                                </span>
                                <span className="text-sm font-bold text-slate-400">
                                  / {dashboardStats.totalWorkers} Enrolled Workers
                                </span>
                              </div>

                              {/* Progress bar */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                                  <span>Shift Attendance Rate</span>
                                  <span className="font-bold text-amber-400">
                                    {Math.round((dashboardStats.activeWorkers / (dashboardStats.totalWorkers || 1)) * 100)}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <div
                                    className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${Math.min(100, Math.round((dashboardStats.activeWorkers / (dashboardStats.totalWorkers || 1)) * 100))}%`
                                    }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Secondary Quick Metrics Rail */}
                            <div className="grid grid-cols-2 sm:grid-cols-1 gap-2">
                              <div
                                onClick={() => navigateToScreen('admin_sites')}
                                className="bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 rounded-xl p-2.5 cursor-pointer transition-all group"
                              >
                                <div className="flex items-center justify-between text-slate-400 mb-0.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wider">Active Sites</span>
                                  <Building2 className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-xl font-black text-white group-hover:text-sky-400 transition-colors font-mono">
                                    {dashboardStats.totalSites}
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-medium">geofenced</span>
                                </div>
                              </div>

                              <div
                                onClick={() => navigateToScreen('pending_registrations')}
                                className="bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 rounded-xl p-2.5 cursor-pointer transition-all group"
                              >
                                <div className="flex items-center justify-between text-slate-400 mb-0.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wider">Pending Reg.</span>
                                  <Clock className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                  <span className={`text-xl font-black font-mono transition-colors ${
                                    dashboardStats.pendingRegistrations > 0 ? 'text-amber-400 group-hover:text-amber-300' : 'text-slate-400'
                                  }`}>
                                    {dashboardStats.pendingRegistrations}
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-medium">
                                    {dashboardStats.pendingRegistrations > 0 ? 'needs review' : 'all clear'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Section 2: Actionable Operational Alert Banner */}
                        {dashboardStats.pendingRegistrations > 0 && (
                          <div
                            onClick={() => navigateToScreen('pending_registrations')}
                            className="p-3 bg-amber-500/10 border-2 border-amber-500/40 rounded-xl flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-500/15 transition-all shadow-2xs group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-bold shadow-xs">
                                <BadgeAlert className="w-4 h-4 animate-bounce" />
                              </div>
                              <div className="min-w-0">
                                <h5 className="text-xs font-black text-amber-900 uppercase tracking-tight truncate">
                                  Action Required: {dashboardStats.pendingRegistrations} Pending Registration(s)
                                </h5>
                                <p className="text-[10px] text-amber-700 font-medium truncate">
                                  Identity and trade verification required before site access.
                                </p>
                              </div>
                            </div>
                            <span className="px-2.5 py-1 bg-amber-500 group-hover:bg-amber-400 text-slate-950 rounded-lg text-[10px] font-black shrink-0 flex items-center gap-1 shadow-2xs">
                              <span>Review</span>
                              <ChevronRight className="w-3 h-3" />
                            </span>
                          </div>
                        )}

                        {/* Section 3: Operations & Control Console (Structured Clusters) */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Operations & Control Console</span>
                            </h4>
                            <span className="text-[10px] font-mono font-bold text-slate-400">3 Operational Clusters</span>
                          </div>

                          {/* Cluster 1: Workforce & Site Registry */}
                          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                              1. Workforce & Site Registry
                            </span>
                            <div className="grid grid-cols-4 gap-2">
                              <button
                                id="admin-dashboard-workers-btn"
                                onClick={() => navigateToScreen('admin_workers')}
                                className="p-2.5 bg-slate-50 hover:bg-indigo-50/60 border border-slate-200 hover:border-indigo-300 rounded-xl text-center font-bold text-slate-800 shadow-2xs flex flex-col items-center gap-1 transition-all active:scale-95 group"
                              >
                                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                  <Users className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-[11px] font-bold">Workers</span>
                                <span className="text-[9px] font-mono text-slate-500 font-semibold">{workers.length} Total</span>
                              </button>

                              <button
                                id="admin-dashboard-sites-btn"
                                onClick={() => navigateToScreen('admin_sites')}
                                className="p-2.5 bg-slate-50 hover:bg-indigo-50/60 border border-slate-200 hover:border-indigo-300 rounded-xl text-center font-bold text-slate-800 shadow-2xs flex flex-col items-center gap-1 transition-all active:scale-95 group"
                              >
                                <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                                  <Building2 className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-[11px] font-bold">Sites</span>
                                <span className="text-[9px] font-mono text-slate-500 font-semibold">{sites.length} Active</span>
                              </button>

                              <button
                                id="admin-dashboard-batches-btn"
                                onClick={() => navigateToScreen('admin_batches')}
                                className="p-2.5 bg-slate-50 hover:bg-indigo-50/60 border border-slate-200 hover:border-indigo-300 rounded-xl text-center font-bold text-slate-800 shadow-2xs flex flex-col items-center gap-1 transition-all active:scale-95 group"
                              >
                                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                                  <Layers className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-[11px] font-bold">Batches</span>
                                <span className="text-[9px] font-mono text-slate-500 font-semibold">{batches.length} Cohorts</span>
                              </button>

                              <button
                                id="admin-dashboard-approvals-btn"
                                onClick={() => navigateToScreen('pending_registrations')}
                                className="p-2.5 bg-slate-50 hover:bg-amber-50/60 border border-slate-200 hover:border-amber-300 rounded-xl text-center font-bold text-slate-800 shadow-2xs flex flex-col items-center gap-1 transition-all active:scale-95 group relative"
                              >
                                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                                  <FileCheck className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-[11px] font-bold">Approvals</span>
                                <span className={`text-[9px] font-mono font-semibold ${
                                  dashboardStats.pendingRegistrations > 0 ? 'text-amber-600 font-black' : 'text-slate-500'
                                }`}>
                                  {dashboardStats.pendingRegistrations} Pending
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* Cluster 2: Site Field Operations & Gate */}
                          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                              2. Field Operations & Attendance Gate
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                id="admin-dashboard-qr-kiosk-btn"
                                onClick={() => navigateToScreen('admin_qr_kiosk')}
                                className="p-2.5 bg-indigo-900 hover:bg-indigo-950 text-white rounded-xl text-center font-bold text-[11px] shadow-2xs flex flex-col items-center gap-1 transition-all active:scale-95 border border-indigo-800 group"
                              >
                                <QrCode className="w-5 h-5 text-amber-300 group-hover:scale-110 transition-transform" />
                                <span className="font-black">QR Gate Kiosk</span>
                                <span className="text-[9px] text-indigo-300 font-normal">Site Attendance</span>
                              </button>

                              <button
                                id="admin-dashboard-leave-btn"
                                onClick={() => navigateToScreen('admin_leave')}
                                className="p-2.5 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-center font-bold text-[11px] shadow-2xs flex flex-col items-center gap-1 transition-all active:scale-95 border border-slate-800 group"
                              >
                                <Calendar className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                                <span className="font-bold">Leave</span>
                                <span className="text-[9px] text-slate-400 font-normal">Approvals</span>
                              </button>

                              <button
                                id="admin-dashboard-overtime-btn"
                                onClick={() => navigateToScreen('admin_overtime')}
                                className="p-2.5 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-center font-bold text-[11px] shadow-2xs flex flex-col items-center gap-1 transition-all active:scale-95 border border-slate-800 group"
                              >
                                <Clock className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                                <span className="font-bold">Overtime</span>
                                <span className="text-[9px] text-slate-400 font-normal">Shift Claims</span>
                              </button>
                            </div>
                          </div>

                          {/* Cluster 3: Governance & Financial Audit */}
                          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                              3. Financial & Governance Audit
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                id="admin-dashboard-salary-btn"
                                onClick={() => navigateToScreen('admin_salary')}
                                className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center font-bold text-slate-800 shadow-2xs flex flex-col items-center gap-1 transition-all active:scale-95"
                              >
                                <DollarSign className="w-4 h-4 text-emerald-600" />
                                <span className="text-[11px] font-bold">Payroll & Slips</span>
                                <span className="text-[9px] text-slate-400">Disbursements</span>
                              </button>

                              <button
                                id="admin-dashboard-reports-btn"
                                onClick={() => navigateToScreen('admin_reports')}
                                className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center font-bold text-slate-800 shadow-2xs flex flex-col items-center gap-1 transition-all active:scale-95"
                              >
                                <BarChart3 className="w-4 h-4 text-amber-600" />
                                <span className="text-[11px] font-bold">Executive Reports</span>
                                <span className="text-[9px] text-slate-400">Audit Logs</span>
                              </button>

                              <button
                                id="admin-dashboard-security-btn"
                                onClick={() => navigateToScreen('admin_security')}
                                className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center font-bold text-slate-800 shadow-2xs flex flex-col items-center gap-1 transition-all active:scale-95"
                              >
                                <ShieldAlert className="w-4 h-4 text-rose-600" />
                                <span className="text-[11px] font-bold">Security & SIEM</span>
                                <span className="text-[9px] text-slate-400">AI Threat Monitor</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Section 4: Admin AI Operations Assistant (Strictly ADMIN only) */}
                        {currentAdmin?.role === 'ADMIN' && (
                          <AdminAiOperationsAssistant
                            workers={workers}
                            sites={sites}
                            batches={batches}
                            registrations={registrations}
                            onNavigate={(screen) => navigateToScreen(screen as ScreenName)}
                          />
                        )}

                        {/* Section 5: Workforce Distribution & Deployment Module */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-3.5 sm:p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <BarChart3 className="w-4 h-4 text-indigo-600" />
                              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                Workforce Distribution
                              </h4>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {workers.length} Total Workers
                            </span>
                          </div>

                          {/* Distribution Tabs: Sites | Batches | Roles | Status */}
                          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg text-[11px] font-semibold">
                            <button
                              id="dist-tab-sites"
                              onClick={() => setDistributionTab('sites')}
                              className={`flex-1 py-1 rounded-md text-center transition-colors ${
                                distributionTab === 'sites' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Sites
                            </button>
                            <button
                              id="dist-tab-batches"
                              onClick={() => setDistributionTab('batches')}
                              className={`flex-1 py-1 rounded-md text-center transition-colors ${
                                distributionTab === 'batches' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Batches
                            </button>
                            <button
                              id="dist-tab-roles"
                              onClick={() => setDistributionTab('roles')}
                              className={`flex-1 py-1 rounded-md text-center transition-colors ${
                                distributionTab === 'roles' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Trades
                            </button>
                            <button
                              id="dist-tab-status"
                              onClick={() => setDistributionTab('status')}
                              className={`flex-1 py-1 rounded-md text-center transition-colors ${
                                distributionTab === 'status' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Status
                            </button>
                          </div>

                          {/* Tab Content */}
                          {distributionTab === 'sites' && (
                            <div className="space-y-2 pt-1">
                              {sites.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No sites defined.</p>
                              ) : (
                                sites.map((s) => {
                                  const assigned = workers.filter((w) => (w.siteId || (w as any).assignedSiteId) === s.siteId);
                                  const activeCount = assigned.filter((w) => w.status === 'ACTIVE').length;
                                  const pct = workers.length > 0 ? Math.round((assigned.length / workers.length) * 100) : 0;
                                  return (
                                    <div
                                      key={s.siteId}
                                      onClick={() => {
                                        setWorkerSiteFilter(s.siteId);
                                        navigateToScreen('admin_workers');
                                      }}
                                      className="p-2.5 bg-slate-50 hover:bg-indigo-50/50 rounded-lg border border-slate-100 cursor-pointer transition-colors space-y-1.5"
                                    >
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                          <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                                          {s.siteName}
                                          <span className="text-[10px] font-mono text-slate-400">({s.siteId})</span>
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-bold text-emerald-600">{activeCount} active</span>
                                          <span className="font-bold text-slate-900">{assigned.length}</span>
                                        </div>
                                      </div>
                                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-indigo-600 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}

                          {distributionTab === 'batches' && (
                            <div className="space-y-2 pt-1">
                              {batches.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No batches created.</p>
                              ) : (
                                batches.map((b) => {
                                  const enrolled = workers.filter((w) => w.batchNumber === b.batchId);
                                  const activeCount = enrolled.filter((w) => w.status === 'ACTIVE').length;
                                  const pct = workers.length > 0 ? Math.round((enrolled.length / workers.length) * 100) : 0;
                                  return (
                                    <div
                                      key={b.batchId}
                                      onClick={() => {
                                        setWorkerBatchFilter(b.batchId);
                                        navigateToScreen('admin_workers');
                                      }}
                                      className="p-2.5 bg-slate-50 hover:bg-indigo-50/50 rounded-lg border border-slate-100 cursor-pointer transition-colors space-y-1.5"
                                    >
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                          <Layers className="w-3.5 h-3.5 text-indigo-500" />
                                          <span className="font-mono text-indigo-600 font-bold">{b.batchId}</span> - {b.name}
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-bold text-emerald-600">{activeCount} active</span>
                                          <span className="font-bold text-slate-900">{enrolled.length}</span>
                                        </div>
                                      </div>
                                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}

                          {distributionTab === 'roles' && (
                            <div className="space-y-2 pt-1">
                              {Object.entries(
                                workers.reduce<Record<string, number>>((acc, w) => {
                                  const role = w.jobRole || 'General Labor';
                                  acc[role] = (acc[role] || 0) + 1;
                                  return acc;
                                }, {})
                              ).map(([role, count]) => {
                                const pct = workers.length > 0 ? Math.round((Number(count) / workers.length) * 100) : 0;
                                return (
                                  <div
                                    key={role}
                                    onClick={() => {
                                      setWorkerRoleFilter(role);
                                      navigateToScreen('admin_workers');
                                    }}
                                    className="p-2 bg-slate-50 hover:bg-indigo-50/50 rounded-lg border border-slate-100 cursor-pointer transition-colors space-y-1"
                                  >
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="font-medium text-slate-700">{role}</span>
                                      <span className="font-bold text-slate-900">{count} ({pct}%)</span>
                                    </div>
                                    <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                                      <div className="bg-indigo-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {distributionTab === 'status' && (
                            <div className="grid grid-cols-3 gap-2 pt-1">
                              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-center">
                                <span className="text-[10px] font-bold text-emerald-700 uppercase">Active</span>
                                <p className="text-xl font-black text-emerald-900 mt-0.5">
                                  {workers.filter((w) => w.status === 'ACTIVE').length}
                                </p>
                              </div>
                              <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-center">
                                <span className="text-[10px] font-bold text-red-700 uppercase">Suspended</span>
                                <p className="text-xl font-black text-red-900 mt-0.5">
                                  {workers.filter((w) => w.status === 'SUSPENDED').length}
                                </p>
                              </div>
                              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-center">
                                <span className="text-[10px] font-bold text-amber-700 uppercase">Pending Reg.</span>
                                <p className="text-xl font-black text-amber-900 mt-0.5">
                                  {registrations.length}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Section 6: Live Operations & Activity Audit Log */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                              Operations Activity Audit Feed
                            </h4>
                            <span className="text-[10px] font-mono text-slate-400">Live Timestamped</span>
                          </div>
                          <div className="space-y-2">
                            {registrations.length === 0 ? (
                              <div className="p-4 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-400">
                                No recent activity logged yet
                              </div>
                            ) : (
                              registrations.slice(0, 3).map((reg) => (
                                <div key={reg.registrationId} className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 text-indigo-600">
                                    <Users className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-900 truncate">
                                      {reg.submittedData.fullName} Submitted Onboarding
                                    </p>
                                    <p className="text-[10px] text-slate-500 font-mono">
                                      Worker ID: {reg.workerId} • Role: {reg.submittedData.jobRole || 'General'}
                                    </p>
                                  </div>
                                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                    reg.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {reg.status}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* --- 8. ADMIN WORKER MANAGEMENT --- */}
                  {isAdminAuthenticated && currentScreen === 'admin_workers' && (
                    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
                      <div className="bg-[#0E1118] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-[#1E232E] shadow-sm backdrop-blur-md">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => navigateToScreen('admin_dashboard')}
                            className="p-1.5 hover:bg-[#161B26] rounded-lg text-slate-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center border border-transparent hover:border-[#2A3447]"
                            aria-label="Back to Dashboard"
                          >
                            <ArrowLeft className="w-5 h-5" />
                          </button>
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              OPERATIONAL DIRECTORY
                            </span>
                            <h3 className="font-bold text-sm sm:text-base text-white mt-0.5 flex items-center gap-2">
                              <span>Civil Workforce Directory</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            </h3>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-400 bg-[#121622] border border-[#222A3A] px-2.5 py-1 rounded-lg">
                            ACTIVE ENROLLED: <strong className="text-amber-400 font-bold">{workers.length}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="p-4 sm:p-5 max-w-5xl mx-auto w-full space-y-4">
                        {/* Search & Filter Bar */}
                        <div className="bg-[#0E121B] border border-[#1F2633] rounded-xl p-3.5 sm:p-4 shadow-sm space-y-3">
                          <div className="relative">
                            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                            <input
                              id="worker-search-input"
                              type="text"
                              value={workerSearch}
                              onChange={(e) => setWorkerSearch(e.target.value)}
                              placeholder="Search civil worker name, Worker ID (e.g. W-1001), trade, site, or phone..."
                              className="w-full pl-10 pr-3.5 py-2.5 bg-[#080A0F] border border-[#242D3D] rounded-lg text-xs focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/20 text-white font-medium placeholder:text-slate-500 transition-colors"
                            />
                          </div>

                          {/* Segmented Status Operational Filters */}
                          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 text-xs">
                            <div className="flex gap-1.5 shrink-0">
                              {['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED'].map((st) => {
                                const isActive = workerStatusFilter === st;
                                return (
                                  <button
                                    key={st}
                                    id={`worker-filter-status-${st.toLowerCase()}`}
                                    onClick={() => setWorkerStatusFilter(st)}
                                    className={`px-3 py-1.5 rounded-lg font-mono font-bold text-[11px] uppercase tracking-wider transition-colors min-h-[36px] flex items-center justify-center cursor-pointer ${
                                      isActive
                                        ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                                        : 'bg-[#141924] hover:bg-[#1A2130] text-slate-300 border border-[#252E3E]'
                                    }`}
                                  >
                                    {st}
                                  </button>
                                );
                              })}
                            </div>
                            {(workerSiteFilter !== 'ALL' || workerBatchFilter !== 'ALL' || workerRoleFilter !== 'ALL' || workerStatusFilter !== 'ALL' || workerSearch) && (
                              <button
                                id="worker-reset-filters-btn"
                                onClick={() => {
                                  setWorkerSearch('');
                                  setWorkerStatusFilter('ALL');
                                  setWorkerSiteFilter('ALL');
                                  setWorkerBatchFilter('ALL');
                                  setWorkerRoleFilter('ALL');
                                }}
                                className="text-[11px] font-mono font-bold text-rose-400 hover:text-rose-300 uppercase tracking-wider whitespace-nowrap px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors cursor-pointer"
                              >
                                Reset Filters
                              </button>
                            )}
                          </div>

                          {/* Dropdown Filters: Site, Batch, Trade */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs pt-2 border-t border-[#1C2331]">
                            <div>
                              <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">Assigned Site</label>
                              <select
                                id="worker-filter-site-select"
                                value={workerSiteFilter}
                                onChange={(e) => setWorkerSiteFilter(e.target.value)}
                                className="w-full px-2.5 py-2 bg-[#080A0F] border border-[#242D3D] rounded-lg text-xs focus:outline-none focus:border-amber-500 text-slate-200 font-medium"
                              >
                                <option value="ALL">All Sites ({sites.length})</option>
                                {sites.map((s) => (
                                  <option key={s.siteId} value={s.siteId}>
                                    {s.siteId} — {s.siteName}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">Workforce Batch</label>
                              <select
                                id="worker-filter-batch-select"
                                value={workerBatchFilter}
                                onChange={(e) => setWorkerBatchFilter(e.target.value)}
                                className="w-full px-2.5 py-2 bg-[#080A0F] border border-[#242D3D] rounded-lg text-xs focus:outline-none focus:border-amber-500 text-slate-200 font-medium"
                              >
                                <option value="ALL">All Batches ({batches.length})</option>
                                {batches.map((b) => (
                                  <option key={b.batchId} value={b.batchId}>
                                    {b.batchId} — {b.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">Trade Specialization</label>
                              <select
                                id="worker-filter-role-select"
                                value={workerRoleFilter}
                                onChange={(e) => setWorkerRoleFilter(e.target.value)}
                                className="w-full px-2.5 py-2 bg-[#080A0F] border border-[#242D3D] rounded-lg text-xs focus:outline-none focus:border-amber-500 text-slate-200 font-medium"
                              >
                                <option value="ALL">All Trades</option>
                                {Array.from(new Set(workers.map((w) => w.jobRole).filter(Boolean))).map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Worker List Cards */}
                        <div className="space-y-2.5">
                          {workers.filter((w) => {
                            const q = workerSearch.toLowerCase();
                            const matchSearch =
                              !q ||
                              w.fullName.toLowerCase().includes(q) ||
                              w.workerId.toLowerCase().includes(q) ||
                              (w.jobRole && w.jobRole.toLowerCase().includes(q)) ||
                              (w.phone && w.phone.toLowerCase().includes(q)) ||
                              (w.email && w.email.toLowerCase().includes(q)) ||
                              (w.siteId && w.siteId.toLowerCase().includes(q)) ||
                              (w.batchNumber && w.batchNumber.toLowerCase().includes(q));
                            const matchStatus = workerStatusFilter === 'ALL' || w.status === workerStatusFilter;
                            const matchSite = workerSiteFilter === 'ALL' || (w.siteId || (w as any).assignedSiteId) === workerSiteFilter;
                            const matchBatch = workerBatchFilter === 'ALL' || w.batchNumber === workerBatchFilter;
                            const matchRole = workerRoleFilter === 'ALL' || w.jobRole === workerRoleFilter;
                            return matchSearch && matchStatus && matchSite && matchBatch && matchRole;
                          }).length === 0 ? (
                            <div className="p-8 text-center bg-[#0E121B] rounded-xl border border-[#1F2633] text-slate-400">
                              <Users className="w-10 h-10 mx-auto mb-2 text-slate-500 opacity-60" />
                              <p className="text-xs font-semibold text-slate-200">No personnel records found</p>
                              <p className="text-[11px] text-slate-400 mt-1">No civil workers matching the active filters.</p>
                            </div>
                          ) : (
                            workers
                              .filter((w) => {
                                const q = workerSearch.toLowerCase();
                                const matchSearch =
                                  !q ||
                                  w.fullName.toLowerCase().includes(q) ||
                                  w.workerId.toLowerCase().includes(q) ||
                                  (w.jobRole && w.jobRole.toLowerCase().includes(q)) ||
                                  (w.phone && w.phone.toLowerCase().includes(q)) ||
                                  (w.email && w.email.toLowerCase().includes(q)) ||
                                  (w.siteId && w.siteId.toLowerCase().includes(q)) ||
                                  (w.batchNumber && w.batchNumber.toLowerCase().includes(q));
                                const matchStatus = workerStatusFilter === 'ALL' || w.status === workerStatusFilter;
                                const matchSite = workerSiteFilter === 'ALL' || (w.siteId || (w as any).assignedSiteId) === workerSiteFilter;
                                const matchBatch = workerBatchFilter === 'ALL' || w.batchNumber === workerBatchFilter;
                                const matchRole = workerRoleFilter === 'ALL' || w.jobRole === workerRoleFilter;
                                return matchSearch && matchStatus && matchSite && matchBatch && matchRole;
                              })
                              .map((worker) => (
                                <div
                                  key={worker.workerId}
                                  id={`worker-row-${worker.workerId}`}
                                  onClick={() => {
                                    setActiveWorkerModal(worker);
                                    setIsEditingWorker(false);
                                  }}
                                  className="p-3.5 sm:p-4 bg-[#0E121B] hover:bg-[#131824] border border-[#1F2633] hover:border-amber-500/50 rounded-xl shadow-xs cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                                >
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-lg bg-[#141924] text-amber-400 border border-[#252E3E] flex items-center justify-center shrink-0 font-mono font-bold text-xs">
                                      {worker.workerId.replace('W-', '')}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h5 className="font-bold text-sm text-white truncate">
                                          {worker.fullName}
                                        </h5>
                                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded">
                                          {worker.workerId}
                                        </span>
                                        <span className="text-[11px] font-semibold text-slate-300 bg-[#161B26] px-2 py-0.5 rounded border border-[#263042]">
                                          {worker.jobRole}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-slate-400 font-mono mt-1">
                                        Batch: <span className="font-bold text-slate-200">{worker.batchNumber}</span> • Site: <span className="font-bold text-slate-200">{worker.siteId || (worker as any).assignedSiteId}</span>
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1B2230]">
                                    <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                                      {worker.phone}
                                    </span>
                                    {renderStatusBadge(worker.status)}
                                    <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90 hidden sm:block" />
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>

                      {/* Modal Worker Detail & Edit */}
                      {activeWorkerModal && (
                        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                          <div className="bg-[#0E121B] rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 border border-[#222A3A] my-auto">
                            <div className="flex items-start justify-between gap-3 border-b border-[#1E2636] pb-3">
                              <div>
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 block">
                                  FIELD WORKER DOSSIER
                                </span>
                                <h4 className="font-bold text-base text-white mt-0.5">
                                  {isEditingWorker ? 'Edit & Reassign Worker' : activeWorkerModal.fullName}
                                </h4>
                                <span className="font-mono text-xs text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 inline-block mt-1">
                                  ID: {activeWorkerModal.workerId} (Permanent)
                                </span>
                              </div>
                              {renderStatusBadge(activeWorkerModal.status)}
                            </div>

                            {!isEditingWorker ? (
                              /* View Mode */
                              <>
                                <div className="text-xs space-y-2 py-1">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="p-2.5 bg-[#080A0F] rounded-lg border border-[#1E2535]">
                                      <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">Trade Role</span>
                                      <span className="font-bold text-slate-100">{activeWorkerModal.jobRole}</span>
                                    </div>
                                    <div className="p-2.5 bg-[#080A0F] rounded-lg border border-[#1E2535]">
                                      <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">Batch Cohort</span>
                                      <span className="font-mono font-bold text-slate-100">{activeWorkerModal.batchNumber}</span>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="p-2.5 bg-[#080A0F] rounded-lg border border-[#1E2535]">
                                      <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">Assigned Site</span>
                                      <span className="font-bold text-slate-100">{activeWorkerModal.siteId || (activeWorkerModal as any).assignedSiteId}</span>
                                    </div>
                                    <div className="p-2.5 bg-[#080A0F] rounded-lg border border-[#1E2535]">
                                      <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">Joining Date</span>
                                      <span className="font-semibold text-slate-200">{activeWorkerModal.joiningDate || '—'}</span>
                                    </div>
                                  </div>
                                  <div className="p-2.5 bg-[#080A0F] rounded-lg border border-[#1E2535] space-y-1">
                                    <p><strong className="text-slate-400">Contact Phone:</strong> <span className="font-mono text-slate-100 font-semibold">{activeWorkerModal.phone}</span></p>
                                    <p><strong className="text-slate-400">Email Address:</strong> <span className="text-slate-200">{activeWorkerModal.email}</span></p>
                                    <p><strong className="text-slate-400">Emergency:</strong> <span className="text-slate-200">{activeWorkerModal.emergencyContactName || 'N/A'} ({activeWorkerModal.emergencyContactPhone || 'N/A'})</span></p>
                                  </div>
                                </div>

                                {/* Worker Profile Photo Section */}
                                <div className="pt-2 border-t border-[#1E2636]">
                                  <WorkerPhotoManager
                                    worker={activeWorkerModal}
                                    currentProfilePhoto={activeWorkerModal.profilePhoto}
                                    onPhotoUpdated={(photo) => {
                                      setActiveWorkerModal((prev) => (prev ? { ...prev, profilePhoto: photo || undefined } : null));
                                      setWorkers((prev) =>
                                        prev.map((w) => (w.workerId === activeWorkerModal.workerId ? { ...w, profilePhoto: photo || undefined } : w))
                                      );
                                    }}
                                    canEdit={true}
                                    simTheme="dark"
                                  />
                                </div>

                                <div className="pt-2 flex flex-col gap-2">
                                  <div className="flex gap-2">
                                    <button
                                      id="worker-edit-reassign-btn"
                                      onClick={() => {
                                        setWorkerEditForm({
                                          siteId: activeWorkerModal.siteId || (activeWorkerModal as any).assignedSiteId || (sites[0]?.siteId || 'SITE-101'),
                                          batchNumber: activeWorkerModal.batchNumber || (batches[0]?.batchId || 'B-01'),
                                          jobRole: activeWorkerModal.jobRole || 'Mason',
                                          phone: activeWorkerModal.phone || '',
                                          email: activeWorkerModal.email || '',
                                          emergencyContactName: activeWorkerModal.emergencyContactName || '',
                                          emergencyContactPhone: activeWorkerModal.emergencyContactPhone || ''
                                        });
                                        setIsEditingWorker(true);
                                      }}
                                      className="flex-1 min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      <span>Edit / Reassign</span>
                                    </button>

                                    <button
                                      disabled={isActionLoading}
                                      onClick={() => {
                                        const isSuspending = activeWorkerModal.status === 'ACTIVE';
                                        setConfirmDialog({
                                          isOpen: true,
                                          title: isSuspending ? 'Suspend Worker Account?' : 'Activate Worker Account?',
                                          message: isSuspending
                                            ? `Are you sure you want to suspend ${activeWorkerModal.fullName} (${activeWorkerModal.workerId})? They will be blocked from site operations and workforce login.`
                                            : `Restore active site privileges for ${activeWorkerModal.fullName} (${activeWorkerModal.workerId})?`,
                                          confirmLabel: isSuspending ? 'Suspend Worker' : 'Activate Worker',
                                          isDestructive: isSuspending,
                                          onConfirm: async () => {
                                            try {
                                              setIsActionLoading(true);
                                              const newStatus = isSuspending ? 'SUSPENDED' : 'ACTIVE';
                                              await FirebaseService.updateWorkerStatus(activeWorkerModal.workerId, newStatus);
                                              await refreshAllData();
                                              setActiveWorkerModal((prev) => prev ? { ...prev, status: newStatus } : null);
                                              setSimNotice(
                                                isSuspending
                                                  ? `Worker ${activeWorkerModal.fullName} (${activeWorkerModal.workerId}) suspended.`
                                                  : `Worker ${activeWorkerModal.fullName} (${activeWorkerModal.workerId}) activated.`
                                              );
                                            } catch (err: any) {
                                              setSimError(FirebaseService.parseError(err));
                                            } finally {
                                              setIsActionLoading(false);
                                            }
                                          }
                                        });
                                      }}
                                      className={`px-4 min-h-[44px] text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                                        activeWorkerModal.status === 'ACTIVE' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                                      }`}
                                    >
                                      {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                      <span>{activeWorkerModal.status === 'ACTIVE' ? 'Suspend' : 'Activate'}</span>
                                    </button>
                                  </div>

                                  <button
                                    onClick={() => {
                                      setActiveWorkerModal(null);
                                      setIsEditingWorker(false);
                                    }}
                                    className="w-full min-h-[40px] py-2 border border-[#222A3A] bg-[#141924] hover:bg-[#1A2130] text-slate-300 font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                                  >
                                    Close Dossier
                                  </button>
                                </div>
                              </>
                            ) : (
                              /* Edit / Reassign Mode */
                              <div className="space-y-3 pt-1 text-xs">
                                <div>
                                  <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Assigned Construction Site
                                  </label>
                                  <select
                                    id="worker-edit-site-select"
                                    value={workerEditForm.siteId}
                                    onChange={(e) => setWorkerEditForm({ ...workerEditForm, siteId: e.target.value })}
                                    className="w-full px-3 py-2 bg-[#080A0F] border border-[#222A3A] rounded-lg text-slate-100 font-medium"
                                  >
                                    {sites.map((s) => (
                                      <option key={s.siteId} value={s.siteId}>
                                        {s.siteId} — {s.siteName} {s.status === 'INACTIVE' ? '(INACTIVE)' : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Workforce Batch Cohort
                                  </label>
                                  <select
                                    id="worker-edit-batch-select"
                                    value={workerEditForm.batchNumber}
                                    onChange={(e) => setWorkerEditForm({ ...workerEditForm, batchNumber: e.target.value })}
                                    className="w-full px-3 py-2 bg-[#080A0F] border border-[#222A3A] rounded-lg text-slate-100 font-medium"
                                  >
                                    {batches.map((b) => (
                                      <option key={b.batchId} value={b.batchId}>
                                        {b.batchId} — {b.name} {b.status === 'INACTIVE' ? '(INACTIVE)' : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Trade / Job Role
                                  </label>
                                  <input
                                    id="worker-edit-role-input"
                                    type="text"
                                    value={workerEditForm.jobRole}
                                    onChange={(e) => setWorkerEditForm({ ...workerEditForm, jobRole: e.target.value })}
                                    placeholder="e.g. Mason, Helper, Supervisor..."
                                    className="w-full px-3 py-2 bg-[#080A0F] border border-[#222A3A] rounded-lg text-slate-100 font-medium"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                                      Phone Number
                                    </label>
                                    <input
                                      id="worker-edit-phone-input"
                                      type="tel"
                                      value={workerEditForm.phone}
                                      onChange={(e) => setWorkerEditForm({ ...workerEditForm, phone: sanitizePhoneInput(e.target.value) })}
                                      className="w-full px-3 py-2 bg-[#080A0F] border border-[#222A3A] rounded-lg text-slate-100 font-mono font-medium"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                                      Email Address
                                    </label>
                                    <input
                                      id="worker-edit-email-input"
                                      type="email"
                                      value={workerEditForm.email}
                                      onChange={(e) => setWorkerEditForm({ ...workerEditForm, email: sanitizeEmailInput(e.target.value) })}
                                      className="w-full px-3 py-2 bg-[#080A0F] border border-[#222A3A] rounded-lg text-slate-100 font-medium"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                                      Emergency Contact
                                    </label>
                                    <input
                                      type="text"
                                      value={workerEditForm.emergencyContactName}
                                      onChange={(e) => setWorkerEditForm({ ...workerEditForm, emergencyContactName: e.target.value })}
                                      placeholder="Contact Name"
                                      className="w-full px-3 py-2 bg-[#080A0F] border border-[#222A3A] rounded-lg text-slate-100 font-medium"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                                      Emergency Phone
                                    </label>
                                    <input
                                      type="tel"
                                      value={workerEditForm.emergencyContactPhone}
                                      onChange={(e) => setWorkerEditForm({ ...workerEditForm, emergencyContactPhone: sanitizePhoneInput(e.target.value) })}
                                      placeholder="10-digit phone"
                                      className="w-full px-3 py-2 bg-[#080A0F] border border-[#222A3A] rounded-lg text-slate-100 font-mono font-medium"
                                    />
                                  </div>
                                </div>

                                <div className="pt-2 flex gap-2">
                                  <button
                                    id="worker-edit-save-btn"
                                    disabled={isActionLoading}
                                    onClick={async () => {
                                      if (workerEditForm.phone && !isValidPhone(workerEditForm.phone)) {
                                        setSimError('Valid 10-digit Indian phone number is required (6-9 followed by 9 digits).');
                                        return;
                                      }
                                      if (workerEditForm.email && !isValidEmail(workerEditForm.email)) {
                                        setSimError('Valid email format is required.');
                                        return;
                                      }
                                      try {
                                        setIsActionLoading(true);
                                        await FirebaseService.updateWorkerDetails(activeWorkerModal.workerId, workerEditForm);
                                        await refreshAllData();
                                        setActiveWorkerModal((prev) => prev ? {
                                          ...prev,
                                          siteId: workerEditForm.siteId,
                                          assignedSiteId: workerEditForm.siteId,
                                          batchNumber: workerEditForm.batchNumber,
                                          jobRole: workerEditForm.jobRole,
                                          phone: workerEditForm.phone,
                                          email: workerEditForm.email,
                                          emergencyContactName: workerEditForm.emergencyContactName,
                                          emergencyContactPhone: workerEditForm.emergencyContactPhone
                                        } : null);
                                        setIsEditingWorker(false);
                                        setSimNotice(`Worker ${activeWorkerModal.fullName} (${activeWorkerModal.workerId}) updated.`);
                                      } catch (err: any) {
                                        setSimError(FirebaseService.parseError(err));
                                      } finally {
                                        setIsActionLoading(false);
                                      }
                                    }}
                                    className="flex-1 min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                  >
                                    {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    <span>Save Reassignment</span>
                                  </button>
                                  <button
                                    id="worker-edit-cancel-btn"
                                    onClick={() => setIsEditingWorker(false)}
                                    className="min-h-[44px] px-4 py-2 border border-[#222A3A] bg-[#141924] hover:bg-[#1A2130] text-slate-300 font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* --- 9. ADMIN SITE MANAGEMENT --- */}
                  {isAdminAuthenticated && currentScreen === 'admin_sites' && (
                    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
                      <div className="bg-[#0E1118] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-[#1E232E] shadow-xs">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => navigateToScreen('admin_dashboard')}
                            className="p-1.5 hover:bg-[#161B26] text-zinc-300 hover:text-white rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center border border-[#262D3D]"
                            aria-label="Back to Dashboard"
                          >
                            <ArrowLeft className="w-5 h-5" />
                          </button>
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              DEPLOYMENT SITES
                            </span>
                            <h3 className="font-bold text-sm sm:text-base text-white mt-0.5">Construction Sites & Projects</h3>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSiteForm({
                              siteId: `SITE-${100 + sites.length + 1}`,
                              siteName: '',
                              projectName: '',
                              address: '',
                              description: ''
                            });
                            setShowSiteModal(true);
                          }}
                          className="min-h-[40px] px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Site</span>
                        </button>
                      </div>

                      <div className="p-4 sm:p-5 max-w-5xl mx-auto w-full space-y-4">
                        {sites.length === 0 ? (
                          <div className="p-8 text-center bg-[#11141C] rounded-xl border border-[#202534] text-zinc-400">
                            <Building2 className="w-10 h-10 mx-auto mb-2 text-zinc-600" />
                            <p className="text-xs font-semibold text-zinc-200">No project sites configured</p>
                            <p className="text-[11px] text-zinc-400 mt-1">Click &quot;Add Site&quot; to provision a new construction location.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {sites.map((site) => (
                              <div
                                key={site.siteId}
                                className="p-4 bg-[#11141C] border border-[#202534] rounded-xl shadow-xs space-y-3 flex flex-col justify-between"
                              >
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                          {site.siteId}
                                        </span>
                                        <h5 className="font-black text-sm text-white">{site.siteName}</h5>
                                      </div>
                                      <p className="text-xs text-zinc-300 font-medium mt-1">
                                        Project: <strong className="text-amber-400">{site.projectName}</strong>
                                      </p>
                                    </div>
                                    {renderStatusBadge(site.status)}
                                  </div>

                                  <p className="text-xs text-zinc-400 flex items-start gap-1.5">
                                    <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <span>{site.address}</span>
                                  </p>
                                  {site.description && (
                                    <p className="text-[11px] text-zinc-300 italic bg-[#0E1118] p-2 rounded-lg border border-[#1E232E]">
                                      {site.description}
                                    </p>
                                  )}
                                </div>

                                <div className="pt-3 border-t border-[#1E232E] flex items-center justify-between gap-2 flex-wrap">
                                  <button
                                    id={`site-launch-kiosk-${site.siteId}`}
                                    onClick={() => {
                                      setSelectedKioskSiteId(site.siteId);
                                      navigateToScreen('admin_qr_kiosk');
                                    }}
                                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-xs uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                                  >
                                    <QrCode className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Launch Kiosk</span>
                                  </button>

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      id={`site-photos-btn-${site.siteId}`}
                                      onClick={() => setSelectedPhotoSite(site)}
                                      className="px-2.5 py-1.5 text-xs font-bold text-zinc-200 hover:text-white bg-[#161B26] hover:bg-[#1E2535] border border-[#262D3D] rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                                    >
                                      <Camera className="w-3.5 h-3.5 text-zinc-400" />
                                      <span>Photos</span>
                                    </button>
                                    <button
                                      id={`site-edit-btn-${site.siteId}`}
                                      onClick={() => {
                                        setEditSiteForm({
                                          siteId: site.siteId,
                                          siteName: site.siteName,
                                          projectName: site.projectName,
                                          address: site.address,
                                          description: site.description || ''
                                        });
                                        setShowEditSiteModal(true);
                                      }}
                                      className="px-2.5 py-1.5 text-xs font-bold text-zinc-200 hover:text-white bg-[#161B26] hover:bg-[#1E2535] border border-[#262D3D] rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      id={`site-toggle-status-${site.siteId}`}
                                      disabled={isActionLoading || isFetchingDeactivationImpact}
                                      onClick={async () => {
                                        if (site.status === 'ACTIVE') {
                                          try {
                                            setIsFetchingDeactivationImpact(true);
                                            const impact = await FirebaseService.getSiteDeactivationImpact(site.siteId);
                                            setDeactivatingSiteImpact(impact);
                                          } catch (err: any) {
                                            console.warn('Fallback to standard confirmDialog:', err);
                                            setConfirmDialog({
                                              isOpen: true,
                                              title: 'Deactivate Construction Site?',
                                              message: `Deactivate ${site.siteName} (${site.siteId})? This will restrict workers from selecting this site and close operations.`,
                                              confirmLabel: 'Deactivate Site',
                                              isDestructive: true,
                                              onConfirm: async () => {
                                                try {
                                                  setIsActionLoading(true);
                                                  await FirebaseService.updateSiteStatus(site.siteId, 'INACTIVE');
                                                  await refreshAllData();
                                                  setSimNotice(`Site ${site.siteName} has been deactivated.`);
                                                } catch (e: any) {
                                                  setSimError(FirebaseService.parseError(e));
                                                } finally {
                                                  setIsActionLoading(false);
                                                }
                                              }
                                            });
                                          } finally {
                                            setIsFetchingDeactivationImpact(false);
                                          }
                                        } else {
                                          (async () => {
                                            try {
                                              setIsActionLoading(true);
                                              await FirebaseService.updateSiteStatus(site.siteId, 'ACTIVE');
                                              await refreshAllData();
                                              setSimNotice(`Site ${site.siteName} is now ACTIVE.`);
                                            } catch (err: any) {
                                              setSimError(FirebaseService.parseError(err));
                                            } finally {
                                              setIsActionLoading(false);
                                            }
                                          })();
                                        }
                                      }}
                                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                                        site.status === 'ACTIVE'
                                          ? 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30'
                                          : 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30'
                                      }`}
                                    >
                                      {site.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add Site Modal */}
                      {showSiteModal && (
                        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                          <div className="bg-[#11141C] text-zinc-100 rounded-2xl p-5 max-w-xs w-full shadow-2xl space-y-3 border border-[#202534]">
                            <h4 className="font-bold text-sm text-white">Add Construction Site</h4>
                            <div className="space-y-2 text-xs">
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-300 mb-0.5">Site ID</label>
                                <input
                                  type="text"
                                  value={siteForm.siteId}
                                  onChange={(e) => setSiteForm({ ...siteForm, siteId: e.target.value })}
                                  placeholder="Site ID"
                                  className="w-full px-3 py-1.5 border border-[#262D3D] rounded-lg bg-[#0E1118] text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-300 mb-0.5">Site Name *</label>
                                <input
                                  type="text"
                                  value={siteForm.siteName}
                                  onChange={(e) => setSiteForm({ ...siteForm, siteName: e.target.value })}
                                  placeholder="e.g. Metro Line 4 Station"
                                  className="w-full px-3 py-1.5 border border-[#262D3D] rounded-lg bg-[#0E1118] text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-300 mb-0.5">Project Name *</label>
                                <input
                                  type="text"
                                  value={siteForm.projectName}
                                  onChange={(e) => setSiteForm({ ...siteForm, projectName: e.target.value })}
                                  placeholder="e.g. Urban Transit Phase 2"
                                  className="w-full px-3 py-1.5 border border-[#262D3D] rounded-lg bg-[#0E1118] text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-300 mb-0.5">Site Address</label>
                                <input
                                  type="text"
                                  value={siteForm.address}
                                  onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })}
                                  placeholder="e.g. Sector 12, South Corridor"
                                  className="w-full px-3 py-1.5 border border-[#262D3D] rounded-lg bg-[#0E1118] text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-300 mb-0.5">Description</label>
                                <textarea
                                  value={siteForm.description}
                                  onChange={(e) => setSiteForm({ ...siteForm, description: e.target.value })}
                                  placeholder="Site scope or notes"
                                  rows={2}
                                  className="w-full px-3 py-1.5 border border-[#262D3D] rounded-lg bg-[#0E1118] text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                              </div>
                            </div>
                            <div className="pt-2 flex gap-2">
                              <button
                                disabled={isActionLoading}
                                onClick={async () => {
                                  if (!siteForm.siteName.trim() || !siteForm.projectName.trim()) {
                                    setSimError('Site Name and Project Name are required.');
                                    return;
                                  }
                                  try {
                                    setIsActionLoading(true);
                                    await FirebaseService.createSite({
                                      siteId: siteForm.siteId.trim() || `SITE-${Date.now()}`,
                                      siteName: siteForm.siteName.trim(),
                                      projectName: siteForm.projectName.trim(),
                                      address: siteForm.address.trim() || 'Civil sector zone',
                                      description: siteForm.description.trim() || '',
                                      status: 'ACTIVE'
                                    });
                                    await refreshAllData();
                                    setShowSiteModal(false);
                                    setSimNotice(`Construction site '${siteForm.siteName}' created in Firestore.`);
                                  } catch (err: any) {
                                    setSimError(FirebaseService.parseError(err));
                                  } finally {
                                    setIsActionLoading(false);
                                  }
                                }}
                                className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                <span>Save Site</span>
                              </button>
                              <button
                                onClick={() => setShowSiteModal(false)}
                                className="px-3 py-2 border border-[#262D3D] text-zinc-300 text-xs font-semibold rounded-lg hover:bg-[#161B26] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Edit Site Modal */}
                      {showEditSiteModal && (
                        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                          <div className="bg-[#11141C] text-zinc-100 rounded-2xl p-5 max-w-xs w-full shadow-2xl space-y-3 border border-[#202534]">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-sm text-white">Edit Construction Site</h4>
                              <span className="font-mono text-xs text-amber-400 font-bold">{editSiteForm.siteId}</span>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-300 mb-0.5">Site Name *</label>
                                <input
                                  type="text"
                                  value={editSiteForm.siteName}
                                  onChange={(e) => setEditSiteForm({ ...editSiteForm, siteName: e.target.value })}
                                  className="w-full px-3 py-1.5 border border-[#262D3D] rounded-lg bg-[#0E1118] text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-300 mb-0.5">Project Name *</label>
                                <input
                                  type="text"
                                  value={editSiteForm.projectName}
                                  onChange={(e) => setEditSiteForm({ ...editSiteForm, projectName: e.target.value })}
                                  className="w-full px-3 py-1.5 border border-[#262D3D] rounded-lg bg-[#0E1118] text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-300 mb-0.5">Site Address</label>
                                <input
                                  type="text"
                                  value={editSiteForm.address}
                                  onChange={(e) => setEditSiteForm({ ...editSiteForm, address: e.target.value })}
                                  className="w-full px-3 py-1.5 border border-[#262D3D] rounded-lg bg-[#0E1118] text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-300 mb-0.5">Description</label>
                                <textarea
                                  value={editSiteForm.description}
                                  onChange={(e) => setEditSiteForm({ ...editSiteForm, description: e.target.value })}
                                  rows={2}
                                  className="w-full px-3 py-1.5 border border-[#262D3D] rounded-lg bg-[#0E1118] text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                              </div>
                            </div>
                            <div className="pt-2 flex gap-2">
                              <button
                                disabled={isActionLoading}
                                onClick={async () => {
                                  if (!editSiteForm.siteName.trim() || !editSiteForm.projectName.trim()) {
                                    setSimError('Site Name and Project Name are required.');
                                    return;
                                  }
                                  try {
                                    setIsActionLoading(true);
                                    await FirebaseService.updateSiteDetails(editSiteForm.siteId, {
                                      siteName: editSiteForm.siteName.trim(),
                                      projectName: editSiteForm.projectName.trim(),
                                      address: editSiteForm.address.trim(),
                                      description: editSiteForm.description.trim()
                                    });
                                    await refreshAllData();
                                    setShowEditSiteModal(false);
                                    setSimNotice(`Construction site '${editSiteForm.siteName}' updated.`);
                                  } catch (err: any) {
                                    setSimError(FirebaseService.parseError(err));
                                  } finally {
                                    setIsActionLoading(false);
                                  }
                                }}
                                className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                <span>Save Changes</span>
                              </button>
                              <button
                                onClick={() => setShowEditSiteModal(false)}
                                className="px-3 py-2 border border-[#262D3D] text-zinc-300 text-xs font-semibold rounded-lg hover:bg-[#161B26] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Site Deactivation Impact Preview Modal */}
                      {deactivatingSiteImpact && (
                        <div id="modal-site-deactivation-preview" className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
                          <div className="bg-[#11141C] text-zinc-100 rounded-2xl p-5 max-w-lg w-full shadow-2xl space-y-4 border border-[#202534] my-8">
                            {/* Modal Header */}
                            <div className="flex items-center justify-between border-b border-[#1E232E] pb-3">
                              <div className="flex items-center gap-2 text-rose-400">
                                <AlertOctagon className="w-5 h-5 shrink-0" />
                                <h4 className="font-bold text-sm text-white">
                                  Deactivate Construction Site?
                                </h4>
                              </div>
                              <span className="font-mono text-xs font-bold bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30">
                                {deactivatingSiteImpact.siteId}
                              </span>
                            </div>

                            <div>
                              <h5 className="font-bold text-sm text-white">
                                {deactivatingSiteImpact.siteName}
                              </h5>
                              <p className="text-xs text-zinc-400 mt-0.5">
                                Review the operational impact before confirming site deactivation.
                              </p>
                            </div>

                            {/* 6 Key Deterministic Metrics */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                              <div className="bg-[#0E1118] p-2.5 rounded-lg border border-[#1E232E]">
                                <span className="text-[10px] font-semibold text-zinc-400 block">Assigned Workers</span>
                                <span className="text-base font-black text-white">{deactivatingSiteImpact.workersAssigned}</span>
                              </div>
                              <div className="bg-[#0E1118] p-2.5 rounded-lg border border-[#1E232E]">
                                <span className="text-[10px] font-semibold text-zinc-400 block">Active Today</span>
                                <span className="text-base font-black text-amber-400">{deactivatingSiteImpact.activeWorkersToday}</span>
                              </div>
                              <div className="bg-[#0E1118] p-2.5 rounded-lg border border-[#1E232E]">
                                <span className="text-[10px] font-semibold text-zinc-400 block">Today's Attendance</span>
                                <span className="text-base font-black text-white">{deactivatingSiteImpact.todayAttendanceRecords}</span>
                              </div>
                              <div className="bg-[#0E1118] p-2.5 rounded-lg border border-[#1E232E]">
                                <span className="text-[10px] font-semibold text-zinc-400 block">Pending Leave</span>
                                <span className="text-base font-black text-amber-400">{deactivatingSiteImpact.pendingLeaveRequests}</span>
                              </div>
                              <div className="bg-[#0E1118] p-2.5 rounded-lg border border-[#1E232E]">
                                <span className="text-[10px] font-semibold text-zinc-400 block">Pending Overtime</span>
                                <span className="text-base font-black text-amber-400">{deactivatingSiteImpact.pendingOvertimeClaims}</span>
                              </div>
                              <div className="bg-[#0E1118] p-2.5 rounded-lg border border-[#1E232E]">
                                <span className="text-[10px] font-semibold text-zinc-400 block">Needs Reassignment</span>
                                <span className="text-base font-black text-rose-400">{deactivatingSiteImpact.workersRequiringReassignment}</span>
                              </div>
                            </div>

                            {/* AI Neutral Observation */}
                            {deactivatingSiteImpact.aiObservation && (
                              <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs text-amber-200 leading-relaxed space-y-1">
                                <div className="flex items-center gap-1.5 font-bold text-amber-400 text-[11px] uppercase">
                                  <Sparkles className="w-3 h-3 text-amber-400" />
                                  <span>AI Operational Impact Analysis</span>
                                </div>
                                <p>{deactivatingSiteImpact.aiObservation}</p>
                              </div>
                            )}

                            {/* Operational Rules */}
                            <div className="space-y-1 text-xs">
                              <span className="font-bold text-zinc-300 text-[11px]">
                                Operational Policy Guarantees:
                              </span>
                              <div className="bg-[#0E1118] p-2.5 rounded-lg border border-[#1E232E] space-y-1 text-[11px] text-zinc-300">
                                {deactivatingSiteImpact.operationalImpact.map((item, idx) => (
                                  <div key={idx} className="flex items-start gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                    <span>{item}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Modal Actions */}
                            <div className="pt-2 flex gap-2">
                              <button
                                id="btn-confirm-site-deactivation"
                                disabled={isActionLoading}
                                onClick={async () => {
                                  try {
                                    setIsActionLoading(true);
                                    await FirebaseService.updateSiteStatus(deactivatingSiteImpact.siteId, 'INACTIVE');
                                    await refreshAllData();
                                    setSimNotice(`Site ${deactivatingSiteImpact.siteName} has been deactivated.`);
                                    setDeactivatingSiteImpact(null);
                                  } catch (err: any) {
                                    setSimError(FirebaseService.parseError(err));
                                  } finally {
                                    setIsActionLoading(false);
                                  }
                                }}
                                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                <span>Confirm Deactivate Site</span>
                              </button>
                              <button
                                id="btn-cancel-site-deactivation"
                                disabled={isActionLoading}
                                onClick={() => setDeactivatingSiteImpact(null)}
                                className="px-4 py-2 border border-[#262D3D] text-zinc-300 text-xs font-semibold rounded-lg hover:bg-[#161B26] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Construction Site Photo Manager Modal */}
                      {selectedPhotoSite && (
                        <SitePhotoManager
                          site={selectedPhotoSite}
                          isOpen={Boolean(selectedPhotoSite)}
                          onClose={() => setSelectedPhotoSite(null)}
                          simTheme={simTheme}
                        />
                      )}
                    </div>
                  )}

                  {/* --- 10. WORKFORCE BATCHES SCREEN --- */}
                  {isAdminAuthenticated && currentScreen === 'admin_batches' && (
                    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
                      <div className="bg-[#0E1118] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-[#1E232E] shadow-xs">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => navigateToScreen('admin_dashboard')}
                            className="p-1.5 hover:bg-[#161B26] text-zinc-300 hover:text-white rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center border border-[#262D3D]"
                            aria-label="Back to Dashboard"
                          >
                            <ArrowLeft className="w-5 h-5" />
                          </button>
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              DEPLOYMENT COHORTS
                            </span>
                            <h3 className="font-bold text-sm sm:text-base text-white mt-0.5">Workforce Batches & Crews</h3>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setBatchForm({ name: '', description: '' });
                            setShowBatchModal(true);
                          }}
                          className="min-h-[40px] px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Batch</span>
                        </button>
                      </div>

                      <div className="p-4 sm:p-5 max-w-5xl mx-auto w-full space-y-4">
                        <div className="p-3.5 bg-[#0E1118] border border-[#1E232E] rounded-xl text-xs text-white flex items-start gap-3">
                          <Layers className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-amber-400">Centralized Workforce Cohorts</p>
                            <p className="text-[11px] text-zinc-300 mt-0.5 leading-relaxed">
                              Batches group civil trade workers into structured operational cohorts (e.g. B-01, B-02). Workers choose from active cohorts during onboarding, ensuring standardized supervisor assignment and reporting.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {batches.length === 0 ? (
                            <div className="p-8 text-center bg-[#11141C] rounded-xl border border-[#202534] text-zinc-400">
                              <Layers className="w-10 h-10 mx-auto mb-2 text-zinc-600" />
                              <p className="text-xs font-semibold text-zinc-200">No batches created yet</p>
                              <p className="text-[11px] text-zinc-400 mt-1">Click &quot;Add Batch&quot; to provision your first operational workforce cohort.</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {batches.map((batch) => {
                                const enrolledWorkers = workers.filter((w) => w.batchNumber === batch.batchId).length;
                                const isUpdatingThisBatch = updatingBatchId === batch.batchId;
                                const isBatchActive = batch.status === 'ACTIVE';

                                return (
                                  <div
                                    key={batch.batchId}
                                    className="p-4 sm:p-5 bg-[#11141C] border border-[#202534] hover:border-[#2E364B] rounded-xl shadow-xs transition-colors space-y-3.5 flex flex-col justify-between"
                                  >
                                    <div className="space-y-2.5">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono font-bold text-xs rounded-md">
                                            {batch.batchId}
                                          </span>
                                          <h5 className="font-black text-sm text-white tracking-wide">
                                            {batch.name}
                                          </h5>
                                        </div>
                                        <span
                                          className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-md shrink-0 ${
                                            isBatchActive
                                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                              : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700'
                                          }`}
                                        >
                                          {batch.status}
                                        </span>
                                      </div>

                                      {batch.description ? (
                                        <p className="text-xs text-zinc-300 leading-relaxed bg-[#0E1118] p-3 rounded-lg border border-[#1E232E]">
                                          {batch.description}
                                        </p>
                                      ) : (
                                        <p className="text-xs italic text-zinc-500 bg-[#0E1118]/50 p-2.5 rounded-lg border border-[#1E232E]/60">
                                          No squad description specified.
                                        </p>
                                      )}
                                    </div>

                                    <div className="pt-3 border-t border-[#1E232E] flex flex-wrap items-center justify-between gap-2.5 text-xs text-zinc-400">
                                      <span className="flex items-center gap-1.5 font-medium">
                                        <Users className="w-4 h-4 text-amber-400 shrink-0" />
                                        <span><strong className="text-zinc-200">{enrolledWorkers}</strong> enrolled workers</span>
                                      </span>

                                      <div className="flex items-center gap-2">
                                        <button
                                          id={`batch-edit-btn-${batch.batchId}`}
                                          disabled={isUpdatingThisBatch || isActionLoading}
                                          onClick={() => {
                                            setEditBatchForm({
                                              batchId: batch.batchId,
                                              name: batch.name,
                                              description: batch.description || '',
                                              status: batch.status
                                            });
                                            setShowEditBatchModal(true);
                                          }}
                                          className="px-3 py-1.5 text-xs font-bold rounded-lg text-zinc-200 hover:text-white bg-[#161B26] hover:bg-[#1E2535] border border-[#262D3D] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
                                          <span>Edit</span>
                                        </button>
                                        <button
                                          id={`batch-toggle-status-${batch.batchId}`}
                                          disabled={isUpdatingThisBatch || isActionLoading}
                                          onClick={async () => {
                                            if (updatingBatchId || isActionLoading) return;
                                            const nextStatus = isBatchActive ? 'INACTIVE' : 'ACTIVE';
                                            try {
                                              setUpdatingBatchId(batch.batchId);
                                              setIsActionLoading(true);
                                              setSimError(null);
                                              await FirebaseService.updateBatchStatus(batch.batchId, nextStatus);
                                              await refreshAllData();
                                              setSimNotice(`Workforce batch ${batch.batchId} successfully updated to ${nextStatus}.`);
                                            } catch (err: any) {
                                              setSimError(FirebaseService.parseError(err));
                                            } finally {
                                              setUpdatingBatchId(null);
                                              setIsActionLoading(false);
                                            }
                                          }}
                                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                            isBatchActive
                                              ? 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30'
                                              : 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30'
                                          }`}
                                        >
                                          {isUpdatingThisBatch ? (
                                            <>
                                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                              <span>Updating...</span>
                                            </>
                                          ) : (
                                            <span>{isBatchActive ? 'Deactivate' : 'Activate'}</span>
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Modal for Creating New Batch */}
                      {showBatchModal && (
                        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                          <div className="bg-[#11141C] text-zinc-100 rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-4 border border-[#202534]">
                            <div className="flex items-center justify-between border-b border-[#1E232E] pb-3">
                              <div>
                                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">PROVISION COHORT</span>
                                <h4 className="font-black text-sm text-white mt-0.5">Add Workforce Batch</h4>
                              </div>
                              <button onClick={() => setShowBatchModal(false)} className="text-zinc-400 hover:text-white text-sm font-bold cursor-pointer">
                                ✕
                              </button>
                            </div>

                            <p className="text-[11px] text-zinc-400">
                              Batch IDs are sequentially allocated (e.g. <span className="font-mono font-bold text-amber-400">B-01, B-02</span>) in Firestore via atomic counters.
                            </p>

                            <div className="space-y-3 text-xs">
                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">Batch Name <span className="text-amber-400">*</span></label>
                                <input
                                  type="text"
                                  value={batchForm.name}
                                  onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
                                  placeholder="e.g. Structural Framing Shift A"
                                  className="w-full px-3 py-2 bg-[#0E1118] border border-[#262D3D] rounded-lg text-zinc-100 font-medium focus:outline-none focus:border-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">Description</label>
                                <textarea
                                  value={batchForm.description}
                                  onChange={(e) => setBatchForm({ ...batchForm, description: e.target.value })}
                                  placeholder="e.g. Core workforce crew for Phase 2 structural masonry"
                                  rows={2}
                                  className="w-full px-3 py-2 bg-[#0E1118] border border-[#262D3D] rounded-lg text-zinc-100 font-medium focus:outline-none focus:border-amber-500"
                                />
                              </div>
                            </div>

                            <div className="pt-2 flex gap-2">
                              <button
                                disabled={isActionLoading}
                                onClick={async () => {
                                  if (!batchForm.name.trim()) {
                                    setSimError('Batch Name is required.');
                                    return;
                                  }
                                  try {
                                    setIsActionLoading(true);
                                    const creator = currentAdmin?.fullName || 'Site Administrator';
                                    const newBatchId = await FirebaseService.createBatch(
                                      batchForm.name.trim(),
                                      batchForm.description.trim(),
                                      creator
                                    );
                                    await refreshAllData();
                                    setShowBatchModal(false);
                                    setSimNotice(`Workforce Batch ${newBatchId} ('${batchForm.name.trim()}') created successfully.`);
                                  } catch (err: any) {
                                    setSimError(FirebaseService.parseError(err));
                                  } finally {
                                    setIsActionLoading(false);
                                  }
                                }}
                                className="flex-1 min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                              >
                                {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                <span>Save Batch</span>
                              </button>
                              <button
                                onClick={() => setShowBatchModal(false)}
                                className="min-h-[44px] px-4 py-2 border border-[#262D3D] text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-[#161B26] transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Modal for Editing Batch */}
                      {showEditBatchModal && (
                        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                          <div className="bg-[#11141C] text-zinc-100 rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-4 border border-[#202534]">
                            <div className="flex items-center justify-between border-b border-[#1E232E] pb-3">
                              <div>
                                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">UPDATE COHORT</span>
                                <h4 className="font-black text-sm text-white mt-0.5">Edit Workforce Batch</h4>
                              </div>
                              <span className="font-mono text-xs text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">{editBatchForm.batchId}</span>
                            </div>

                            <div className="space-y-3 text-xs">
                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">Batch Name <span className="text-amber-400">*</span></label>
                                <input
                                  type="text"
                                  value={editBatchForm.name}
                                  onChange={(e) => setEditBatchForm({ ...editBatchForm, name: e.target.value })}
                                  className="w-full px-3 py-2 bg-[#0E1118] border border-[#262D3D] rounded-lg text-zinc-100 font-medium focus:outline-none focus:border-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider mb-1">Description</label>
                                <textarea
                                  value={editBatchForm.description}
                                  onChange={(e) => setEditBatchForm({ ...editBatchForm, description: e.target.value })}
                                  rows={2}
                                  className="w-full px-3 py-2 bg-[#0E1118] border border-[#262D3D] rounded-lg text-zinc-100 font-medium focus:outline-none focus:border-amber-500"
                                />
                              </div>
                            </div>

                            <div className="pt-2 flex gap-2">
                              <button
                                disabled={isActionLoading}
                                onClick={async () => {
                                  if (!editBatchForm.name.trim()) {
                                    setSimError('Batch Name is required.');
                                    return;
                                  }
                                  try {
                                    setIsActionLoading(true);
                                    await FirebaseService.updateBatchDetails(editBatchForm.batchId, {
                                      name: editBatchForm.name.trim(),
                                      description: editBatchForm.description.trim()
                                    });
                                    await refreshAllData();
                                    setShowEditBatchModal(false);
                                    setSimNotice(`Batch ${editBatchForm.batchId} ('${editBatchForm.name.trim()}') updated successfully.`);
                                  } catch (err: any) {
                                    setSimError(FirebaseService.parseError(err));
                                  } finally {
                                    setIsActionLoading(false);
                                  }
                                }}
                                className="flex-1 min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                              >
                                {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                <span>Save Changes</span>
                              </button>
                              <button
                                onClick={() => setShowEditBatchModal(false)}
                                className="min-h-[44px] px-4 py-2 border border-[#262D3D] text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-[#161B26] transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* --- 11. PENDING REGISTRATIONS SCREEN --- */}
                  {isAdminAuthenticated && currentScreen === 'pending_registrations' && (
                    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
                      <div className="bg-[#0E1118] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-[#1E232E] shadow-sm">
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => navigateToScreen('admin_dashboard')}
                            className="w-8 h-8 rounded-lg bg-[#161B26] hover:bg-[#1E2535] text-zinc-300 hover:text-white border border-[#262D3D] flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </button>
                          <div>
                            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">Admin Review</span>
                            <h3 className="font-black text-sm text-white tracking-wide">Pending Registrations</h3>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-400/10 text-amber-400 border border-amber-400/30">
                            {registrations.filter((r) => r.status === 'PENDING').length} PENDING
                          </span>
                          <button
                            onClick={() => refreshAllData()}
                            disabled={isDbLoading}
                            className="p-1.5 rounded-lg bg-[#161B26] hover:bg-[#1E2535] text-zinc-300 hover:text-white border border-[#262D3D] transition-colors cursor-pointer disabled:opacity-50"
                            title="Refresh registry"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isDbLoading ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>

                      <div className="p-4 space-y-3.5">
                        {!currentAdmin && (
                          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 shadow-xs">
                            <div className="flex items-center gap-2.5 text-xs text-amber-200">
                              <Shield className="w-4 h-4 shrink-0 text-amber-400" />
                              <span className="font-semibold text-[11px]">Administrator sign-in is required to approve or reject civil worker registrations.</span>
                            </div>
                            <button
                              onClick={() => initiateAdminLogin()}
                              className="min-h-[44px] px-3.5 py-1.5 bg-[#0E1118] hover:bg-[#161B26] text-amber-400 text-xs font-mono font-bold uppercase tracking-wider rounded-lg shrink-0 transition-colors shadow-xs cursor-pointer border border-[#262D3D]"
                            >
                              Admin Login
                            </button>
                          </div>
                        )}

                        {registrations.filter((r) => r.status === 'PENDING').length === 0 ? (
                          <div className="p-8 text-center bg-[#11141C] rounded-xl border border-[#202534] text-zinc-400 shadow-xs">
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                              <CheckCircle2 className="w-6 h-6" />
                            </div>
                            <h4 className="text-xs font-black text-white uppercase tracking-wider">Queue Cleared</h4>
                            <p className="text-[11px] text-zinc-400 mt-1 max-w-xs mx-auto">No pending civil worker registrations awaiting administrative audit.</p>
                          </div>
                        ) : (
                          registrations
                            .filter((r) => r.status === 'PENDING')
                            .map((reg) => (
                              <div
                                key={reg.registrationId}
                                className="p-4 bg-[#11141C] border border-[#202534] rounded-xl shadow-xs space-y-3 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h5 className="font-black text-sm text-white tracking-tight">{reg.submittedData.fullName}</h5>
                                    </div>
                                    <span className="text-[10px] font-mono text-zinc-400 block mt-0.5">REG ID: {reg.registrationId}</span>
                                  </div>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 shrink-0">
                                    PENDING AUDIT
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#0E1118] p-2.5 rounded-lg border border-[#1E232E]">
                                  <div>
                                    <span className="text-[9px] font-mono uppercase text-zinc-400 block font-bold">Assigned Trade</span>
                                    <span className="font-bold text-zinc-200">{reg.submittedData.jobRole}</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] font-mono uppercase text-zinc-400 block font-bold">Assigned Site</span>
                                    <span className="font-bold text-zinc-200">{reg.submittedData.siteId}</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] font-mono uppercase text-zinc-400 block font-bold">Batch Cohort</span>
                                    <span className="font-mono text-zinc-300">{reg.submittedData.batchNumber}</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] font-mono uppercase text-zinc-400 block font-bold">Contact</span>
                                    <span className="font-mono text-zinc-300">{reg.submittedData.phone}</span>
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-[#1E232E] flex items-center gap-2">
                                  <button
                                    onClick={() => setActiveRegistrationModal(reg)}
                                    className="min-h-[44px] px-3 py-2 border border-[#262D3D] text-zinc-200 text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#161B26] transition-colors cursor-pointer"
                                  >
                                    Inspect
                                  </button>
                                  <button
                                    disabled={isActionLoading}
                                    onClick={async () => {
                                      if (!currentAdmin && !auth.currentUser) {
                                        initiateAdminLogin('Please sign in with your Administrator account to approve worker registrations.');
                                        return;
                                      }
                                      try {
                                        setIsActionLoading(true);
                                        const adminUid = currentAdmin?.uid || auth.currentUser?.uid || 'admin';
                                        const res = await FirebaseService.approveRegistration(reg.registrationId, adminUid);
                                        const assignedId = typeof res === 'string' ? res : (res?.workerId || 'W-1003');
                                        await refreshAllData();
                                        setSimNotice(`Approved worker ${reg.submittedData.fullName}. Assigned Worker ID: ${assignedId}. Profile is now ACTIVE in Firestore.`);
                                      } catch (err: any) {
                                        setSimError(FirebaseService.parseError(err));
                                      } finally {
                                        setIsActionLoading(false);
                                      }
                                    }}
                                    className="min-h-[44px] flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                    <span>Approve & Provision ID</span>
                                  </button>
                                  <button
                                    disabled={isActionLoading}
                                    onClick={() => {
                                      if (!currentAdmin && !auth.currentUser) {
                                        initiateAdminLogin('Please sign in with your Administrator account to reject worker registrations.');
                                        return;
                                      }
                                      setRejectDialog({
                                        isOpen: true,
                                        registrationId: reg.registrationId,
                                        workerName: reg.submittedData.fullName,
                                        reasonPreset: 'Incomplete or unverifiable identity documents',
                                        customReason: '',
                                        error: null
                                      });
                                    }}
                                    className="min-h-[44px] px-3 py-2 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            ))
                        )}
                      </div>

                      {/* Modal Registration Detail */}
                      {activeRegistrationModal && (
                        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
                          <div className="bg-[#11141C] text-zinc-100 rounded-xl max-w-sm w-full shadow-2xl border border-[#202534] overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="bg-[#0E1118] text-white p-4 flex items-center justify-between border-b border-[#1E232E]">
                              <div>
                                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">Credential Dossier</span>
                                <h4 className="font-black text-sm">{activeRegistrationModal.submittedData.fullName}</h4>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                {activeRegistrationModal.status}
                              </span>
                            </div>

                            <div className="p-4 overflow-y-auto space-y-3 text-xs">
                              <div className="bg-[#0E1118] p-3 rounded-lg border border-[#1E232E] space-y-1.5 font-mono text-[11px]">
                                <div className="flex justify-between">
                                  <span className="text-zinc-400 uppercase">Worker ID:</span>
                                  <span className="text-amber-400 font-bold">{activeRegistrationModal.assignedWorkerId || activeRegistrationModal.workerId || 'AUTO-ASSIGNED ON APPROVAL'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-zinc-400 uppercase">Date of Birth:</span>
                                  <span className="text-zinc-200 font-bold">{activeRegistrationModal.submittedData.dateOfBirth}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-zinc-400 uppercase">Trade / Craft:</span>
                                  <span className="text-zinc-200 font-bold">{activeRegistrationModal.submittedData.jobRole}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-zinc-400 uppercase">Cohort Batch:</span>
                                  <span className="text-zinc-200 font-bold">{activeRegistrationModal.submittedData.batchNumber}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-zinc-400 uppercase">Assigned Site:</span>
                                  <span className="text-zinc-200 font-bold">{activeRegistrationModal.submittedData.siteId}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-zinc-400 uppercase">Joining Date:</span>
                                  <span className="text-zinc-200 font-bold">{activeRegistrationModal.submittedData.joiningDate}</span>
                                </div>
                              </div>

                              <div className="space-y-1 text-zinc-300 text-[11px]">
                                <p><strong className="text-zinc-200 uppercase font-mono text-[10px]">Mobile Phone:</strong> {activeRegistrationModal.submittedData.phone}</p>
                                <p><strong className="text-zinc-200 uppercase font-mono text-[10px]">Email:</strong> {activeRegistrationModal.submittedData.email || 'N/A'}</p>
                                <p><strong className="text-zinc-200 uppercase font-mono text-[10px]">Residential Address:</strong> {activeRegistrationModal.submittedData.address}</p>
                                <p><strong className="text-zinc-200 uppercase font-mono text-[10px]">Emergency Contact:</strong> {activeRegistrationModal.submittedData.emergencyContactName} ({activeRegistrationModal.submittedData.emergencyContactPhone})</p>
                              </div>
                            </div>

                            <div className="p-3 bg-[#0E1118] border-t border-[#1E232E] flex items-center gap-2">
                              {activeRegistrationModal.status === 'PENDING' && (
                                <button
                                  disabled={isActionLoading}
                                  onClick={async () => {
                                    if (!currentAdmin && !auth.currentUser) {
                                      initiateAdminLogin('Please sign in with your Administrator account to approve worker registrations.');
                                      return;
                                    }
                                    try {
                                      setIsActionLoading(true);
                                      const adminUid = currentAdmin?.uid || auth.currentUser?.uid || 'admin';
                                      const res = await FirebaseService.approveRegistration(activeRegistrationModal.registrationId, adminUid);
                                      const assignedId = typeof res === 'string' ? res : (res?.workerId || 'W-1003');
                                      await refreshAllData();
                                      setActiveRegistrationModal(null);
                                      setSimNotice(`Approved worker ${activeRegistrationModal.submittedData.fullName}. Assigned Worker ID: ${assignedId}. Profile is now ACTIVE in Firestore.`);
                                    } catch (err: any) {
                                      setSimError(FirebaseService.parseError(err));
                                    } finally {
                                      setIsActionLoading(false);
                                    }
                                  }}
                                  className="min-h-[44px] flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                                >
                                  {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                  <span>Approve</span>
                                </button>
                              )}
                              {activeRegistrationModal.status === 'PENDING' && (
                                <button
                                  disabled={isActionLoading}
                                  onClick={() => {
                                    if (!currentAdmin && !auth.currentUser) {
                                      initiateAdminLogin('Please sign in with your Administrator account to reject worker registrations.');
                                      return;
                                    }
                                    setRejectDialog({
                                      isOpen: true,
                                      registrationId: activeRegistrationModal.registrationId,
                                      workerName: activeRegistrationModal.submittedData.fullName,
                                      reasonPreset: 'Incomplete or unverifiable identity documents',
                                      customReason: '',
                                      error: null
                                    });
                                  }}
                                  className="min-h-[44px] px-3.5 py-2 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                                >
                                  Reject
                                </button>
                              )}
                              <button
                                onClick={() => setActiveRegistrationModal(null)}
                                className="min-h-[44px] px-4 py-2 border border-[#262D3D] text-zinc-300 hover:bg-[#161B26] text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* --- 12. ADMIN QR KIOSK (SITE ATTENDANCE KIOSK) --- */}
                  {isAdminAuthenticated && currentScreen === 'admin_qr_kiosk' && (
                    <AdminQrKiosk
                      sites={sites}
                      currentAdmin={currentAdmin}
                      initialSiteId={selectedKioskSiteId}
                      onBack={() => navigateToScreen('admin_dashboard')}
                      onNavigateToLogin={() => initiateAdminLogin()}
                      simTheme={simTheme}
                      onActiveSessionUpdate={(s) => setActiveKioskSession(s)}
                    />
                  )}

                  {/* --- 13. ADMIN LEAVE APPROVALS --- */}
                  {isAdminAuthenticated && currentScreen === 'admin_leave' && (
                    <AdminLeave
                      currentAdmin={currentAdmin}
                      workers={workers}
                      onBack={() => navigateToScreen('admin_dashboard')}
                      simTheme={simTheme}
                    />
                  )}

                  {/* --- 14. ADMIN OVERTIME LOGS & APPROVALS --- */}
                  {isAdminAuthenticated && currentScreen === 'admin_overtime' && (
                    <AdminOvertime
                      currentAdmin={currentAdmin}
                      workers={workers}
                      sites={sites}
                      onBack={() => navigateToScreen('admin_dashboard')}
                      simTheme={simTheme}
                    />
                  )}

                  {/* --- 15. ADMIN SALARY & WAGE SLIPS --- */}
                  {isAdminAuthenticated && currentScreen === 'admin_salary' && (
                    <AdminSalary
                      currentAdmin={currentAdmin}
                      workers={workers}
                      onBack={() => navigateToScreen('admin_dashboard')}
                      simTheme={simTheme}
                    />
                  )}

                  {/* --- 16. ADMIN EXECUTIVE REPORTS (PHASE 6) --- */}
                  {isAdminAuthenticated && currentScreen === 'admin_reports' && (
                    <AdminReports
                      currentAdmin={currentAdmin}
                      workers={workers}
                      sites={sites}
                      batches={batches}
                      onBack={() => navigateToScreen('admin_dashboard')}
                      simTheme={simTheme}
                    />
                  )}

                  {/* --- 17. ADMIN SECURITY & AI INTELLIGENCE (PHASE 7) --- */}
                  {isAdminAuthenticated && currentScreen === 'admin_security' && (
                    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
                      <div className="bg-[#0E1118] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-[#1E232E] shadow-sm">
                        <div className="flex items-center gap-2.5">
                          <button
                            id="admin-security-back-btn"
                            onClick={() => navigateToScreen('admin_dashboard')}
                            className="w-8 h-8 rounded-lg bg-[#161B26] hover:bg-[#1E2535] text-zinc-300 hover:text-white border border-[#262D3D] flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </button>
                          <div>
                            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">Civil Defense Audit</span>
                            <h3 className="font-black text-sm text-white tracking-wide">Security Audit & AI Intelligence</h3>
                          </div>
                        </div>
                      </div>
                      <AdminSecurityDashboard
                        currentAdmin={currentAdmin}
                        onBack={() => navigateToScreen('admin_dashboard')}
                      />
                    </div>
                  )}

                  {/* --- 19. WORKER ATTENDANCE (PHASE 2 QR CHECK-IN / CHECK-OUT) --- */}
                  {isWorkerAuthenticated && currentScreen === 'worker_attendance' && (
                    <WorkerAttendance
                      currentWorker={authRole === 'WORKER' && currentWorker ? currentWorker : null}
                      sites={sites}
                      simTheme={simTheme}
                      onBack={() => {
                        if (authRole === 'WORKER') {
                          setCurrentScreen('worker_dashboard');
                        } else {
                          setCurrentScreen('welcome');
                        }
                      }}
                      onNavigateToLogin={() => {
                        setPendingWorkerScreen('worker_attendance');
                        setCurrentScreen('worker_login');
                      }}
                      activeKioskSession={activeKioskSession}
                    />
                  )}

                  {/* --- 20. WORKER LEAVE MANAGEMENT --- */}
                  {isWorkerAuthenticated && currentScreen === 'worker_leave' && (
                    <WorkerLeave
                      currentWorker={authRole === 'WORKER' && currentWorker ? currentWorker : null}
                      onBack={() => {
                        if (authRole === 'WORKER') {
                          setCurrentScreen('worker_dashboard');
                        } else {
                          setCurrentScreen('welcome');
                        }
                      }}
                      onNavigateToLogin={() => {
                        setPendingWorkerScreen('worker_leave');
                        setCurrentScreen('worker_login');
                      }}
                      simTheme={simTheme}
                    />
                  )}

                  {/* --- 21. WORKER OVERTIME MANAGEMENT --- */}
                  {isWorkerAuthenticated && currentScreen === 'worker_overtime' && (
                    <WorkerOvertime
                      currentWorker={authRole === 'WORKER' && currentWorker ? currentWorker : null}
                      sites={sites}
                      onBack={() => {
                        if (authRole === 'WORKER') {
                          setCurrentScreen('worker_dashboard');
                        } else {
                          setCurrentScreen('welcome');
                        }
                      }}
                      onNavigateToLogin={() => {
                        setPendingWorkerScreen('worker_overtime');
                        setCurrentScreen('worker_login');
                      }}
                      simTheme={simTheme}
                    />
                  )}

                  {/* --- 22. WORKER SALARY & WAGE SLIPS --- */}
                  {isWorkerAuthenticated && currentScreen === 'worker_salary' && (
                    <WorkerSalary
                      currentWorker={authRole === 'WORKER' && currentWorker ? currentWorker : null}
                      onBack={() => {
                        if (authRole === 'WORKER') {
                          setCurrentScreen('worker_dashboard');
                        } else {
                          setCurrentScreen('welcome');
                        }
                      }}
                      onNavigateToLogin={() => {
                        setPendingWorkerScreen('worker_salary');
                        setCurrentScreen('worker_login');
                      }}
                      simTheme={simTheme}
                    />
                  )}

                  {/* --- 18. WORKER DASHBOARD --- */}
                  {isWorkerAuthenticated && currentScreen === 'worker_dashboard' && (
                    <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto">
                      {/* Field Operations Header */}
                      <div className="bg-[#0B1120] text-white p-3.5 sm:p-4 flex items-center justify-between sticky top-0 z-20 border-b border-slate-800 shadow-md">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                            <HardHat className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-black text-sm sm:text-base text-white tracking-tight">Field Operations</h3>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                SITE OPS
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono tracking-wider">ANGEL ENTERPRISES // CIVIL CREW</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setCurrentScreen('worker_profile')}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-amber-400 hover:text-amber-300 transition-colors"
                            title="View Safety Pass & Profile"
                          >
                            <Users className="w-4 h-4" />
                          </button>
                          <button
                            id="btn-worker-dashboard-signout"
                            onClick={handleUniversalSignOut}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
                            title="Sign Out"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="p-3 sm:p-4 space-y-3.5">
                        {(() => {
                          const activeDisplayWorker = authRole === 'WORKER' ? currentWorker : null;
                          if (!activeDisplayWorker) {
                            return (
                              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 shadow-xs">
                                <HardHat className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                <p className="text-sm font-bold text-slate-800">No active worker session</p>
                                <p className="text-xs text-slate-500 mt-1 mb-5 max-w-xs mx-auto">
                                  Please sign in with your registered Worker ID and PIN to access today's field actions.
                                </p>
                                <button
                                  onClick={() => {
                                    setPendingWorkerScreen('worker_dashboard');
                                    setCurrentScreen('worker_login');
                                  }}
                                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black text-xs shadow-sm inline-flex items-center gap-2 transition-all active:scale-95"
                                >
                                  <LogIn className="w-4 h-4" />
                                  <span>Sign In as Worker</span>
                                </button>
                              </div>
                            );
                          }
                          const assignedSite = sites.find((s) => s.siteId === activeDisplayWorker.siteId);

                          return (
                            <div className="space-y-3.5">
                              {/* 1. Worker Identity Card (Top Focus) */}
                              <div
                                onClick={() => setCurrentScreen('worker_profile')}
                                className="bg-[#0B1120] text-white p-4 rounded-2xl shadow-md cursor-pointer hover:border-amber-400 border border-slate-800 transition-all relative overflow-hidden group"
                              >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-radial from-amber-500/10 to-transparent pointer-events-none" />

                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    {activeDisplayWorker.profilePhoto?.downloadUrl ? (
                                      <img
                                        src={activeDisplayWorker.profilePhoto.downloadUrl}
                                        alt={activeDisplayWorker.fullName}
                                        className="w-13 h-13 rounded-full object-cover border-2 border-amber-400 shrink-0 shadow-md"
                                      />
                                    ) : (
                                      <div className="w-13 h-13 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center shrink-0 font-black shadow-md border-2 border-amber-300">
                                        <HardHat className="w-6 h-6" />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 font-mono">
                                          CIVIL FIELD OPERATIVE
                                        </span>
                                      </div>
                                      <h4 className="font-black text-base sm:text-lg text-white leading-tight truncate">
                                        {activeDisplayWorker.fullName}
                                      </h4>
                                      <span className="text-xs font-mono font-black text-amber-300">
                                        ID: {activeDisplayWorker.workerId}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="shrink-0">
                                    {renderStatusBadge(activeDisplayWorker.status)}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-800">
                                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                                    <span className="text-[9px] text-slate-400 block font-medium uppercase tracking-wider">Trade Role</span>
                                    <span className="font-bold text-white text-xs">{activeDisplayWorker.jobRole}</span>
                                  </div>
                                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                                    <span className="text-[9px] text-slate-400 block font-medium uppercase tracking-wider">Cohort Batch</span>
                                    <span className="font-bold text-slate-200 text-xs">{activeDisplayWorker.batchNumber}</span>
                                  </div>
                                </div>

                                <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-300">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span className="truncate font-medium text-[11px]">
                                      {assignedSite ? `${assignedSite.siteName} (${assignedSite.siteId})` : activeDisplayWorker.siteId}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-emerald-400 font-bold shrink-0">
                                    • GEOFENCE VERIFIED
                                  </span>
                                </div>
                              </div>

                              {/* 2. Primary Attendance Action Card (The Core Focus!) */}
                              <div className="bg-white rounded-2xl border-2 border-emerald-500 shadow-md p-3.5 sm:p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                      Today's Attendance Action
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    SITE GATE READY
                                  </span>
                                </div>

                                <button
                                  id="worker-primary-attendance-btn"
                                  onClick={() => setCurrentScreen('worker_attendance')}
                                  className="w-full py-4 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-black text-sm shadow-md flex items-center justify-between transition-all transform active:scale-[0.99] border-2 border-emerald-500 group"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-700 border border-emerald-400/40 flex items-center justify-center text-amber-300 shadow-inner group-hover:scale-105 transition-transform">
                                      <QrCode className="w-7 h-7" />
                                    </div>
                                    <div className="text-left">
                                      <span className="block text-[10px] font-black text-emerald-200 uppercase tracking-wider">
                                        Fast Geofenced Check-In
                                      </span>
                                      <span className="block text-base font-black text-white tracking-wide">
                                        SCAN SITE QR TOKEN
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 text-slate-950 font-black text-xs bg-amber-400 group-hover:bg-amber-300 px-3 py-2 rounded-lg shadow-xs transition-colors">
                                    <span>SCAN</span>
                                    <ArrowRight className="w-4 h-4" />
                                  </div>
                                </button>

                                <p className="text-[11px] text-slate-500 leading-tight text-center">
                                  Point your camera at the site supervisor's rotating QR token at the entry kiosk.
                                </p>
                              </div>

                              {/* 3. Tactical Quick Field Utilities (2x2 Grid) */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                    Field Operations Services
                                  </h4>
                                  <span className="text-[10px] font-mono font-bold text-slate-400">4 Modules Active</span>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                  {/* Attendance History */}
                                  <div
                                    id="worker-module-attendance"
                                    onClick={() => setCurrentScreen('worker_attendance')}
                                    className="p-3 bg-white hover:bg-emerald-50/40 border border-slate-200 hover:border-emerald-400 rounded-xl cursor-pointer shadow-2xs transition-all active:scale-95 group"
                                  >
                                    <div className="flex items-center justify-between mb-1.5">
                                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                        <Clock className="w-4 h-4" />
                                      </div>
                                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        Logs
                                      </span>
                                    </div>
                                    <h5 className="font-bold text-xs text-slate-900">Attendance Log</h5>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Punch in/out history</p>
                                  </div>

                                  {/* Leave Requests */}
                                  <div
                                    id="worker-module-leave"
                                    onClick={() => setCurrentScreen('worker_leave')}
                                    className="p-3 bg-white hover:bg-indigo-50/40 border border-slate-200 hover:border-indigo-400 rounded-xl cursor-pointer shadow-2xs transition-all active:scale-95 group"
                                  >
                                    <div className="flex items-center justify-between mb-1.5">
                                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                        <Calendar className="w-4 h-4" />
                                      </div>
                                      <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                        Leave
                                      </span>
                                    </div>
                                    <h5 className="font-bold text-xs text-slate-900">Leave Requests</h5>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Casual & medical leaves</p>
                                  </div>

                                  {/* Overtime Claims */}
                                  <div
                                    id="worker-module-overtime"
                                    onClick={() => setCurrentScreen('worker_overtime')}
                                    className="p-3 bg-white hover:bg-amber-50/40 border border-slate-200 hover:border-amber-400 rounded-xl cursor-pointer shadow-2xs transition-all active:scale-95 group"
                                  >
                                    <div className="flex items-center justify-between mb-1.5">
                                      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-800 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                                        <Clock className="w-4 h-4" />
                                      </div>
                                      <span className="text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                        OT
                                      </span>
                                    </div>
                                    <h5 className="font-bold text-xs text-slate-900">Overtime Claims</h5>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Log extra shift hours</p>
                                  </div>

                                  {/* Salary & Slips */}
                                  <div
                                    id="worker-module-salary"
                                    onClick={() => setCurrentScreen('worker_salary')}
                                    className="p-3 bg-white hover:bg-emerald-50/40 border border-slate-200 hover:border-emerald-400 rounded-xl cursor-pointer shadow-2xs transition-all active:scale-95 group"
                                  >
                                    <div className="flex items-center justify-between mb-1.5">
                                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                        <DollarSign className="w-4 h-4" />
                                      </div>
                                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        Wage
                                      </span>
                                    </div>
                                    <h5 className="font-bold text-xs text-slate-900">Salary & Slips</h5>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Rates & payment slips</p>
                                  </div>
                                </div>
                              </div>

                              {/* 4. Site Safety Protocol Notice */}
                              <div className="p-3 bg-slate-900 text-white rounded-xl border border-slate-800 flex items-start gap-2.5">
                                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <div className="text-[11px] leading-relaxed">
                                  <span className="font-bold text-amber-400 block uppercase tracking-wider text-[10px]">
                                    Site Safety Protocol Enforced
                                  </span>
                                  <p className="text-slate-300 mt-0.5">
                                    Mandatory PPE required on active civil zones: Hard hat, high-visibility vest, and safety boots.
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* --- 23. WORKER PROFILE (READ-ONLY) --- */}
                  {isWorkerAuthenticated && currentScreen === 'worker_profile' && (
                    <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto">
                      <div className="bg-slate-950 text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-slate-800 shadow-sm">
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => setCurrentScreen('worker_dashboard')}
                            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </button>
                          <div>
                            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">Civil Identity Dossier</span>
                            <h3 className="font-black text-sm text-white tracking-wide">Worker Profile</h3>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          READ-ONLY
                        </span>
                      </div>

                      <div className="p-4 space-y-4">
                        {(() => {
                          const activeDisplayWorker = authRole === 'WORKER' ? currentWorker : null;
                          if (!activeDisplayWorker) {
                            return (
                              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-400 shadow-xs">
                                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center mx-auto mb-3">
                                  <HardHat className="w-6 h-6" />
                                </div>
                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">No Active Session</h4>
                                <p className="text-[11px] text-slate-500 mt-1 mb-4 max-w-xs mx-auto">Please authenticate with your registered Worker ID to access your credential records.</p>
                                <button
                                  onClick={() => {
                                    setPendingWorkerScreen('worker_profile');
                                    setCurrentScreen('worker_login');
                                  }}
                                  className="min-h-[44px] px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-black text-xs uppercase tracking-wider shadow-sm inline-flex items-center gap-2 cursor-pointer transition-colors"
                                >
                                  <LogIn className="w-4 h-4" />
                                  <span>Sign In as Worker</span>
                                </button>
                              </div>
                            );
                          }

                          const assignedSite = sites.find((s) => s.siteId === activeDisplayWorker.siteId);

                          return (
                            <>
                              {/* Primary Civil Identity Credential Badge Card */}
                              <div className="bg-slate-950 text-white rounded-xl border border-slate-800 p-4 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
                                
                                <div className="flex items-center gap-3.5 relative z-10">
                                  <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-amber-400/80 bg-slate-900 shrink-0 flex items-center justify-center shadow-md">
                                    {activeDisplayWorker.profilePhoto?.downloadUrl ? (
                                      <img
                                        src={activeDisplayWorker.profilePhoto.downloadUrl}
                                        alt={activeDisplayWorker.fullName}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <HardHat className="w-8 h-8 text-amber-400" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                      <span className="font-mono text-xs font-black text-amber-400 tracking-wider">
                                        {activeDisplayWorker.workerId}
                                      </span>
                                      {renderStatusBadge(activeDisplayWorker.status)}
                                    </div>
                                    <h4 className="font-black text-base text-white tracking-tight truncate">
                                      {activeDisplayWorker.fullName}
                                    </h4>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-300 mt-1">
                                      <span className="font-medium text-[11px] text-slate-400">Trade:</span>
                                      <span className="font-bold text-white text-[11px]">{activeDisplayWorker.jobRole}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
                                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                                    <span className="text-[9px] font-mono uppercase text-slate-400 block font-bold">Assigned Site</span>
                                    <span className="font-bold text-white truncate block">
                                      {assignedSite ? `${assignedSite.siteName} (${assignedSite.siteId})` : activeDisplayWorker.siteId}
                                    </span>
                                  </div>
                                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                                    <span className="text-[9px] font-mono uppercase text-slate-400 block font-bold">Cohort Batch</span>
                                    <span className="font-mono font-bold text-amber-400 block">
                                      {activeDisplayWorker.batchNumber}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Worker Profile Photo Management */}
                              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <div>
                                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider block">Biometric Record</span>
                                    <h5 className="font-black text-xs text-slate-900 uppercase tracking-wide">
                                      ID Badge Photograph
                                    </h5>
                                  </div>
                                </div>
                                <WorkerPhotoManager
                                  worker={activeDisplayWorker}
                                  currentProfilePhoto={activeDisplayWorker.profilePhoto}
                                  onPhotoUpdated={(photo) => {
                                    setCurrentWorker((prev) => (prev ? { ...prev, profilePhoto: photo || undefined } : null));
                                    setWorkers((prev) =>
                                      prev.map((w) => (w.workerId === activeDisplayWorker.workerId ? { ...w, profilePhoto: photo || undefined } : w))
                                    );
                                  }}
                                  canEdit={true}
                                  simTheme={simTheme}
                                />
                              </div>

                              {/* Employment Details Dossier */}
                              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <div>
                                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider block">Official Contract</span>
                                    <h5 className="font-black text-xs text-slate-900 uppercase tracking-wide">
                                      Employment Dossier
                                    </h5>
                                  </div>
                                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                                    VERIFIED
                                  </span>
                                </div>

                                <div className="divide-y divide-slate-100 text-xs">
                                  <div className="py-2 flex justify-between items-center">
                                    <span className="font-mono text-[11px] text-slate-500 uppercase">Worker ID</span>
                                    <span className="font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">{activeDisplayWorker.workerId}</span>
                                  </div>
                                  <div className="py-2 flex justify-between items-center">
                                    <span className="font-mono text-[11px] text-slate-500 uppercase">Batch Number</span>
                                    <span className="font-mono font-bold text-slate-900">{activeDisplayWorker.batchNumber}</span>
                                  </div>
                                  <div className="py-2 flex justify-between items-center">
                                    <span className="font-mono text-[11px] text-slate-500 uppercase">Trade / Craft</span>
                                    <span className="font-bold text-slate-900">{activeDisplayWorker.jobRole}</span>
                                  </div>
                                  <div className="py-2 flex justify-between items-center">
                                    <span className="font-mono text-[11px] text-slate-500 uppercase">Assigned Site</span>
                                    <span className="font-bold text-slate-900 text-right">{assignedSite ? `${assignedSite.siteName} (${assignedSite.siteId})` : activeDisplayWorker.siteId}</span>
                                  </div>
                                  <div className="py-2 flex justify-between items-center">
                                    <span className="font-mono text-[11px] text-slate-500 uppercase">Joining Date</span>
                                    <span className="font-mono font-semibold text-slate-900">{activeDisplayWorker.joiningDate}</span>
                                  </div>
                                  <div className="py-2 flex justify-between items-center">
                                    <span className="font-mono text-[11px] text-slate-500 uppercase">Mobile Phone</span>
                                    <span className="font-mono font-semibold text-slate-900">{activeDisplayWorker.phone}</span>
                                  </div>
                                  <div className="py-2 flex justify-between items-center">
                                    <span className="font-mono text-[11px] text-slate-500 uppercase">Email</span>
                                    <span className="font-mono text-slate-800">{activeDisplayWorker.email || 'N/A'}</span>
                                  </div>
                                  <div className="py-2 flex justify-between items-center">
                                    <span className="font-mono text-[11px] text-slate-500 uppercase">Emergency Contact</span>
                                    <span className="font-semibold text-slate-900 text-right">
                                      {activeDisplayWorker.emergencyContactName} ({activeDisplayWorker.emergencyContactPhone})
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Simulator Notification / Toast */}
                  {simNotice && (
                    <div className="absolute top-12 inset-x-3 bg-slate-900 text-white p-3 rounded-xl shadow-xl z-50 text-xs border border-slate-700 flex items-start gap-2 animate-fadeIn">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="leading-snug">{simNotice}</p>
                      </div>
                      <button onClick={() => setSimNotice(null)} className="text-slate-400 hover:text-white text-xs font-bold">
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Simulator Error Notice */}
                  {simError && (
                    <div className="absolute top-12 inset-x-3 bg-red-950 text-red-200 p-3 rounded-xl shadow-xl z-50 text-xs border border-red-700 flex items-start gap-2 animate-fadeIn">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="leading-snug">{simError}</p>
                      </div>
                      <button onClick={() => setSimError(null)} className="text-red-300 hover:text-white text-xs font-bold">
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Reject Registration Dialog with Required Reason */}
                  {rejectDialog && rejectDialog.isOpen && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
                      <div className={`rounded-2xl p-4 max-w-xs w-full shadow-2xl space-y-3 border ${
                        simTheme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                      }`}>
                        <div className="flex items-center gap-2 text-rose-600">
                          <UserX className="w-4 h-4 shrink-0" />
                          <h4 className="font-bold text-xs">Reject Registration Application</h4>
                        </div>
                        
                        <p className="text-[11px] text-slate-500 leading-snug">
                          Rejecting applicant <strong className="text-slate-800 dark:text-slate-200">{rejectDialog.workerName}</strong>. A reason is required and will be displayed on the worker's status screen.
                        </p>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                            Reason Category *
                          </label>
                          <select
                            value={rejectDialog.reasonPreset}
                            onChange={(e) => {
                              const val = e.target.value;
                              setRejectDialog({
                                ...rejectDialog,
                                reasonPreset: val,
                                customReason: val !== 'Other' ? val : rejectDialog.customReason,
                                error: null
                              });
                            }}
                            className={`w-full text-xs p-2 rounded-lg border focus:ring-2 focus:ring-rose-500 outline-none ${
                              simTheme === 'dark' ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                            }`}
                          >
                            <option value="Incomplete or unverifiable identity documents">Incomplete or unverifiable identity documents</option>
                            <option value="Mismatch in trade qualifications or experience">Mismatch in trade qualifications or experience</option>
                            <option value="Unable to verify emergency contact / mobile number">Unable to verify emergency contact / mobile number</option>
                            <option value="Duplicate application detected">Duplicate application detected</option>
                            <option value="Site quota reached for current cohort">Site quota reached for current cohort</option>
                            <option value="Other">Other / Custom reason...</option>
                          </select>
                        </div>

                        {rejectDialog.reasonPreset === 'Other' && (
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                              Custom Reason *
                            </label>
                            <textarea
                              rows={2}
                              value={rejectDialog.customReason}
                              onChange={(e) => setRejectDialog({ ...rejectDialog, customReason: e.target.value, error: null })}
                              placeholder="Describe specific rejection rationale..."
                              className={`w-full text-xs p-2 rounded-lg border focus:ring-2 focus:ring-rose-500 outline-none ${
                                simTheme === 'dark' ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                              }`}
                            />
                          </div>
                        )}

                        {rejectDialog.error && (
                          <p className="text-[11px] text-rose-600 font-semibold">{rejectDialog.error}</p>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            disabled={isActionLoading}
                            onClick={async () => {
                              const finalReason = (rejectDialog.reasonPreset === 'Other' ? rejectDialog.customReason : rejectDialog.reasonPreset).trim();
                              if (!finalReason) {
                                setRejectDialog({ ...rejectDialog, error: 'A specific rejection reason is required.' });
                                return;
                              }
                              try {
                                setIsActionLoading(true);
                                const adminUid = currentAdmin?.uid || auth.currentUser?.uid || 'admin';
                                await FirebaseService.rejectRegistration(rejectDialog.registrationId, adminUid, finalReason);
                                await refreshAllData();
                                setSimNotice(`Registration for ${rejectDialog.workerName} rejected with reason: "${finalReason}".`);
                                setRejectDialog(null);
                                if (activeRegistrationModal) setActiveRegistrationModal(null);
                              } catch (err: any) {
                                setRejectDialog({ ...rejectDialog, error: FirebaseService.parseError(err) });
                              } finally {
                                setIsActionLoading(false);
                              }
                            }}
                            className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                          >
                            {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                            <span>Confirm Reject</span>
                          </button>
                          <button
                            disabled={isActionLoading}
                            onClick={() => setRejectDialog(null)}
                            className={`px-3 py-2 border text-xs font-semibold rounded-lg ${
                              simTheme === 'dark' ? 'border-slate-700 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Material 3 Confirmation Dialog */}
                  {confirmDialog && confirmDialog.isOpen && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
                      <div className={`rounded-2xl p-4 max-w-xs w-full shadow-2xl space-y-3 border ${
                        simTheme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                      }`}>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white">{confirmDialog.title}</h4>
                        <p className="text-[11px] text-slate-500 leading-snug">{confirmDialog.message}</p>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            disabled={isActionLoading}
                            onClick={() => {
                              confirmDialog.onConfirm();
                              setConfirmDialog(null);
                            }}
                            className={`flex-1 py-2 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                              confirmDialog.isDestructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
                            }`}
                          >
                            <span>{confirmDialog.confirmLabel}</span>
                          </button>
                          <button
                            disabled={isActionLoading}
                            onClick={() => setConfirmDialog(null)}
                            className={`px-3 py-2 border text-xs font-semibold rounded-lg ${
                              simTheme === 'dark' ? 'border-slate-700 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Android System Navigation Bar (Gesture Pill) */}
                <div className="h-5 bg-slate-950 flex items-center justify-center">
                  <div className="w-28 h-1 bg-slate-700 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CODE BROWSER */}
        {activeTab === 'code' && (
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 items-start">
            {/* File Tree Sidebar */}
            <div className="w-full lg:w-80 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col flex-shrink-0">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Project Files</h3>
                </div>
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{ANDROID_FILES.length} Files</span>
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  placeholder="Filter files..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                />
              </div>

              {/* List */}
              <div className="space-y-1 max-h-[640px] overflow-y-auto pr-1">
                {filteredFiles.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-all flex items-center justify-between ${
                      selectedFile.path === file.path
                        ? 'bg-indigo-50 text-indigo-700 font-semibold border-l-4 border-indigo-600'
                        : 'text-slate-600 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <span className="truncate pr-2">{file.name}</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-sans font-semibold">
                      {file.category}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Code Display Area */}
            <div className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
              <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-mono font-bold text-slate-200">{selectedFile.path}</span>
                </div>
                <button
                  onClick={() => copyCode(selectedFile.content, selectedFile.path)}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  {copiedPath === selectedFile.path ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPath === selectedFile.path ? 'Copied!' : 'Copy File'}
                </button>
              </div>

              <div className="p-5 bg-slate-950 overflow-x-auto max-h-[680px]">
                <pre className="text-xs font-mono text-slate-200 leading-relaxed">
                  <code>{selectedFile.content}</code>
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ARCHITECTURE & FIREBASE GUIDE */}
        {activeTab === 'guide' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Firestore Security Rules</h3>
                  <p className="text-xs text-slate-500">Strict Role-Based Access Control enforcing ADMIN vs. WORKER boundaries.</p>
                </div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 overflow-x-auto">
                <pre className="text-xs font-mono text-indigo-200/90 leading-relaxed">
                  <code>{ANDROID_FILES.find((f) => f.name === 'firestore.rules')?.content}</code>
                </pre>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  Firestore Collections Schema
                </h4>
                <div className="text-xs space-y-2.5 text-slate-700">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-indigo-700">/users/{'{uid}'}</span>
                    <p className="text-[11px] text-slate-500 mt-1">uid, role (ADMIN|WORKER), name, email, phone, status, createdAt, updatedAt</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-indigo-700">/workers/{'{workerId}'}</span>
                    <p className="text-[11px] text-slate-500 mt-1">
                      workerId, uid, fullName, phone, email, batchNumber, jobRole, siteId, dateOfBirth, address, emergencyContactName, emergencyContactPhone, joiningDate, status, createdAt, updatedAt
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-indigo-700">/sites/{'{siteId}'}</span>
                    <p className="text-[11px] text-slate-500 mt-1">
                      siteId, siteName, projectName, address, description, status, createdAt, updatedAt (Future: latitude, longitude, geofenceRadius, qrConfig)
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-indigo-700">/workerRegistrations/{'{regId}'}</span>
                    <p className="text-[11px] text-slate-500 mt-1">
                      registrationId, workerId, submittedData, status (PENDING|APPROVED|REJECTED|SUSPENDED), submittedAt, reviewedAt, reviewedBy
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-indigo-600" />
                  How to Build in Android Studio
                </h4>
                <ol className="text-xs space-y-2.5 text-slate-700 list-decimal list-inside leading-relaxed">
                  <li className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    Click <strong>"Export Android Studio ZIP"</strong> to download the full source code package.
                  </li>
                  <li className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    Open Android Studio (Hedgehog or Ladybug) and select <strong>"Open Project"</strong> pointing to the extracted folder.
                  </li>
                  <li className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    In Firebase Console, register Android package <code>com.civilworkforce.attendance</code> and download <code>google-services.json</code> into <code>app/</code>.
                  </li>
                  <li className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    Enable <strong>Email/Password</strong> authentication in Firebase Authentication.
                  </li>
                  <li className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    Deploy <code>firestore.rules</code> and run the app on an Android 8.0+ (API 26+) physical device or emulator.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
