import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  QrCode,
  ShieldCheck,
  Building2,
  Clock,
  CheckCircle2,
  LogIn,
  Copy,
  Users,
  Check
} from 'lucide-react';
import {
  ConstructionSite,
  QrTokenResponse,
  AppUser,
  AttendanceRecord
} from '../types';
import { FirebaseService } from '../services/firebaseService';

interface AdminQrKioskProps {
  sites: ConstructionSite[];
  currentAdmin: AppUser | null;
  initialSiteId?: string;
  onBack: () => void;
  onNavigateToLogin: () => void;
  simTheme?: 'light' | 'dark';
  onActiveSessionUpdate?: (session: QrTokenResponse | null) => void;
}

export const AdminQrKiosk: React.FC<AdminQrKioskProps> = ({
  sites,
  currentAdmin,
  initialSiteId,
  onBack,
  onNavigateToLogin,
  simTheme = 'light',
  onActiveSessionUpdate
}) => {
  /*
   * Select an ACTIVE site when possible.
   *
   * Priority:
   * 1. Explicit initialSiteId if that site is ACTIVE.
   * 2. First ACTIVE site from real Firestore site data.
   * 3. Explicit initialSiteId if no ACTIVE site exists.
   * 4. First available site.
   * 5. Empty string.
   */
  const getInitialSiteId = (): string => {
    if (initialSiteId) {
      const initialSite = sites.find(
        (site) => site.siteId === initialSiteId
      );

      if (initialSite?.status === 'ACTIVE') {
        return initialSite.siteId;
      }
    }

    const activeSite = sites.find(
      (site) => site.status === 'ACTIVE'
    );

    if (activeSite) {
      return activeSite.siteId;
    }

    if (initialSiteId) {
      return initialSiteId;
    }

    return sites[0]?.siteId || '';
  };

  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    getInitialSiteId
  );

  const [activeSession, setActiveSession] =
    useState<QrTokenResponse | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [secondsRemaining, setSecondsRemaining] =
    useState<number>(30);

  const [copiedPayload, setCopiedPayload] =
    useState<boolean>(false);

  // Today's real Firestore attendance state for selected site.
  const [siteAttendance, setSiteAttendance] =
    useState<AttendanceRecord[]>([]);

  const [isLoadingAttendance, setIsLoadingAttendance] =
    useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const onActiveSessionUpdateRef = useRef(onActiveSessionUpdate);

  useEffect(() => {
    onActiveSessionUpdateRef.current = onActiveSessionUpdate;
  }, [onActiveSessionUpdate]);
  /*
   * If the site list arrives asynchronously from Firestore,
   * automatically move to an ACTIVE site.
   *
   * This prevents the kiosk from staying on an inactive
   * default such as SITE-101.
   */
  useEffect(() => {
    if (sites.length === 0) {
      return;
    }

    const currentSite = sites.find(
      (site) => site.siteId === selectedSiteId
    );

    // Current selection is already ACTIVE.
    if (currentSite?.status === 'ACTIVE') {
      return;
    }

    // Prefer the first real ACTIVE site.
    const activeSite = sites.find(
      (site) => site.status === 'ACTIVE'
    );

    if (activeSite) {
      setSelectedSiteId(activeSite.siteId);
    }
  }, [sites, selectedSiteId]);

  // Non-blocking temporary notification auto-dismiss (3000ms)
  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => setErrorMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  useEffect(() => {
    if (!copiedPayload) return;
    const timer = setTimeout(() => setCopiedPayload(false), 3000);
    return () => clearTimeout(timer);
  }, [copiedPayload]);

  /*
   * Get today's date in India Standard Time.
   */
  const getTodayIstString = (): string => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  };

  /*
   * Format Firebase timestamps in IST.
   */
  const formatIstTime = (ts: any): string => {
    if (!ts) {
      return '—';
    }

    let d: Date;

    if (
      ts.toDate &&
      typeof ts.toDate === 'function'
    ) {
      d = ts.toDate();
    } else if (ts.seconds) {
      d = new Date(ts.seconds * 1000);
    } else if (ts instanceof Date) {
      d = ts;
    } else if (
      typeof ts === 'string' ||
      typeof ts === 'number'
    ) {
      d = new Date(ts);
    } else {
      return 'Just now';
    }

    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d);
  };

  /*
   * Fetch real attendance records for the selected site
   * from Firestore.
   */
  const fetchAttendanceRecords = useCallback(
    async (siteIdToFetch: string) => {
      if (!siteIdToFetch) {
        setSiteAttendance([]);
        return;
      }

      setIsLoadingAttendance(true);

      try {
        const todayStr = getTodayIstString();

        const records =
          await FirebaseService.getSiteAttendanceForDate(
            siteIdToFetch,
            todayStr
          );

        setSiteAttendance(records);
      } catch (err: any) {
        console.error(
          '[AdminQrKiosk] Error fetching site attendance:',
          err
        );
      } finally {
        setIsLoadingAttendance(false);
      }
    },
    []
  );

  /*
   * Fetch the trusted server-generated 30-second QR token.
   *
   * IMPORTANT:
   * This function only fetches the session.
   *
   * QR rendering is intentionally NOT performed here because
   * React may not have mounted the canvas yet.
   *
   * The activeSession useEffect below owns QR rendering.
   */
  const fetchToken = useCallback(
    async (siteIdToFetch: string) => {
      if (!siteIdToFetch) {
        setErrorMessage(
          'No construction site is available for QR generation.'
        );
        setActiveSession(null);

        onActiveSessionUpdateRef.current?.(null);

        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const session =
          await FirebaseService.fetchServerActiveQr(
            siteIdToFetch
          );

        setActiveSession(session);

        onActiveSessionUpdateRef.current?.(session);

        /*
         * Compute remaining seconds from the trusted server
         * expiration timestamp.
         */
        const now = Date.now();

        const remaining = Math.max(
          1,
          Math.min(
            30,
            Math.floor(
              (session.expiresAt - now) / 1000
            )
          )
        );

        setSecondsRemaining(remaining);
      } catch (err: any) {
        console.error(
          '[AdminQrKiosk] Error fetching active QR:',
          err
        );

        setErrorMessage(
          err?.message ||
            'Failed to connect to trusted QR server.'
        );

        setActiveSession(null);

        onActiveSessionUpdateRef.current?.(null);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /*
   * Main 30-second auto-refresh loop.
   */
  useEffect(() => {
    if (!selectedSiteId) {
      return;
    }

    /*
     * Initial fetch of QR token and attendance.
     */
    fetchToken(selectedSiteId);
    fetchAttendanceRecords(selectedSiteId);

    /*
     * Refresh countdown every second.
     *
     * When the countdown reaches zero, request a fresh
     * server-generated QR session.
     */
    countdownIntervalRef.current =
      window.setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            fetchToken(selectedSiteId);
            fetchAttendanceRecords(selectedSiteId);

            return 30;
          }

          return prev - 1;
        });
      }, 1000);

    return () => {
      if (countdownIntervalRef.current !== null) {
        window.clearInterval(
          countdownIntervalRef.current
        );

        countdownIntervalRef.current = null;
      }
    };
  }, [
    selectedSiteId,
    fetchToken,
    fetchAttendanceRecords
  ]);

  /*
   * Copy the current real QR payload for the Live App
   * Simulator.
   */
  const handleCopyPayload = () => {
    if (!activeSession) {
      return;
    }

    const payloadStr = JSON.stringify(
      {
        siteId: activeSession.siteId,
        sessionId: activeSession.sessionId,
        token: activeSession.token
      },
      null,
      2
    );

    navigator.clipboard
      .writeText(payloadStr)
      .catch(() => {});

    setCopiedPayload(true);

    window.setTimeout(() => {
      setCopiedPayload(false);
    }, 2500);
  };

  /*
   * Render the QR only after:
   *
   * 1. React has mounted the canvas.
   * 2. activeSession exists.
   *
   * This removes the canvas-rendering race condition.
   *
   * Every time the trusted server rotates the session,
   * activeSession changes and the QR is redrawn.
   */
  useEffect(() => {
    if (!activeSession) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const payload = JSON.stringify({
      siteId: activeSession.siteId,
      sessionId: activeSession.sessionId,
      token: activeSession.token
    });

    QRCode.toCanvas(
      canvas,
      payload,
      {
        width: 256,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      }
    ).catch((err) => {
      console.error(
        '[AdminQrKiosk] QR canvas rendering failed:',
        err
      );
    });
  }, [activeSession]);

  const selectedSite = sites.find(
    (s) => s.siteId === selectedSiteId
  );

  return (
    <div
      className={`flex-1 flex flex-col overflow-y-auto ${
        simTheme === 'dark'
          ? 'bg-slate-950 text-slate-100'
          : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Top Bar */}
      <div className="bg-slate-950 text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-slate-800 shadow-sm">
        <div className="flex items-center gap-2.5">
          <button
            id="admin-qr-kiosk-back-btn"
            onClick={onBack}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Back to Admin Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">Kiosk Operations</span>
            <h3 className="font-black text-sm text-white tracking-wide flex items-center gap-1.5">
              <span>Site Attendance Kiosk</span>
              <span className="bg-amber-500/20 text-amber-400 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-amber-500/30">
                Phase 2 Live
              </span>
            </h3>
          </div>
        </div>

        <button
          id="admin-qr-kiosk-refresh-btn"
          onClick={() => fetchToken(selectedSiteId)}
          disabled={isLoading || !selectedSiteId}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          title="Force Refresh Server QR"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              isLoading
                ? 'animate-spin text-amber-400'
                : ''
            }`}
          />
        </button>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* Site Selector Card */}
        <div
          className={`p-4 rounded-xl border shadow-sm ${
            simTheme === 'dark'
              ? 'bg-slate-900 border-slate-800'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-500" />
              <span>Select Construction Site</span>
            </h4>

            <span className="text-[10px] text-slate-400 font-medium">
              {sites.length}{' '}
              {sites.length === 1
                ? 'Site'
                : 'Sites'}{' '}
              Available
            </span>
          </div>

          {sites.length === 0 ? (
            <div className="flex gap-2">
              {['SITE-101', 'SITE-102'].map(
                (fallbackSite) => (
                  <button
                    key={fallbackSite}
                    id={`site-chip-${fallbackSite}`}
                    onClick={() =>
                      setSelectedSiteId(fallbackSite)
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedSiteId === fallbackSite
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : simTheme === 'dark'
                        ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {fallbackSite}
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sites.map((site) => {
                const isSelected =
                  selectedSiteId === site.siteId;

                return (
                  <button
                    key={site.siteId}
                    id={`site-chip-${site.siteId}`}
                    onClick={() =>
                      setSelectedSiteId(site.siteId)
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-black shadow-sm ring-2 ring-amber-400/50'
                        : simTheme === 'dark'
                        ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>{site.siteId}</span>

                    {site.status === 'ACTIVE' && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected
                            ? 'bg-emerald-900'
                            : 'bg-emerald-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {selectedSite && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
              <span className="font-semibold truncate">
                {selectedSite.siteName}
              </span>

              <span className="text-[10px] text-slate-400 shrink-0">
                {selectedSite.projectName}
              </span>
            </div>
          )}
        </div>

        {/* Auth Warning */}
        {!currentAdmin && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />

              <span>
                Sign in with Admin credentials to
                authorize server QR generation.
              </span>
            </div>

            <button
              onClick={onNavigateToLogin}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[11px] shrink-0 flex items-center gap-1"
            >
              <LogIn className="w-3 h-3" />
              <span>Login</span>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />

            <div className="flex-1">
              <p className="font-semibold">
                Server QR Error
              </p>

              <p className="text-[11px] mt-0.5 opacity-90">
                {errorMessage}
              </p>
            </div>

            <button
              onClick={() =>
                fetchToken(selectedSiteId)
              }
              className="text-[11px] font-bold text-red-700 dark:text-red-300 hover:underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Live QR Kiosk Display Card */}
        <div
          className={`p-6 rounded-2xl border text-center shadow-md relative overflow-hidden ${
            simTheme === 'dark'
              ? 'bg-slate-900 border-slate-800'
              : 'bg-white border-slate-200'
          }`}
        >
          {/* Header Info */}
          <div className="mb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-mono font-bold border border-amber-500/30 mb-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />

              <span>
                Server-Authoritative Kiosk
              </span>
            </div>

            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              Site: {selectedSiteId || '—'}
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Point civil worker mobile scanner at
              this live rotating code
            </p>
          </div>

          {/* QR Canvas Box */}
          <div className="my-3 flex justify-center">
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-inner inline-block relative min-w-[280px] min-h-[280px] flex items-center justify-center">
              <canvas
                ref={canvasRef}
                className={`w-[250px] h-[250px] block transition-opacity duration-300 ${
                  isLoading
                    ? 'opacity-30'
                    : 'opacity-100'
                }`}
              />

              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 backdrop-blur-xs rounded-2xl">
                  <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mb-2" />

                  <span className="text-xs font-bold text-slate-700">
                    Rotating Server QR...
                  </span>
                </div>
              )}

              {!activeSession &&
                !isLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                    <QrCode className="w-12 h-12 text-slate-300 mb-2" />

                    <p className="text-xs font-semibold text-slate-500">
                      Connecting to Server...
                    </p>

                    <button
                      onClick={() =>
                        fetchToken(selectedSiteId)
                      }
                      className="mt-2 text-xs text-amber-500 hover:text-amber-400 font-mono font-bold hover:underline"
                    >
                      Generate Token
                    </button>
                  </div>
                )}
            </div>
          </div>

          {/* 30-Second Countdown Timer */}
          <div className="mt-4 space-y-2">
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
              <div
                className={`h-full transition-all duration-1000 ${
                  secondsRemaining <= 5
                    ? 'bg-rose-500'
                    : secondsRemaining <= 10
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{
                  width: `${
                    (secondsRemaining / 30) * 100
                  }%`
                }}
              />
            </div>

            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1 text-slate-500">
                <Clock className="w-3.5 h-3.5" />

                <span>
                  Auto-Refresh Window
                </span>
              </span>

              <span
                className={
                  secondsRemaining <= 5
                    ? 'text-red-600 animate-pulse'
                    : 'text-slate-800 dark:text-slate-200'
                }
              >
                Rotating in {secondsRemaining}s
              </span>
            </div>
          </div>

          {/* Technical Security Footprint */}
          {activeSession && (
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-left space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">
                  Session ID:
                </span>

                <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-[10px] truncate max-w-[200px]">
                  {activeSession.sessionId}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">
                  HMAC-SHA256 Token:
                </span>

                <span className="font-mono text-amber-500 dark:text-amber-400 text-[10px]">
                  {activeSession.token.slice(0, 16)}
                  ...
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">
                  Firestore Synced:
                </span>

                <span className="text-emerald-600 font-semibold flex items-center gap-1 text-[10px]">
                  <CheckCircle2 className="w-3 h-3" />

                  <span>
                    /activeQrSessions/
                    {selectedSiteId}
                  </span>
                </span>
              </div>

              {/* Simulator Copy Payload Action */}
              <div className="pt-2">
                <button
                  id="admin-copy-payload-btn"
                  onClick={handleCopyPayload}
                  className="w-full min-h-[44px] py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 dark:text-amber-400 rounded-lg text-xs font-mono font-bold uppercase tracking-wider border border-amber-500/30 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {copiedPayload ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span>Copied QR Payload to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-amber-500" />
                      <span>Copy Rotating QR Payload (For Mobile Scan)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Today's Real Attendance Records */}
        <div
          className={`p-4 rounded-2xl border shadow-sm ${
            simTheme === 'dark'
              ? 'bg-slate-900 border-slate-800'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500" />

              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Today's Site Attendance (
                {getTodayIstString()})
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                {siteAttendance.length}{' '}
                {siteAttendance.length === 1
                  ? 'Record'
                  : 'Records'}
              </span>

              <button
                id="admin-refresh-attendance-btn"
                onClick={() =>
                  fetchAttendanceRecords(
                    selectedSiteId
                  )
                }
                disabled={isLoadingAttendance}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 transition-colors"
                title="Refresh Attendance Records"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isLoadingAttendance
                      ? 'animate-spin text-amber-500'
                      : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {isLoadingAttendance ? (
            <div className="py-6 flex flex-col items-center justify-center text-slate-400 text-xs">
              <RefreshCw className="w-4 h-4 animate-spin mb-1 text-amber-500" />

              <span>
                Querying Firestore attendance
                records...
              </span>
            </div>
          ) : siteAttendance.length === 0 ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-center">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                No attendance recorded for{' '}
                {selectedSiteId} today.
              </p>

              <p className="text-[10px] text-slate-400 mt-0.5">
                Workers assigned to this site
                will appear here immediately
                upon scanning the active QR code.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {siteAttendance.map((rec) => (
                <div
                  key={rec.attendanceId}
                  className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {rec.workerName}
                      </span>

                      <span className="text-[10px] font-mono text-slate-400">
                        ({rec.workerId})
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        In:{' '}
                        <strong className="text-slate-700 dark:text-slate-300 font-mono">
                          {formatIstTime(
                            rec.checkInTime
                          )}
                        </strong>
                      </span>

                      <span>
                        Out:{' '}
                        <strong className="text-slate-700 dark:text-slate-300 font-mono">
                          {formatIstTime(
                            rec.checkOutTime
                          )}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase border ${
                      rec.status === 'COMPLETED'
                        ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                    }`}
                  >
                    {rec.status === 'COMPLETED'
                      ? 'Completed'
                      : 'Checked In'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Phase 2 Security Information */}
        <div
          className={`p-3.5 rounded-xl border text-xs text-slate-500 space-y-1.5 ${
            simTheme === 'dark'
              ? 'bg-slate-900/50 border-slate-800'
              : 'bg-slate-100 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />

            <span>
              Anti-Proxy Security Guaranteed
            </span>
          </div>

          <p className="text-[11px] leading-relaxed">
            This QR code contains a time-slotted
            cryptographic HMAC token generated
            exclusively by the trusted backend
            server. Static photos or shared
            screenshots become invalid within 30
            seconds.
          </p>
        </div>
      </div>
    </div>
  );
};