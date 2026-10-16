import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Clock,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Building2,
  DollarSign,
  Briefcase
} from 'lucide-react';
import { WorkerRecord, ConstructionSite, OvertimeRecord } from '../types';
import { FirebaseService } from '../services/firebaseService';
import { formatINR } from '../utils/currency';

interface WorkerOvertimeProps {
  currentWorker: WorkerRecord | null;
  sites: ConstructionSite[];
  onBack: () => void;
  simTheme?: 'light' | 'dark';
  onNavigateToLogin: () => void;
}

export const WorkerOvertime: React.FC<WorkerOvertimeProps> = ({
  currentWorker,
  sites,
  onBack,
  simTheme = 'light',
  onNavigateToLogin
}) => {
  const [overtimeList, setOvertimeList] = useState<OvertimeRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLogModal, setShowLogModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form State
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [date, setDate] = useState<string>(todayStr);
  const [hours, setHours] = useState<string>('2');
  const [siteId, setSiteId] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const loadOvertime = async () => {
    if (!currentWorker?.workerId) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await FirebaseService.getWorkerOvertime(currentWorker.workerId);
      setOvertimeList(data);
    } catch (err: any) {
      console.error('[WorkerOvertime] load error:', err);
      setError(FirebaseService.parseError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentWorker?.workerId) {
      setSiteId(currentWorker.siteId || (currentWorker as any).assignedSiteId || (sites[0]?.siteId || 'SITE-101'));
      loadOvertime();
    } else {
      setIsLoading(false);
    }
  }, [currentWorker?.workerId]);

  // Non-blocking temporary notification auto-dismiss (3000ms)
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleRecordOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorker) {
      onNavigateToLogin();
      return;
    }

    const numHours = parseFloat(hours);
    if (isNaN(numHours) || numHours <= 0) {
      setError('Overtime hours must be a positive number greater than 0.');
      return;
    }
    if (numHours > 24) {
      setError('Overtime hours cannot exceed 24 in a single day.');
      return;
    }
    if (!date) {
      setError('Please select a valid date.');
      return;
    }
    if (!reason.trim()) {
      setError('Please provide a description of overtime tasks executed.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await FirebaseService.recordOvertime({
        workerId: currentWorker.workerId,
        date,
        hours: numHours,
        siteId: siteId || currentWorker.siteId || 'SITE-101',
        reason: reason.trim()
      });
      setNotice('Overtime log submitted for administrative approval.');
      setShowLogModal(false);
      setReason('');
      await loadOvertime();
    } catch (err: any) {
      setError(FirebaseService.parseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentWorker) {
    return (
      <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
        <div className="bg-[#0E1118] text-white p-4 flex items-center gap-3 sticky top-0 z-20 border-b border-[#1E232E]">
          <button onClick={onBack} className="p-1 hover:bg-[#161A24] rounded text-zinc-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h3 className="font-bold text-base">Overtime Portal</h3>
        </div>
        <div className="p-8 text-center m-auto max-w-sm">
          <Clock className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-bold text-white">Worker Session Required</p>
          <p className="text-xs text-zinc-400 mt-1 mb-4">Please log in with your registered Worker ID to log and track overtime.</p>
          <button
            onClick={onNavigateToLogin}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm cursor-pointer"
          >
            Sign In as Worker
          </button>
        </div>
      </div>
    );
  }

  const approvedList = overtimeList.filter((ot) => ot.status === 'APPROVED');
  const pendingList = overtimeList.filter((ot) => ot.status === 'PENDING');
  const totalApprovedHours = approvedList.reduce((acc, ot) => acc + (ot.hours || 0), 0);
  const totalEstimatedEarnings = approvedList.reduce((acc, ot) => acc + (ot.calculatedAmount || 0), 0);

  return (
    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
      {/* Header */}
      <div className="bg-[#0E1118] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-[#1E232E] shadow-sm">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg bg-[#161A24] hover:bg-[#202534] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-[#262D3D]"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">Field Operations</span>
            <h3 className="font-black text-sm text-white tracking-wide">Overtime Tracking</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
            {currentWorker.workerId}
          </span>
          <button
            id="worker-refresh-ot-btn"
            onClick={loadOvertime}
            className="p-1.5 rounded-lg bg-[#161A24] hover:bg-[#202534] text-zinc-300 hover:text-white transition-colors cursor-pointer border border-[#262D3D]"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Alerts */}
        {error && (
          <div className="p-3 bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs rounded-xl flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-400 font-bold ml-2">×</button>
          </div>
        )}
        {notice && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-800/80 text-emerald-200 text-xs rounded-xl flex items-center justify-between">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="text-emerald-400 font-bold ml-2">×</button>
          </div>
        )}

        {/* Overtime Metric Highlights */}
        <div className="bg-[#11141C] rounded-xl border border-[#202534] p-3.5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">Overtime Summary</span>
            <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
              1.5X PREMIUM RATE
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 bg-[#090A0F] border border-[#1E232E] rounded-lg">
              <span className="text-[10px] text-zinc-400 block font-medium uppercase font-mono">Approved</span>
              <span className="text-lg font-black text-white font-mono">{totalApprovedHours}h</span>
            </div>
            <div className="p-2.5 bg-[#090A0F] border border-[#1E232E] rounded-lg">
              <span className="text-[10px] text-amber-400 block font-medium uppercase font-mono">Pending</span>
              <span className="text-lg font-black text-amber-400 font-mono">{pendingList.length}</span>
            </div>
            <div className="p-2.5 bg-[#090A0F] border border-emerald-900/50 rounded-lg">
              <span className="text-[10px] text-emerald-400 block font-medium uppercase font-mono">OT Earnings</span>
              <span className="text-base font-black text-emerald-300 font-mono">{formatINR(totalEstimatedEarnings)}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#1E232E]">
            <button
              id="worker-log-ot-btn"
              onClick={() => {
                setError(null);
                setNotice(null);
                setShowLogModal(true);
              }}
              className="w-full min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log Extra Shift / Overtime Hours</span>
            </button>
          </div>
        </div>

        {/* Overtime Records History */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">Overtime Shifts History</h4>
            <span className="text-[10px] font-mono text-zinc-500 font-bold">{overtimeList.length} Total</span>
          </div>

          {isLoading ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Loading overtime records from Firestore...</span>
            </div>
          ) : overtimeList.length === 0 ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center">
              <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-zinc-200">No overtime entries recorded</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Extra duty hours logged will appear here once submitted.</p>
            </div>
          ) : (
            overtimeList.map((ot) => {
              const statusColor =
                ot.status === 'APPROVED'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                  : ot.status === 'PENDING'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                  : 'bg-rose-950/80 text-rose-300 border-rose-800/60';

              return (
                <div
                  key={ot.overtimeId}
                  className="p-3.5 bg-[#11141C] rounded-xl border border-[#202534] hover:border-[#2C3345] shadow-xs space-y-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-bold text-xs text-white font-mono">{ot.date}</span>
                      <span className="text-[10px] font-mono text-zinc-500">({ot.overtimeId})</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${statusColor}`}>
                      {ot.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs text-zinc-300 pt-1.5 border-t border-[#1E232E]">
                    <div>
                      <span className="text-[10px] text-zinc-500 block font-mono uppercase">Duration</span>
                      <span className="font-bold text-amber-400 font-mono">{ot.hours} Hours</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block font-mono uppercase">Hourly Rate</span>
                      <span className="font-semibold text-zinc-200 font-mono">{formatINR(ot.hourlyRate || 31.25)}/hr</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block font-mono uppercase">Pay Amount</span>
                      <span className="font-bold text-emerald-400 font-mono">{formatINR(ot.calculatedAmount || 0)}</span>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-400 pt-1.5 border-t border-[#1E232E] space-y-1">
                    <p><strong className="text-zinc-300">Site:</strong> {ot.siteId} · <strong className="text-zinc-300">Task:</strong> {ot.reason}</p>
                    {ot.reviewerNotes && (
                      <p className="text-amber-300/90 bg-[#090A0F] border border-[#1E232E] p-2 rounded">
                        <strong>Supervisor Note:</strong> {ot.reviewerNotes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Log Overtime Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#11141C] rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 border border-[#2A3142]">
            <div className="flex items-center justify-between border-b border-[#1E232E] pb-2.5">
              <h4 className="font-black text-sm text-white">Record Extra Shift / Overtime</h4>
              <span className="font-mono text-xs text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                {currentWorker.workerId}
              </span>
            </div>

            <form onSubmit={handleRecordOvertime} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Date *</label>
                  <input
                    id="ot-date-input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Hours Worked *</label>
                  <input
                    id="ot-hours-input"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="24"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Work Site</label>
                <select
                  id="ot-site-select"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                >
                  {sites.map((s) => (
                    <option key={s.siteId} value={s.siteId}>
                      {s.siteId} - {s.siteName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Tasks Done / Justification *</label>
                <textarea
                  id="ot-reason-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="E.g. Concrete curing, structural beam welding after hours..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  id="submit-ot-confirm-btn"
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" /> : null}
                  <span>Submit Claim</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="min-h-[44px] px-3.5 py-2 border border-[#252C3D] text-zinc-300 hover:text-white text-xs font-bold uppercase rounded-lg hover:bg-[#161A24] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
