import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Search,
  RefreshCw,
  UserCheck,
  Building2,
  AlertCircle
} from 'lucide-react';
import { LeaveRequest, LeaveStatus, WorkerRecord, AdminAccount } from '../types';
import { FirebaseService } from '../services/firebaseService';

interface AdminLeaveProps {
  currentAdmin: AdminAccount | null;
  workers: WorkerRecord[];
  onBack: () => void;
  simTheme?: 'light' | 'dark';
}

export const AdminLeave: React.FC<AdminLeaveProps> = ({
  currentAdmin,
  workers,
  onBack,
  simTheme = 'light'
}) => {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Review Modal State
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const loadAllLeaves = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await FirebaseService.getAllLeaves();
      setLeaves(data);
    } catch (err: any) {
      console.error('[AdminLeave] load error:', err);
      setError(FirebaseService.parseError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllLeaves();
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
    if (!selectedLeave) return;
    try {
      setIsProcessing(true);
      setError(null);
      await FirebaseService.updateLeaveStatus({
        leaveId: selectedLeave.leaveId,
        status,
        reviewerNotes: reviewerNotes.trim() || undefined
      });
      setNotice(`Leave request for ${selectedLeave.workerId} marked as ${status}.`);
      setSelectedLeave(null);
      setReviewerNotes('');
      await loadAllLeaves();
    } catch (err: any) {
      setError(FirebaseService.parseError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredLeaves = leaves.filter((leave) => {
    const matchStatus = statusFilter === 'ALL' || leave.status === statusFilter;
    const worker = workers.find((w) => w.workerId === leave.workerId);
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      leave.workerId.toLowerCase().includes(q) ||
      leave.leaveType.toLowerCase().includes(q) ||
      (worker && worker.fullName.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  const pendingCount = leaves.filter((l) => l.status === 'PENDING').length;
  const approvedCount = leaves.filter((l) => l.status === 'APPROVED').length;

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
            <h3 className="font-black text-sm text-white tracking-wide">Leave Approvals</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            {pendingCount} PENDING
          </span>
          <button
            id="admin-refresh-leaves-btn"
            onClick={loadAllLeaves}
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

        {/* Search & Filter Bar */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
            <input
              id="admin-leave-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search worker ID, name, or leave type..."
              className="w-full pl-9 pr-3 py-2 bg-[#11141C] border border-[#202534] rounded-lg text-xs focus:outline-none focus:border-amber-500 text-white placeholder:text-zinc-500 font-medium"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                id={`leave-filter-${st.toLowerCase()}`}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase whitespace-nowrap transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-[#11141C] border border-[#202534] text-zinc-400 hover:text-white hover:bg-[#161A24]'
                }`}
              >
                {st} {st === 'PENDING' && pendingCount > 0 ? `(${pendingCount})` : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Requests List */}
        <div className="space-y-2.5">
          {isLoading ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Fetching leave applications from Firestore...</span>
            </div>
          ) : filteredLeaves.length === 0 ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center text-xs text-zinc-400">
              No leave records found matching the criteria.
            </div>
          ) : (
            filteredLeaves.map((leave) => {
              const worker = workers.find((w) => w.workerId === leave.workerId);
              const statusColor =
                leave.status === 'APPROVED'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                  : leave.status === 'PENDING'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                  : leave.status === 'CANCELLED'
                  ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  : 'bg-rose-950/80 text-rose-300 border-rose-800/60';

              return (
                <div
                  key={leave.leaveId}
                  className="p-3.5 bg-[#11141C] rounded-xl border border-[#202534] hover:border-[#2C3345] shadow-xs space-y-2.5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">
                          {worker?.fullName || 'Worker'}
                        </span>
                        <span className="font-mono text-[10px] text-amber-400 font-bold px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded">
                          {leave.workerId}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {worker?.jobRole || 'General Labor'} · Batch {worker?.batchNumber || '—'} · Site: {worker?.siteId || '—'}
                      </p>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${statusColor}`}>
                      {leave.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs text-zinc-300 pt-2 border-t border-[#1E232E]">
                    <div>
                      <span className="text-[10px] text-zinc-500 block font-medium uppercase font-mono">Type</span>
                      <span className="font-bold text-zinc-200">{leave.leaveType}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block font-medium uppercase font-mono">Period</span>
                      <span className="font-semibold text-zinc-200">{leave.startDate} → {leave.endDate}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block font-medium uppercase font-mono">Duration</span>
                      <span className="font-bold text-amber-400">{leave.daysCount} Day(s)</span>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-300 bg-[#090A0F] border border-[#1E232E] p-2.5 rounded-lg space-y-1">
                    <p><strong className="text-zinc-400">Worker Reason:</strong> {leave.reason}</p>
                    {leave.reviewerNotes && (
                      <p className="mt-1 text-amber-300/90 border-t border-[#1E232E] pt-1">
                        <strong>Reviewer Note:</strong> {leave.reviewerNotes}
                      </p>
                    )}
                  </div>

                  {leave.status === 'PENDING' && (
                    <div className="pt-1 flex gap-2">
                      <button
                        id={`approve-leave-${leave.leaveId}`}
                        onClick={() => {
                          setSelectedLeave(leave);
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
      {selectedLeave && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#11141C] rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 border border-[#2A3142]">
            <div className="flex items-center justify-between border-b border-[#1E232E] pb-2.5">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block">Supervisory Action</span>
                <h4 className="font-black text-sm text-white">Review Leave Application</h4>
              </div>
              <span className="font-mono text-xs text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                {selectedLeave.workerId}
              </span>
            </div>

            <div className="text-xs space-y-1.5 p-3 bg-[#090A0F] border border-[#1E232E] rounded-lg text-zinc-300">
              <p><strong className="text-zinc-400">Type:</strong> {selectedLeave.leaveType} Leave</p>
              <p><strong className="text-zinc-400">Duration:</strong> {selectedLeave.startDate} to {selectedLeave.endDate} ({selectedLeave.daysCount} days)</p>
              <p><strong className="text-zinc-400">Reason:</strong> {selectedLeave.reason}</p>
            </div>

            <div>
              <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Decision Note (Optional)</label>
              <input
                id="leave-review-note-input"
                type="text"
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="E.g. Approved per project schedule, backup assigned..."
                className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                id="admin-confirm-approve-leave-btn"
                disabled={isProcessing}
                onClick={() => handleUpdateStatus('APPROVED')}
                className="flex-1 min-h-[44px] py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Approve</span>
              </button>
              <button
                id="admin-confirm-reject-leave-btn"
                disabled={isProcessing}
                onClick={() => handleUpdateStatus('REJECTED')}
                className="flex-1 min-h-[44px] py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                <span>Reject</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedLeave(null)}
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
