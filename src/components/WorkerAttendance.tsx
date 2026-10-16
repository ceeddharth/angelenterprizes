import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  ArrowLeft,
  Camera,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  RefreshCw,
  Zap,
  LogIn,
  Upload,
  UserCheck,
  XCircle,
  HelpCircle,
  Wifi,
  WifiOff,
  CloudOff,
  RotateCcw,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { WorkerRecord, ConstructionSite, AttendanceRecord, QrTokenResponse, QueuedAttendance } from '../types';
import { FirebaseService } from '../services/firebaseService';
import { attendanceQueueService } from '../services/attendanceQueueService';

interface WorkerAttendanceProps {
  currentWorker: WorkerRecord | null;
  sites: ConstructionSite[];
  simTheme?: 'light' | 'dark';
  onBack: () => void;
  onNavigateToLogin: () => void;
  activeKioskSession?: QrTokenResponse | null;
}

export const WorkerAttendance: React.FC<WorkerAttendanceProps> = ({
  currentWorker,
  sites,
  simTheme = 'light',
  onBack,
  onNavigateToLogin,
  activeKioskSession
}) => {
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [isLoadingRecord, setIsLoadingRecord] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'simulator' | 'camera'>('simulator');
  const [actionMode, setActionMode] = useState<'AUTO' | 'CHECK_IN' | 'CHECK_OUT'>('AUTO');

  // Simulator payload input
  const [rawPayloadInput, setRawPayloadInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<{
    type: 'CHECK_IN' | 'CHECK_OUT';
    title: string;
    message: string;
    timestamp: string;
  } | null>(null);
  const [actionQueued, setActionQueued] = useState<{
    operationId: string;
    message: string;
    timestamp: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Phase 3 Durable Offline Queue State
  const [isOnline, setIsOnline] = useState<boolean>(attendanceQueueService.isNetworkAvailable());
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(attendanceQueueService.isOfflineSimulated());
  const [queueItems, setQueueItems] = useState<QueuedAttendance[]>(attendanceQueueService.getQueue());
  const [showQueueDrawer, setShowQueueDrawer] = useState<boolean>(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState<boolean>(false);

  // Camera scanner state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const effectiveWorkerSite = (currentWorker?.siteId || (currentWorker as any)?.assignedSiteId || '').trim();
  const assignedSiteObj = sites.find((s) => s.siteId === effectiveWorkerSite);

  // Helper to format timestamps to India Standard Time (IST)
  const formatIstDateTime = (ts: any): string => {
    if (!ts) return '—';
    let d: Date;
    if (ts.toDate && typeof ts.toDate === 'function') {
      d = ts.toDate();
    } else if (ts.seconds) {
      d = new Date(ts.seconds * 1000);
    } else if (ts instanceof Date) {
      d = ts;
    } else if (typeof ts === 'string' || typeof ts === 'number') {
      d = new Date(ts);
    } else {
      return 'Just now';
    }
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d);
  };

  // Helper to get today's date string in IST (YYYY-MM-DD)
  const getTodayIstString = (): string => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  };

  // Fetch today's attendance record directly from Firestore
  const fetchTodayAttendance = useCallback(async () => {
    if (!currentWorker) return;
    setIsLoadingRecord(true);
    try {
      const record = await FirebaseService.getTodayAttendance(currentWorker.workerId);
      setTodayAttendance(record);
    } catch (err: any) {
      console.error('[WorkerAttendance] Error fetching today attendance:', err);
    } finally {
      setIsLoadingRecord(false);
    }
  }, [currentWorker]);

  useEffect(() => {
    fetchTodayAttendance();
  }, [fetchTodayAttendance]);

  // Subscribe to offline queue & connection status
  useEffect(() => {
    const unsubQueue = attendanceQueueService.subscribeQueue((items) => {
      setQueueItems(items);
      const anySynced = items.some(i => i.queueStatus === 'SYNCED');
      if (anySynced) {
        fetchTodayAttendance();
      }
    });

    const unsubConn = attendanceQueueService.subscribeConnection((online) => {
      setIsOnline(online);
      setIsSimulatedOffline(attendanceQueueService.isOfflineSimulated());
    });

    return () => {
      unsubQueue();
      unsubConn();
    };
  }, [fetchTodayAttendance]);

  // Pre-fill payload input when activeKioskSession changes or on load
  useEffect(() => {
    if (activeKioskSession && !rawPayloadInput) {
      setRawPayloadInput(
        JSON.stringify(
          {
            siteId: activeKioskSession.siteId,
            sessionId: activeKioskSession.sessionId,
            token: activeKioskSession.token
          },
          null,
          2
        )
      );
    }
  }, [activeKioskSession, rawPayloadInput]);

  // Non-blocking temporary notification auto-dismiss (3000ms)
  useEffect(() => {
    if (!actionSuccess) return;
    const timer = setTimeout(() => setActionSuccess(null), 3000);
    return () => clearTimeout(timer);
  }, [actionSuccess]);

  useEffect(() => {
    if (!actionQueued) return;
    const timer = setTimeout(() => setActionQueued(null), 3000);
    return () => clearTimeout(timer);
  }, [actionQueued]);

  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 3000);
    return () => clearTimeout(timer);
  }, [actionError]);

  useEffect(() => {
    if (!cameraError) return;
    const timer = setTimeout(() => setCameraError(null), 3000);
    return () => clearTimeout(timer);
  }, [cameraError]);

  // Handle core scan submission pipeline
  const submitQrPayload = async (payloadString: string, requestedAction: 'AUTO' | 'CHECK_IN' | 'CHECK_OUT') => {
    setIsProcessing(true);
    setActionError(null);
    setActionSuccess(null);
    setActionQueued(null);

    const nowIstStr = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date());

    try {
      // 1. Parse payload JSON
      let parsed: any;
      try {
        parsed = JSON.parse(payloadString.trim());
      } catch {
        throw new Error('Invalid QR code data. Expected a valid JSON object with siteId, sessionId, and token.');
      }

      const { siteId, sessionId, token } = parsed;
      if (!siteId || !token) {
        throw new Error('Incomplete QR code payload. Must contain "siteId" and "token".');
      }

      // 2. Pre-validate worker state
      if (!currentWorker) {
        throw new Error('No active civil worker session found. Please log in first.');
      }
      if (currentWorker.status !== 'ACTIVE') {
        throw new Error(`Worker status is ${currentWorker.status}. Only ACTIVE workers can record attendance.`);
      }

      // Check site match before calling API
      if (effectiveWorkerSite !== siteId) {
        throw new Error(`Site Mismatch Rejection: You are assigned to site "${effectiveWorkerSite}", but this QR code is for site "${siteId}". Cross-site scans are strictly prohibited.`);
      }

      // 3. Check network state: If offline or simulated offline, enqueue locally
      if (!attendanceQueueService.isNetworkAvailable()) {
        const queuedItem = attendanceQueueService.enqueue({
          workerId: currentWorker.workerId,
          workerUid: currentWorker.uid,
          workerName: currentWorker.fullName,
          siteId,
          qrToken: token,
          qrSessionId: sessionId || `QRSESS_${siteId}`,
          action: requestedAction
        });

        setActionQueued({
          operationId: queuedItem.operationId,
          message: `Device is currently offline. Attendance for site "${siteId}" has been saved securely to local queue (${queuedItem.operationId}). It will automatically synchronize with the server once connectivity is restored.`,
          timestamp: nowIstStr
        });
        return;
      }

      // 4. Server HMAC Verification & Atomic Execution with Idempotency Key
      const operationId = attendanceQueueService.generateOperationId(currentWorker.workerId);

      let recordRes;
      try {
        recordRes = await FirebaseService.recordAttendance({
          siteId,
          qrSessionId: sessionId || `QRSESS_${siteId}`,
          qrToken: token,
          action: requestedAction,
          operationId
        });
      } catch (networkOrApiErr: any) {
        // If network transport failed during recording, securely enqueue locally
        if (
          networkOrApiErr.message?.includes('Failed to fetch') ||
          networkOrApiErr.message?.includes('Network') ||
          networkOrApiErr.message?.includes('network') ||
          networkOrApiErr.message?.includes('timeout')
        ) {
          const queuedItem = attendanceQueueService.enqueue({
            workerId: currentWorker.workerId,
            workerUid: currentWorker.uid,
            workerName: currentWorker.fullName,
            siteId,
            qrToken: token,
            qrSessionId: sessionId || `QRSESS_${siteId}`,
            action: requestedAction
          });

          setActionQueued({
            operationId: queuedItem.operationId,
            message: `Network dropped during attendance submission. Operation safely saved to local queue for automatic sync.`,
            timestamp: nowIstStr
          });
          return;
        }
        throw networkOrApiErr;
      }

      // 5. Refresh real attendance state from Firestore
      await fetchTodayAttendance();

      if (recordRes.type === 'CHECK_IN') {
        setActionSuccess({
          type: 'CHECK_IN',
          title: recordRes.idempotentReplay ? 'Check-In Replayed (Idempotent Verified)' : 'Checked In Successfully!',
          message: recordRes.idempotentReplay
            ? `Verified idempotent replay for operation ${operationId}. Attendance was previously recorded today.`
            : `Official duty check-in verified and recorded for site ${siteId}.`,
          timestamp: nowIstStr
        });
      } else {
        setActionSuccess({
          type: 'CHECK_OUT',
          title: recordRes.idempotentReplay ? 'Check-Out Replayed (Idempotent Verified)' : 'Checked Out Successfully!',
          message: recordRes.idempotentReplay
            ? `Verified idempotent replay for operation ${operationId}. Shift conclusion was previously recorded today.`
            : `Shift conclusion recorded for site ${siteId}. Duty completed for today.`,
          timestamp: nowIstStr
        });
      }
    } catch (err: any) {
      console.error('[WorkerAttendance] Scan error:', err);
      setActionError(err.message || 'An unexpected error occurred during attendance recording.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Camera Scanning Loop with jsQR
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setCameraActive(true);
        requestAnimationFrame(tickCamera);
      }
    } catch (err: any) {
      console.error('[WorkerAttendance] Camera start failed:', err);
      setCameraError('Camera access denied or unavailable. Please use the Simulator QR input below or upload a QR image.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setCameraActive(false);
  };

  const tickCamera = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
          });

          if (code && code.data) {
            stopCamera();
            submitQrPayload(code.data, actionMode);
            return;
          }
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(tickCamera);
  };

  // Image file QR decoder
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            setRawPayloadInput(code.data);
            submitQrPayload(code.data, actionMode);
          } else {
            setActionError('No valid QR code could be detected in the uploaded image.');
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Simulator helper: Quick preset loader
  const loadPreset = (presetType: 'ACTIVE' | 'WRONG_SITE' | 'EXPIRED' | 'TAMPERED') => {
    setActionError(null);
    setActionSuccess(null);

    if (presetType === 'ACTIVE') {
      if (activeKioskSession && activeKioskSession.siteId === effectiveWorkerSite) {
        setRawPayloadInput(
          JSON.stringify(
            {
              siteId: activeKioskSession.siteId,
              sessionId: activeKioskSession.sessionId,
              token: activeKioskSession.token
            },
            null,
            2
          )
        );
        setActionError(null);
      } else if (activeKioskSession && activeKioskSession.siteId !== effectiveWorkerSite) {
        setActionError(
          `Kiosk QR currently in simulator memory is for ${activeKioskSession.siteId}, but your assigned site is ${effectiveWorkerSite}. Open Screen 11 as Admin to generate QR for ${effectiveWorkerSite}, or use Wrong Site preset to test rejection.`
        );
      } else {
        setActionError(
          `No active kiosk QR session found in simulator memory. Please open Screen 11 (Site Attendance Kiosk) as Admin for ${effectiveWorkerSite} to generate the live 30s QR session, or paste the QR JSON directly.`
        );
      }
    } else if (presetType === 'WRONG_SITE') {
      const otherSite = effectiveWorkerSite === 'SITE-102' ? 'SITE-101' : 'SITE-102';
      setRawPayloadInput(
        JSON.stringify(
          {
            siteId: otherSite,
            sessionId: `QRSESS_${otherSite}_SIM`,
            token: '8ade72252a47ed42ec2c9bce6aa70152fdd46bb04bdd7cd9479a147fbc13f983'
          },
          null,
          2
        )
      );
    } else if (presetType === 'EXPIRED') {
      setRawPayloadInput(
        JSON.stringify(
          {
            siteId: effectiveWorkerSite,
            sessionId: `QRSESS_${effectiveWorkerSite}_EXPIRED`,
            token: '0000000000000000000000000000000000000000000000000000000000000000'
          },
          null,
          2
        )
      );
    } else if (presetType === 'TAMPERED') {
      setRawPayloadInput(
        JSON.stringify(
          {
            siteId: effectiveWorkerSite,
            sessionId: `QRSESS_${effectiveWorkerSite}_TAMPERED`,
            token: 'fake_tampered_token_not_signed_by_hmac_secret'
          },
          null,
          2
        )
      );
    }
  };

  // Helper to fetch live token for the worker's assigned site
  const fetchLiveSiteToken = async () => {
    if (!effectiveWorkerSite) {
      setActionError('Please log in as an active civil worker to fetch your site QR.');
      return;
    }

    // If an active session for the worker's site already exists in simulator memory, use it directly
    if (activeKioskSession && activeKioskSession.siteId === effectiveWorkerSite) {
      setRawPayloadInput(
        JSON.stringify(
          {
            siteId: activeKioskSession.siteId,
            sessionId: activeKioskSession.sessionId,
            token: activeKioskSession.token
          },
          null,
          2
        )
      );
      setActionSuccess(`Loaded active ${effectiveWorkerSite} QR session from kiosk memory.`);
      setActionError(null);
      return;
    }

    setIsProcessing(true);
    setActionError(null);
    try {
      const session = await FirebaseService.fetchServerActiveQr(effectiveWorkerSite);
      setRawPayloadInput(
        JSON.stringify(
          {
            siteId: session.siteId,
            sessionId: session.sessionId,
            token: session.token
          },
          null,
          2
        )
      );
      setActionSuccess(`Loaded active ${effectiveWorkerSite} QR session from server.`);
    } catch (err: any) {
      const isAuthDenied = err.message?.includes('403') || err.message?.includes('ADMIN') || err.message?.includes('denied');
      if (isAuthDenied) {
        setActionError(
          `Generating a site QR requires an Admin kiosk. In this simulator, switch to Admin, open Screen 11 (Site Attendance Kiosk) for ${effectiveWorkerSite} to start the live session, then return here, or paste the QR payload JSON directly.`
        );
      } else {
        setActionError(`Could not auto-fetch kiosk QR for ${effectiveWorkerSite}: ${err.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#090A0F] text-zinc-100">
      {/* Top Navigation Bar matching Civil Workforce Mobile System */}
      <div className="bg-[#0E1118] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-[#1E232E]">
        <div className="flex items-center gap-2.5">
          <button
            id="worker-attendance-back-btn"
            onClick={onBack}
            className="w-8 h-8 rounded-lg bg-[#161A24] hover:bg-[#202534] border border-[#252C3D] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">Field Operations</span>
            <h3 className="font-bold text-sm text-zinc-100 tracking-wide flex items-center gap-1.5">
              <span>Site Attendance QR</span>
              <span className="bg-emerald-500/10 text-emerald-400 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">
                Phase 3 Sync
              </span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            id="worker-attendance-queue-btn"
            onClick={() => setShowQueueDrawer(!showQueueDrawer)}
            className="p-1.5 px-2 bg-[#161A24] hover:bg-[#202534] border border-[#252C3D] rounded-lg text-zinc-200 transition-colors flex items-center gap-1.5 text-xs font-mono font-bold cursor-pointer"
            title="Toggle Offline Queue Drawer"
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Queue</span>
            {queueItems.length > 0 && (
              <span className="bg-amber-500 text-zinc-950 font-black text-[10px] px-1.5 py-0.2 rounded-full">
                {queueItems.length}
              </span>
            )}
          </button>

          <button
            id="worker-attendance-refresh-btn"
            onClick={fetchTodayAttendance}
            disabled={isLoadingRecord}
            className="p-1.5 rounded-lg bg-[#161A24] hover:bg-[#202534] border border-[#252C3D] text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Today's Attendance State"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRecord ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Network Connectivity & Offline Mode Status Bar */}
      <div className="bg-[#11141C] border-b border-[#1E232E] px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 font-mono">
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span>ONLINE</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700/60 animate-pulse font-mono">
              <WifiOff className="w-3 h-3 text-amber-400" />
              <span>OFFLINE {isSimulatedOffline ? '(SIMULATED)' : '(DISCONNECTED)'}</span>
            </span>
          )}

          <span className="text-[11px] text-zinc-400 font-mono">
            {queueItems.filter(i => i.queueStatus === 'PENDING' || i.queueStatus === 'FAILED_RETRYABLE').length} pending sync
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="toggle-offline-simulation-btn"
            onClick={() => {
              const next = !isSimulatedOffline;
              attendanceQueueService.setSimulatedOffline(next);
              setIsSimulatedOffline(next);
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-all cursor-pointer ${
              isSimulatedOffline
                ? 'bg-amber-500 text-zinc-950 border-amber-400 font-bold'
                : 'bg-[#161A24] hover:bg-[#202534] text-zinc-300 border-[#252C3D]'
            }`}
          >
            {isSimulatedOffline ? 'Resume Online' : 'Simulate Offline'}
          </button>

          {isOnline && queueItems.some(i => i.queueStatus === 'PENDING' || i.queueStatus === 'FAILED_RETRYABLE') && (
            <button
              id="sync-queue-now-btn"
              onClick={async () => {
                setIsSyncingQueue(true);
                await attendanceQueueService.triggerSync();
                setIsSyncingQueue(false);
              }}
              disabled={isSyncingQueue}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingQueue ? 'animate-spin' : ''}`} />
              <span>Sync Now</span>
            </button>
          )}
        </div>
      </div>

      {/* Offline Queue Drawer / Inspection Panel */}
      {showQueueDrawer && (
        <div className="bg-[#0E1118] border-b border-[#1E232E] px-4 py-3 shadow-inner animate-in slide-in-from-top-2 duration-150 text-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 font-bold text-zinc-200">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Local Durable Queue (Phase 3 Persistence)</span>
            </div>
            <div className="flex items-center gap-2">
              {queueItems.some(i => i.queueStatus === 'SYNCED') && (
                <button
                  onClick={() => attendanceQueueService.clearSynced()}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Synced</span>
                </button>
              )}
              <button
                onClick={() => setShowQueueDrawer(false)}
                className="text-zinc-400 hover:text-white text-xs font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {queueItems.length === 0 ? (
            <div className="py-4 text-center text-zinc-500 text-xs">
              Queue is empty. No offline attendance records waiting.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {queueItems.map((item) => (
                <div
                  key={item.operationId}
                  className={`p-2.5 rounded-lg border text-[11px] ${
                    item.queueStatus === 'SYNCED'
                      ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                      : item.queueStatus === 'SYNCING'
                      ? 'bg-sky-950/20 border-sky-800/40 text-sky-200'
                      : item.queueStatus === 'FAILED_PERMANENT'
                      ? 'bg-red-950/20 border-red-800/40 text-red-200'
                      : item.queueStatus === 'FAILED_RETRYABLE'
                      ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                      : 'bg-[#161A24] border-[#252C3D] text-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] truncate max-w-[200px]" title={item.operationId}>
                      {item.operationId}
                    </span>
                    <span
                      className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded uppercase ${
                        item.queueStatus === 'SYNCED'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : item.queueStatus === 'SYNCING'
                          ? 'bg-sky-500/20 text-sky-300 animate-pulse'
                          : item.queueStatus === 'FAILED_PERMANENT'
                          ? 'bg-red-500/20 text-red-300'
                          : item.queueStatus === 'FAILED_RETRYABLE'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-[#202534] text-zinc-300'
                      }`}
                    >
                      {item.queueStatus}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400">
                    <span>Site: <strong className="text-zinc-200">{item.siteId}</strong> ({item.action})</span>
                    <span className="font-mono">Retries: {item.retryCount}</span>
                  </div>

                  {item.errorMessage && (
                    <p className="mt-1 text-[10px] text-red-300 font-sans italic">
                      Error: {item.errorMessage}
                    </p>
                  )}

                  {item.syncedAttendanceId && (
                    <p className="mt-1 text-[10px] text-emerald-300 font-mono">
                      Synced ID: {item.syncedAttendanceId}
                    </p>
                  )}

                  {(item.queueStatus === 'FAILED_RETRYABLE' || item.queueStatus === 'FAILED_PERMANENT') && (
                    <div className="mt-1.5 pt-1 border-t border-[#1E232E] flex justify-end">
                      <button
                        onClick={() => attendanceQueueService.retryOperation(item.operationId)}
                        className="px-2 py-0.5 bg-[#202534] hover:bg-[#2A3245] border border-[#2D364A] rounded text-[10px] text-zinc-200 flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Force Retry</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* Unauthenticated / Profile Warning */}
        {!currentWorker && (
          <div className="p-4 bg-amber-950/30 border border-amber-800/50 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Please log in as an ACTIVE civil worker to record attendance.</span>
            </div>
            <button
              onClick={onNavigateToLogin}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded font-bold text-[11px] shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <LogIn className="w-3 h-3" />
              <span>Login</span>
            </button>
          </div>
        )}

        {/* Worker Profile Card */}
        {currentWorker && (
          <div className="p-4 rounded-xl border shadow-sm bg-[#11141C] border-[#202534]">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs">
                  {currentWorker.fullName.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-zinc-100 leading-tight">
                    {currentWorker.fullName}
                  </h4>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    ID: {currentWorker.workerId} • {currentWorker.jobRole}
                  </p>
                </div>
              </div>

              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase border ${
                  currentWorker.status === 'ACTIVE'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'
                }`}
              >
                {currentWorker.status}
              </span>
            </div>

            <div className="pt-2 border-t border-[#1E232E] flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Assigned Site:</span>
                <strong className="font-semibold text-zinc-200 font-mono">{effectiveWorkerSite}</strong>
              </span>
              <span className="text-[10px] text-zinc-500 truncate max-w-[160px]">
                {assignedSiteObj?.siteName || 'Civil Construction'}
              </span>
            </div>
          </div>
        )}

        {/* Today's Official Attendance Status Card */}
        <div className="p-4 rounded-xl border shadow-sm bg-[#11141C] border-[#202534]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Today's Attendance ({getTodayIstString()})</span>
            </span>
            <button
              onClick={fetchTodayAttendance}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
            >
              Sync Firestore
            </button>
          </div>

          {isLoadingRecord ? (
            <div className="py-6 flex flex-col items-center justify-center text-zinc-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mb-1.5 text-amber-400" />
              <span>Verifying Firestore attendance record...</span>
            </div>
          ) : !todayAttendance ? (
            <div className="p-4 bg-[#161A24] rounded-xl border border-dashed border-[#2A3346] text-center">
              <div className="w-10 h-10 rounded-xl bg-[#202534] flex items-center justify-center mx-auto mb-2 text-zinc-400">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-zinc-200">Not Checked In Today</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Scan the active site QR code below to record your official Check-In.
              </p>
            </div>
          ) : todayAttendance.status === 'CHECKED_IN' ? (
            <div className="p-4 bg-emerald-950/20 rounded-xl border border-emerald-500/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-bold text-xs text-emerald-300">
                    Checked In (On Duty)
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-bold border border-emerald-500/30">
                  {todayAttendance.siteId}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-emerald-500/20 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-400 block font-mono">Check-In Time:</span>
                  <span className="font-bold text-zinc-200 font-mono">
                    {formatIstDateTime(todayAttendance.checkInTime)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block font-mono">Check-Out Time:</span>
                  <span className="text-zinc-500 italic">Pending Check-Out</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[#161A24] rounded-xl border border-[#202534]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Shift Completed</span>
                </div>
                <span className="text-[10px] font-mono bg-[#202534] text-zinc-300 px-2 py-0.5 rounded font-bold border border-[#252C3D]">
                  {todayAttendance.siteId}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-[#1E232E] text-xs">
                <div>
                  <span className="text-[10px] text-zinc-400 block font-mono">Check-In:</span>
                  <span className="font-bold text-zinc-200 font-mono">
                    {formatIstDateTime(todayAttendance.checkInTime)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block font-mono">Check-Out:</span>
                  <span className="font-bold text-zinc-200 font-mono">
                    {formatIstDateTime(todayAttendance.checkOutTime)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Offline Queued Alert Banner */}
        {actionQueued && (
          <div className="p-4 bg-amber-950/30 border border-amber-800/50 rounded-xl flex items-start gap-3 text-xs text-amber-200 shadow-sm animate-in fade-in duration-200">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm text-amber-200">Attendance Queued Locally (Offline)</p>
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-bold border border-amber-500/40">
                  STORED OFFLINE
                </span>
              </div>
              <p className="text-[11px] mt-1 text-amber-300/90 leading-relaxed">
                {actionQueued.message}
              </p>
              <div className="mt-2.5 pt-2 border-t border-amber-800/40 text-[10px] font-mono text-amber-400 flex flex-wrap items-center gap-2">
                <span>OpID: {actionQueued.operationId}</span>
                <span>•</span>
                <span>Queued At: {actionQueued.timestamp} (IST)</span>
                <span>•</span>
                <span className="font-semibold text-amber-200">Will auto-sync when online</span>
              </div>
            </div>
          </div>
        )}

        {/* Success Alert Banner */}
        {actionSuccess && (
          <div className="p-4 bg-emerald-950/30 border border-emerald-800/50 rounded-xl flex items-start gap-3 text-xs text-emerald-200 shadow-sm animate-in fade-in duration-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-sm text-emerald-200">{actionSuccess.title}</p>
              <p className="text-[11px] mt-0.5 text-emerald-300/90">{actionSuccess.message}</p>
              <div className="mt-2 text-[10px] font-mono text-emerald-400 flex items-center gap-2">
                <span>Recorded at: {actionSuccess.timestamp} (IST)</span>
                <span>•</span>
                <span>Firestore Synced</span>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert Banner */}
        {actionError && (
          <div className="p-4 bg-red-950/30 border border-red-800/50 rounded-xl flex items-start gap-3 text-xs text-red-200 shadow-sm animate-in fade-in duration-200">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-sm text-red-200">Attendance Action Rejected</p>
              <p className="text-[11px] mt-0.5 text-red-300/90 whitespace-pre-line">{actionError}</p>
            </div>
          </div>
        )}

        {/* Action Mode Selector */}
        <div className="p-4 rounded-xl border shadow-sm bg-[#11141C] border-[#202534]">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Attendance Action Mode</span>
            </label>
            <span className="text-[10px] font-mono text-zinc-400">Target Action</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              id="mode-auto"
              onClick={() => setActionMode('AUTO')}
              className={`py-2 px-2.5 rounded-lg text-xs font-bold text-center border transition-all cursor-pointer ${
                actionMode === 'AUTO'
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-xs'
                  : 'bg-[#161A24] text-zinc-300 border-[#252C3D] hover:bg-[#202534]'
              }`}
            >
              Smart Auto
            </button>
            <button
              id="mode-checkin"
              onClick={() => setActionMode('CHECK_IN')}
              className={`py-2 px-2.5 rounded-lg text-xs font-bold text-center border transition-all cursor-pointer ${
                actionMode === 'CHECK_IN'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                  : 'bg-[#161A24] text-zinc-300 border-[#252C3D] hover:bg-[#202534]'
              }`}
            >
              Check-In
            </button>
            <button
              id="mode-checkout"
              onClick={() => setActionMode('CHECK_OUT')}
              className={`py-2 px-2.5 rounded-lg text-xs font-bold text-center border transition-all cursor-pointer ${
                actionMode === 'CHECK_OUT'
                  ? 'bg-sky-600 text-white border-sky-500 shadow-xs'
                  : 'bg-[#161A24] text-zinc-300 border-[#252C3D] hover:bg-[#202534]'
              }`}
            >
              Check-Out
            </button>
          </div>

          <p className="text-[10px] text-zinc-400 mt-2">
            {actionMode === 'AUTO' && 'Automatically checks in if not started, or checks out if checked in.'}
            {actionMode === 'CHECK_IN' && 'Forces Check-In. If already checked in today, duplicate rejection will be enforced.'}
            {actionMode === 'CHECK_OUT' && 'Forces Check-Out. Requires an existing check-in today to complete.'}
          </p>
        </div>

        {/* Input Method Tabs: Simulator Payload vs Live Camera */}
        <div className="p-4 rounded-xl border shadow-sm bg-[#11141C] border-[#202534]">
          <div className="flex border-b border-[#1E232E] mb-4">
            <button
              id="tab-simulator"
              onClick={() => {
                setActiveTab('simulator');
                stopCamera();
              }}
              className={`flex-1 pb-2.5 text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'simulator'
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Simulator QR Input</span>
            </button>
            <button
              id="tab-camera"
              onClick={() => {
                setActiveTab('camera');
                startCamera();
              }}
              className={`flex-1 pb-2.5 text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'camera'
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Webcam / Scanner</span>
            </button>
          </div>

          {activeTab === 'simulator' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">
                  QR Payload Data (JSON)
                </span>
                <button
                  onClick={fetchLiveSiteToken}
                  disabled={isProcessing}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>Fetch Active Site QR</span>
                </button>
              </div>

              {/* Quick Preset Buttons for Testing */}
              <div>
                <span className="text-[10px] text-zinc-400 block mb-1.5">Quick Testing Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => loadPreset('ACTIVE')}
                    className="px-2.5 py-1 text-[11px] font-semibold font-mono bg-[#161A24] text-amber-400 border border-amber-500/30 rounded hover:bg-[#202534] cursor-pointer"
                  >
                    Active Kiosk QR
                  </button>
                  <button
                    onClick={() => loadPreset('WRONG_SITE')}
                    className="px-2.5 py-1 text-[11px] font-semibold font-mono bg-[#161A24] text-zinc-300 border border-[#252C3D] rounded hover:bg-[#202534] cursor-pointer"
                  >
                    Wrong Site QR
                  </button>
                  <button
                    onClick={() => loadPreset('EXPIRED')}
                    className="px-2.5 py-1 text-[11px] font-semibold font-mono bg-[#161A24] text-rose-400 border border-rose-500/30 rounded hover:bg-[#202534] cursor-pointer"
                  >
                    Expired Token
                  </button>
                  <button
                    onClick={() => loadPreset('TAMPERED')}
                    className="px-2.5 py-1 text-[11px] font-semibold font-mono bg-[#161A24] text-purple-400 border border-purple-500/30 rounded hover:bg-[#202534] cursor-pointer"
                  >
                    Tampered Token
                  </button>
                </div>
              </div>

              <textarea
                id="raw-qr-payload-input"
                value={rawPayloadInput}
                onChange={(e) => setRawPayloadInput(e.target.value)}
                placeholder="No QR scanned yet. Paste QR payload JSON here (or click 'Active Kiosk QR' / use Camera tab above)..."
                rows={5}
                className="w-full p-2.5 font-mono text-xs rounded-lg border bg-[#090A0F] border-[#252C3D] text-zinc-200 placeholder-zinc-600 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />

              <div className="flex items-center justify-between px-1 text-[11px]">
                {rawPayloadInput.trim() ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Payload loaded in state ({rawPayloadInput.trim().length} chars)</span>
                  </span>
                ) : (
                  <span className="text-amber-400 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Textarea empty — load active QR or paste JSON to enable submission</span>
                  </span>
                )}
                <span className="text-zinc-400 text-[10px]">
                  Assigned Site: <strong className="text-zinc-200 font-mono">{effectiveWorkerSite || 'None'}</strong>
                </span>
              </div>

              <button
                id="submit-qr-scan-btn"
                onClick={() => submitQrPayload(rawPayloadInput, actionMode)}
                disabled={isProcessing || !rawPayloadInput.trim()}
                className="w-full min-h-[44px] py-3.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 rounded-lg font-black text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
                    <span>Verifying HMAC & Recording in Firestore...</span>
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4 text-zinc-950" />
                    <span>
                      {actionMode === 'CHECK_IN'
                        ? 'Submit Check-In Scan'
                        : actionMode === 'CHECK_OUT'
                        ? 'Submit Check-Out Scan'
                        : 'Submit QR Scan (Smart Auto)'}
                    </span>
                  </>
                )}
              </button>

              <div className="p-2.5 bg-[#161A24] border border-[#202534] rounded-lg text-[11px] text-zinc-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-zinc-200">Production Pipeline Guaranteed:</strong> This simulator mechanism passes the real QR payload to the trusted Express HMAC verification endpoint and executes the atomic Firestore transaction with server timestamps.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              {/* Camera Scanner Viewfinder */}
              <div className="relative mx-auto w-full max-w-[280px] h-[240px] bg-black rounded-xl overflow-hidden flex items-center justify-center border border-[#202534] shadow-inner">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Viewfinder Overlay Frame */}
                {cameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-44 h-44 border-2 border-amber-400 rounded-lg animate-pulse" />
                  </div>
                )}

                {!cameraActive && (
                  <div className="p-4 text-white text-xs space-y-2">
                    <Camera className="w-8 h-8 text-zinc-500 mx-auto" />
                    <p className="font-semibold text-zinc-300">Camera is stopped</p>
                    <button
                      onClick={startCamera}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded font-bold text-xs cursor-pointer transition-colors"
                    >
                      Start Camera
                    </button>
                  </div>
                )}
              </div>

              {cameraError && (
                <p className="text-xs text-red-400">{cameraError}</p>
              )}

              {/* Alternative: Upload screenshot of QR */}
              <div className="pt-2 border-t border-[#1E232E] flex flex-col items-center gap-2">
                <span className="text-[11px] text-zinc-400">Or scan from saved image / screenshot:</span>
                <label className="cursor-pointer px-3 py-1.5 bg-[#161A24] hover:bg-[#202534] text-zinc-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-[#252C3D] transition-colors">
                  <Upload className="w-3.5 h-3.5 text-amber-400" />
                  <span>Upload QR Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
