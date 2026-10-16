import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  FileText,
  UserCheck,
  Ban
} from 'lucide-react';
import { WorkerRecord, LeaveRequest, LeaveType } from '../types';
import { FirebaseService } from '../services/firebaseService';

interface WorkerLeaveProps {
  currentWorker: WorkerRecord | null;
  onBack: () => void;
  simTheme?: 'light' | 'dark';
  onNavigateToLogin: () => void;
}

export const WorkerLeave: React.FC<WorkerLeaveProps> = ({
  currentWorker,
  onBack,
  simTheme = 'light',
  onNavigateToLogin
}) => {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showApplyModal, setShowApplyModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form State
  const [leaveType, setLeaveType] = useState<LeaveType>('CASUAL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const loadLeaves = async () => {
    if (!currentWorker?.workerId) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await FirebaseService.getWorkerLeaves(currentWorker.workerId);
      setLeaves(data);
    } catch (err: any) {
      console.error('[WorkerLeave] load error:', err);
      setError(FirebaseService.parseError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentWorker?.workerId) {
      loadLeaves();
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

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorker) {
      onNavigateToLogin();
      return;
    }
    if (!startDate || !endDate) {
      setError('Please select both start date and end date.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('End date cannot be earlier than start date.');
      return;
    }
    if (!reason.trim()) {
      setError('Please enter a reason for the leave request.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await FirebaseService.submitLeaveRequest({
        workerId: currentWorker.workerId,
        leaveType,
        startDate,
        endDate,
        reason: reason.trim()
      });
      setNotice('Leave request submitted successfully (Status: PENDING).');
      setShowApplyModal(false);
      setStartDate('');
      setEndDate('');
      setReason('');
      await loadLeaves();
    } catch (err: any) {
      setError(FirebaseService.parseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelLeave = async (leaveId: string) => {
    try {
      setIsSubmitting(true);
      setError(null);
      await FirebaseService.updateLeaveStatus({
        leaveId,
        status: 'CANCELLED'
      });
      setNotice('Leave request has been cancelled.');
      await loadLeaves();
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
          <h3 className="font-bold text-base">Worker Leave Portal</h3>
        </div>
        <div className="p-8 text-center m-auto max-w-sm">
          <Calendar className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-bold text-white">Worker Session Required</p>
          <p className="text-xs text-zinc-400 mt-1 mb-4">Please log in with your registered Worker ID to view and submit leave requests.</p>
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

  // Summary Metrics
  const approvedLeaves = leaves.filter((l) => l.status === 'APPROVED');
  const pendingLeaves = leaves.filter((l) => l.status === 'PENDING');
  const totalDaysTaken = approvedLeaves.reduce((acc, l) => acc + (l.daysCount || 0), 0);

  return (
    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
      {/* Top Header */}
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
            <h3 className="font-black text-sm text-white tracking-wide">Leave Management</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
            {currentWorker.workerId}
          </span>
          <button
            id="worker-refresh-leave-btn"
            onClick={loadLeaves}
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

        {/* Leave Balances / Overview Card */}
        <div className="bg-[#11141C] rounded-xl border border-[#202534] p-3.5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">Leave Balance & Entitlement</span>
            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
              ACTIVE QUOTA
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 bg-[#090A0F] border border-[#1E232E] rounded-lg">
              <span className="text-[10px] text-zinc-400 block font-medium uppercase font-mono">Approved</span>
              <span className="text-lg font-black text-white font-mono">{totalDaysTaken} Days</span>
            </div>
            <div className="p-2.5 bg-[#090A0F] border border-[#1E232E] rounded-lg">
              <span className="text-[10px] text-amber-400 block font-medium uppercase font-mono">Pending</span>
              <span className="text-lg font-black text-amber-400 font-mono">{pendingLeaves.length}</span>
            </div>
            <div className="p-2.5 bg-[#090A0F] border border-[#1E232E] rounded-lg">
              <span className="text-[10px] text-zinc-400 block font-medium uppercase font-mono">Annual Cap</span>
              <span className="text-lg font-black text-zinc-200 font-mono">18 Days</span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#1E232E]">
            <button
              id="worker-apply-leave-btn"
              onClick={() => {
                setError(null);
                setNotice(null);
                setShowApplyModal(true);
              }}
              className="w-full min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Submit Leave Request</span>
            </button>
          </div>
        </div>

        {/* Previous Leave Requests */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">Leave History & Status</h4>
            <span className="text-[10px] font-mono text-zinc-500 font-bold">{leaves.length} Total</span>
          </div>

          {isLoading ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Loading leave records from Firestore...</span>
            </div>
          ) : leaves.length === 0 ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center">
              <Calendar className="w-8 h-8 text-zinc-600 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-zinc-200">No leave requests yet</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Submit your first leave request above for supervisor review.</p>
            </div>
          ) : (
            leaves.map((leave) => {
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
                  className="p-3.5 bg-[#11141C] rounded-xl border border-[#202534] hover:border-[#2C3345] shadow-xs space-y-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-white uppercase">{leave.leaveType} LEAVE</span>
                      <span className="text-[10px] font-mono text-zinc-500">({leave.leaveId})</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${statusColor}`}>
                      {leave.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300 pt-1.5 border-t border-[#1E232E]">
                    <div>
                      <span className="text-[10px] text-zinc-500 block uppercase font-mono">Period</span>
                      <span className="font-semibold text-zinc-200 font-mono">{leave.startDate} → {leave.endDate}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block uppercase font-mono">Duration</span>
                      <span className="font-bold text-amber-400 font-mono">{leave.daysCount} Day(s)</span>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-400 pt-1.5 border-t border-[#1E232E] space-y-1">
                    <p><strong className="text-zinc-300">Reason:</strong> {leave.reason}</p>
                    {leave.reviewerNotes && (
                      <p className="text-amber-300/90 bg-[#090A0F] border border-[#1E232E] p-2 rounded">
                        <strong>Supervisor Note:</strong> {leave.reviewerNotes}
                      </p>
                    )}
                  </div>

                  {leave.status === 'PENDING' && (
                    <div className="pt-1.5 flex justify-end border-t border-[#1E232E]">
                      <button
                        id={`cancel-leave-${leave.leaveId}`}
                        disabled={isSubmitting}
                        onClick={() => handleCancelLeave(leave.leaveId)}
                        className="px-3 py-1.5 text-[11px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors border border-rose-800/60 cursor-pointer"
                      >
                        Cancel Request
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Apply Leave Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#11141C] rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 border border-[#2A3142]">
            <div className="flex items-center justify-between border-b border-[#1E232E] pb-2.5">
              <h4 className="font-black text-sm text-white">Submit Leave Request</h4>
              <span className="font-mono text-xs text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                {currentWorker.workerId}
              </span>
            </div>

            <form onSubmit={handleApplyLeave} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Leave Type *</label>
                <select
                  id="leave-type-select"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="CASUAL">Casual Leave (Personal / Family)</option>
                  <option value="SICK">Medical / Sick Leave</option>
                  <option value="EMERGENCY">Emergency Leave</option>
                  <option value="PAID">Earned / Paid Leave</option>
                  <option value="UNPAID">Unpaid Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Start Date *</label>
                  <input
                    id="leave-start-date-input"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">End Date *</label>
                  <input
                    id="leave-end-date-input"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Reason for Absence *</label>
                <textarea
                  id="leave-reason-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe reason for leave request..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  id="submit-leave-confirm-btn"
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" /> : null}
                  <span>Submit Request</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
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
