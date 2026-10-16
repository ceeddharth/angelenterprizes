import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Building2,
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { OvertimeRecord, WorkerRecord, AdminAccount, ConstructionSite } from '../types';
import { FirebaseService } from '../services/firebaseService';
import { formatINR } from '../utils/currency';

interface AdminOvertimeProps {
  currentAdmin: AdminAccount | null;
  workers: WorkerRecord[];
  sites: ConstructionSite[];
  onBack: () => void;
  simTheme?: 'light' | 'dark';
}

export const AdminOvertime: React.FC<AdminOvertimeProps> = ({
  currentAdmin,
  workers,
  sites,
  onBack,
  simTheme = 'light'
}) => {
  const [overtimeList, setOvertimeList] = useState<OvertimeRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Review Modal State
  const [selectedRecord, setSelectedRecord] = useState<OvertimeRecord | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const loadAllOvertime = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await FirebaseService.getAllOvertime();
      setOvertimeList(data);
    } catch (err: any) {
      console.error('[AdminOvertime] load error:', err);
      setError(FirebaseService.parseError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllOvertime();
  }, []);

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

  const handleUpdateStatus = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedRecord) return;
    try {
      setIsProcessing(true);
      setError(null);
      await FirebaseService.updateOvertimeStatus({
        overtimeId: selectedRecord.overtimeId,
        status,
        reviewerNotes: reviewerNotes.trim() || undefined
      });
      setNotice(`Overtime claim for ${selectedRecord.workerId} marked as ${status}.`);
      setSelectedRecord(null);
      setReviewerNotes('');
      await loadAllOvertime();
    } catch (err: any) {
      setError(FirebaseService.parseError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredList = overtimeList.filter((ot) => {
    const matchStatus = statusFilter === 'ALL' || ot.status === statusFilter;
    const worker = workers.find((w) => w.workerId === ot.workerId);
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      ot.workerId.toLowerCase().includes(q) ||
      ot.siteId.toLowerCase().includes(q) ||
      (worker && worker.fullName.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  const pendingList = overtimeList.filter((ot) => ot.status === 'PENDING');
  const approvedList = overtimeList.filter((ot) => ot.status === 'APPROVED');
  const totalApprovedHours = approvedList.reduce((acc, ot) => acc + (ot.hours || 0), 0);
  const totalLiability = approvedList.reduce((acc, ot) => acc + (ot.calculatedAmount || 0), 0);

  return (
    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
      {/* Header */}
      <div className="bg-[#0E1118] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-[#1E232E] shadow-sm">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg bg-[#161A24] hover:bg-[#202534] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-[#262D3D]"
            title="Back to Command Center"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">Civil Workforce Ops</span>
            <h3 className="font-black text-sm text-white tracking-wide">Overtime & Liability</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            {pendingList.length} PENDING
          </span>
          <button
            id="admin-refresh-ot-btn"
            onClick={loadAllOvertime}
            className="p-1.5 rounded-lg bg-[#161A24] hover:bg-[#202534] text-zinc-300 hover:text-white transition-colors cursor-pointer border border-[#262D3D]"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
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

        {/* Aggregate Liability Metrics */}
        <div className="bg-[#11141C] rounded-xl border border-[#202534] p-3 shadow-xs grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 bg-[#090A0F] border border-[#1E232E] rounded-lg">
            <span className="text-[10px] text-zinc-400 block font-medium uppercase font-mono">Pending Claims</span>
            <span className="text-lg font-black text-amber-400 font-mono">{pendingList.length}</span>
          </div>
          <div className="p-2.5 bg-[#090A0F] border border-[#1E232E] rounded-lg">
            <span className="text-[10px] text-zinc-400 block font-medium uppercase font-mono">Approved Hours</span>
            <span className="text-lg font-black text-white font-mono">{totalApprovedHours}h</span>
          </div>
          <div className="p-2.5 bg-[#090A0F] border border-emerald-900/50 rounded-lg">
            <span className="text-[10px] text-emerald-400 block font-medium uppercase font-mono">OT Liability</span>
            <span className="text-base font-black text-emerald-300 font-mono">{formatINR(totalLiability)}</span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
            <input
              id="admin-ot-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search worker ID, worker name, or site ID..."
              className="w-full pl-9 pr-3 py-2 bg-[#11141C] border border-[#202534] rounded-lg text-xs focus:outline-none focus:border-amber-500 text-white placeholder:text-zinc-500 font-medium"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
              <button
                key={st}
                id={`ot-filter-${st.toLowerCase()}`}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase whitespace-nowrap transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-[#11141C] border border-[#202534] text-zinc-400 hover:text-white hover:bg-[#161A24]'
                }`}
              >
                {st} {st === 'PENDING' && pendingList.length > 0 ? `(${pendingList.length})` : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Overtime List */}
        <div className="space-y-2.5">
          {isLoading ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Fetching overtime entries from Firestore...</span>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center text-xs text-zinc-400">
              No overtime records found matching the criteria.
            </div>
          ) : (
            filteredList.map((ot) => {
              const worker = workers.find((w) => w.workerId === ot.workerId);
              const statusColor =
                ot.status === 'APPROVED'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                  : ot.status === 'PENDING'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                  : 'bg-rose-950/80 text-rose-300 border-rose-800/60';

              return (
                <div
                  key={ot.overtimeId}
                  className="p-3.5 bg-[#11141C] rounded-xl border border-[#202534] hover:border-[#2C3345] shadow-xs space-y-2.5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">
                          {worker?.fullName || 'Worker'}
                        </span>
                        <span className="font-mono text-[10px] text-amber-400 font-bold px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded">
                          {ot.workerId}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        Site: {ot.siteId} · Trade: {worker?.jobRole || 'General Labor'} · Date: {ot.date}
                      </p>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${statusColor}`}>
                      {ot.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs text-zinc-300 pt-2 border-t border-[#1E232E]">
                    <div>
                      <span className="text-[10px] text-zinc-500 block font-medium uppercase font-mono">Hours</span>
                      <span className="font-bold text-amber-400 font-mono">{ot.hours} Hours</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block font-medium uppercase font-mono">Hourly Rate</span>
                      <span className="font-semibold text-zinc-200 font-mono">{formatINR(ot.hourlyRate || 31.25)}/hr</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block font-medium uppercase font-mono">Calculated Cost</span>
                      <span className="font-bold text-emerald-400 font-mono">{formatINR(ot.calculatedAmount || 0)}</span>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-300 bg-[#090A0F] border border-[#1E232E] p-2.5 rounded-lg space-y-1">
                    <p><strong className="text-zinc-400">Work Reason:</strong> {ot.reason}</p>
                    {ot.reviewerNotes && (
                      <p className="mt-1 text-amber-300/90 border-t border-[#1E232E] pt-1">
                        <strong>Reviewer Note:</strong> {ot.reviewerNotes}
                      </p>
                    )}
                  </div>

                  {ot.status === 'PENDING' && (
                    <div className="pt-1 flex gap-2">
                      <button
                        id={`review-ot-${ot.overtimeId}`}
                        onClick={() => {
                          setSelectedRecord(ot);
                          setReviewerNotes('');
                        }}
                        className="flex-1 min-h-[40px] py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black uppercase tracking-wider shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Review & Decide</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Review Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#11141C] rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 border border-[#2A3142]">
            <div className="flex items-center justify-between border-b border-[#1E232E] pb-2.5">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block">Supervisory Action</span>
                <h4 className="font-black text-sm text-white">Review Overtime Claim</h4>
              </div>
              <span className="font-mono text-xs text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                {selectedRecord.workerId}
              </span>
            </div>

            <div className="text-xs space-y-1.5 p-3 bg-[#090A0F] border border-[#1E232E] rounded-lg text-zinc-300">
              <p><strong className="text-zinc-400">Date:</strong> {selectedRecord.date}</p>
              <p><strong className="text-zinc-400">Overtime Hours:</strong> {selectedRecord.hours} Hours</p>
              <p><strong className="text-zinc-400">Calculated Amount:</strong> {formatINR(selectedRecord.calculatedAmount || 0)}</p>
              <p><strong className="text-zinc-400">Tasks Executed:</strong> {selectedRecord.reason}</p>
            </div>

            <div>
              <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Reviewer Note (Optional)</label>
              <input
                id="ot-review-note-input"
                type="text"
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="E.g. Verified by site supervisor..."
                className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                id="admin-confirm-approve-ot-btn"
                disabled={isProcessing}
                onClick={() => handleUpdateStatus('APPROVED')}
                className="flex-1 min-h-[44px] py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Approve OT</span>
              </button>
              <button
                id="admin-confirm-reject-ot-btn"
                disabled={isProcessing}
                onClick={() => handleUpdateStatus('REJECTED')}
                className="flex-1 min-h-[44px] py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                <span>Reject</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="min-h-[44px] px-3.5 py-2 border border-[#252C3D] text-zinc-300 hover:text-white text-xs font-bold uppercase rounded-lg hover:bg-[#161A24] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
