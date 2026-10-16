import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  DollarSign,
  Calendar,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  Plus,
  FileText,
  UserCheck,
  Building2,
  AlertCircle
} from 'lucide-react';
import { SalaryRecord, SalaryStatus, WorkerRecord, AdminAccount } from '../types';
import { FirebaseService } from '../services/firebaseService';
import { formatINR } from '../utils/currency';

interface AdminSalaryProps {
  currentAdmin: AdminAccount | null;
  workers: WorkerRecord[];
  onBack: () => void;
  simTheme?: 'light' | 'dark';
}

export const AdminSalary: React.FC<AdminSalaryProps> = ({
  currentAdmin,
  workers,
  onBack,
  simTheme = 'light'
}) => {
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Generation Modal State
  const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(workers[0]?.workerId || '');
  const [payPeriod, setPayPeriod] = useState<string>('2026-09');
  const [dailyRate, setDailyRate] = useState<string>('250');
  const [allowances, setAllowances] = useState<string>('0');
  const [deductions, setDeductions] = useState<string>('0');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const loadAllSalaryRecords = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await FirebaseService.getAllSalaryRecords();
      setSalaryRecords(data);
    } catch (err: any) {
      console.error('[AdminSalary] load error:', err);
      setError(FirebaseService.parseError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllSalaryRecords();
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

  const handleGenerateSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerId) {
      setError('Please select a worker.');
      return;
    }

    const rate = parseFloat(dailyRate);
    if (isNaN(rate) || rate <= 0) {
      setError('Daily rate must be a positive number.');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      const result = await FirebaseService.calculateSalary({
        workerId: selectedWorkerId,
        payPeriod,
        customDailyRate: rate,
        allowances: parseFloat(allowances) || 0,
        deductions: parseFloat(deductions) || 0
      });
      setNotice(`Generated pay slip for ${result.workerId} (${result.payPeriod}): Net ${formatINR(result.netSalary)}.`);
      setShowGenerateModal(false);
      await loadAllSalaryRecords();
    } catch (err: any) {
      setError(FirebaseService.parseError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateStatus = async (salaryId: string, status: SalaryStatus) => {
    try {
      setIsProcessing(true);
      setError(null);
      await FirebaseService.updateSalaryStatus({
        salaryId,
        status
      });
      setNotice(`Salary record ${salaryId} updated to ${status}.`);
      await loadAllSalaryRecords();
    } catch (err: any) {
      setError(FirebaseService.parseError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredRecords = salaryRecords.filter((sal) => {
    const matchStatus = statusFilter === 'ALL' || sal.status === statusFilter;
    const worker = workers.find((w) => w.workerId === sal.workerId);
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      sal.workerId.toLowerCase().includes(q) ||
      sal.payPeriod.toLowerCase().includes(q) ||
      (worker && worker.fullName.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  const totalPayroll = salaryRecords.reduce((acc, s) => acc + (s.netSalary || 0), 0);
  const paidPayroll = salaryRecords.filter((s) => s.status === 'PAID').reduce((acc, s) => acc + (s.netSalary || 0), 0);
  const pendingPayroll = totalPayroll - paidPayroll;

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
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">Civil Payroll Center</span>
            <h3 className="font-black text-sm text-white tracking-wide">Workforce Payroll & Wages</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="admin-generate-salary-btn"
            onClick={() => {
              setError(null);
              setNotice(null);
              setShowGenerateModal(true);
            }}
            className="min-h-[40px] px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Generate Slip</span>
          </button>
          <button
            id="admin-refresh-salary-btn"
            onClick={loadAllSalaryRecords}
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

        {/* Aggregate Payroll Metrics */}
        <div className="bg-[#11141C] rounded-xl border border-[#202534] p-3 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
          <div className="p-2.5 bg-[#090A0F] border border-[#1E232E] rounded-lg">
            <span className="text-[10px] text-zinc-400 block font-medium uppercase font-mono">Total Net Payroll</span>
            <span className="text-base sm:text-lg font-black text-white font-mono">{formatINR(totalPayroll)}</span>
          </div>
          <div className="p-2.5 bg-[#090A0F] border border-emerald-900/50 rounded-lg">
            <span className="text-[10px] text-emerald-400 block font-medium uppercase font-mono">Paid Disbursed</span>
            <span className="text-base sm:text-lg font-black text-emerald-300 font-mono">{formatINR(paidPayroll)}</span>
          </div>
          <div className="p-2.5 bg-[#090A0F] border border-amber-900/50 rounded-lg">
            <span className="text-[10px] text-amber-400 block font-medium uppercase font-mono">Pending Release</span>
            <span className="text-base sm:text-lg font-black text-amber-300 font-mono">{formatINR(pendingPayroll)}</span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
            <input
              id="admin-salary-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search worker ID, name, or pay period (YYYY-MM)..."
              className="w-full pl-9 pr-3 py-2 bg-[#11141C] border border-[#202534] rounded-lg text-xs focus:outline-none focus:border-amber-500 text-white placeholder:text-zinc-500 font-medium"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
            {['ALL', 'DRAFT', 'PROCESSED', 'PAID'].map((st) => (
              <button
                key={st}
                id={`salary-filter-${st.toLowerCase()}`}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase whitespace-nowrap transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-[#11141C] border border-[#202534] text-zinc-400 hover:text-white hover:bg-[#161A24]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Salary Records List */}
        <div className="space-y-2.5">
          {isLoading ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Fetching salary records from Firestore...</span>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center text-xs text-zinc-400">
              No salary slips calculated yet. Click &quot;Generate Slip&quot; to calculate one.
            </div>
          ) : (
            filteredRecords.map((sal) => {
              const worker = workers.find((w) => w.workerId === sal.workerId);
              const statusColor =
                sal.status === 'PAID'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                  : sal.status === 'PROCESSED'
                  ? 'bg-sky-950/80 text-sky-300 border-sky-700/60'
                  : 'bg-amber-950/80 text-amber-300 border-amber-700/60';

              return (
                <div
                  key={sal.salaryId}
                  className="p-3.5 bg-[#11141C] rounded-xl border border-[#202534] hover:border-[#2C3345] shadow-xs space-y-2.5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">
                          {worker?.fullName || 'Worker'}
                        </span>
                        <span className="font-mono text-[10px] text-amber-400 font-bold px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded">
                          {sal.workerId}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5 font-mono">
                        Period: <strong className="text-zinc-200">{sal.payPeriod}</strong> · Slip ID: {sal.salaryId}
                      </p>
                    </div>
                    <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${statusColor}`}>
                      {sal.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center text-xs pt-1 border-t border-[#1E232E]">
                    <div className="p-1.5 bg-[#090A0F] border border-[#1E232E] rounded">
                      <span className="text-[9px] text-zinc-500 block font-mono uppercase">Attended</span>
                      <span className="font-bold text-zinc-200 font-mono">{sal.daysAttended} Days</span>
                    </div>
                    <div className="p-1.5 bg-[#090A0F] border border-[#1E232E] rounded">
                      <span className="text-[9px] text-zinc-500 block font-mono uppercase">OT Hours</span>
                      <span className="font-bold text-amber-400 font-mono">{sal.approvedOvertimeHours}h</span>
                    </div>
                    <div className="p-1.5 bg-[#090A0F] border border-[#1E232E] rounded">
                      <span className="text-[9px] text-zinc-500 block font-mono uppercase">Deductions</span>
                      <span className="font-bold text-rose-400 font-mono">-{formatINR(sal.deductions || 0)}</span>
                    </div>
                    <div className="p-1.5 bg-[#090A0F] border border-emerald-900/50 rounded">
                      <span className="text-[9px] text-emerald-400 block font-mono font-bold uppercase">Net Salary</span>
                      <span className="font-black text-emerald-300 font-mono">{formatINR(sal.netSalary || 0)}</span>
                    </div>
                  </div>

                  {/* Wage Breakdown Calculation Math */}
                  <div className="text-[11px] text-zinc-400 space-y-0.5 pt-1 border-t border-[#1E232E] font-mono">
                    <div className="flex justify-between">
                      <span className="font-sans">Base Wages:</span>
                      <span className="font-semibold text-zinc-200">{formatINR(sal.baseEarnings || 0)} ({sal.daysAttended} days @ {formatINR(sal.dailyRate)}/day)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans">Overtime Pay:</span>
                      <span className="font-semibold text-zinc-200">{formatINR(sal.overtimeEarnings || 0)} ({sal.approvedOvertimeHours}h @ {formatINR(sal.overtimeHourlyRate || 46.88)}/hr)</span>
                    </div>
                    {sal.allowances > 0 && (
                      <div className="flex justify-between text-amber-400">
                        <span className="font-sans">Allowances:</span>
                        <span className="font-semibold">+{formatINR(sal.allowances || 0)}</span>
                      </div>
                    )}
                    {sal.deductions > 0 && (
                      <div className="flex justify-between text-rose-400">
                        <span className="font-sans">Deductions:</span>
                        <span className="font-semibold">-{formatINR(sal.deductions || 0)}</span>
                      </div>
                    )}
                  </div>

                  {/* Status Actions */}
                  <div className="pt-1.5 flex gap-2 border-t border-[#1E232E]">
                    {sal.status === 'DRAFT' && (
                      <button
                        id={`process-salary-${sal.salaryId}`}
                        disabled={isProcessing}
                        onClick={() => handleUpdateStatus(sal.salaryId, 'PROCESSED')}
                        className="flex-1 min-h-[40px] py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Process Wage Slip</span>
                      </button>
                    )}
                    {sal.status === 'PROCESSED' && (
                      <button
                        id={`mark-paid-salary-${sal.salaryId}`}
                        disabled={isProcessing}
                        onClick={() => handleUpdateStatus(sal.salaryId, 'PAID')}
                        className="flex-1 min-h-[40px] py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Record Paid</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Generate Salary Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#11141C] rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 border border-[#2A3142]">
            <div className="flex items-center justify-between border-b border-[#1E232E] pb-2.5">
              <h4 className="font-black text-sm text-white">Calculate Wage Slip</h4>
              <span className="text-[10px] font-mono text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">Deterministic Model</span>
            </div>

            <form onSubmit={handleGenerateSalary} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Select Worker *</label>
                <select
                  id="salary-worker-select"
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                >
                  {workers.map((w) => (
                    <option key={w.workerId} value={w.workerId}>
                      {w.workerId} - {w.fullName} ({w.jobRole})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Pay Period *</label>
                  <input
                    id="salary-period-input"
                    type="month"
                    value={payPeriod}
                    onChange={(e) => setPayPeriod(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Daily Rate (₹) *</label>
                  <input
                    id="salary-daily-rate-input"
                    type="number"
                    step="5"
                    min="1"
                    value={dailyRate}
                    onChange={(e) => setDailyRate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Allowances (₹)</label>
                  <input
                    id="salary-allowances-input"
                    type="number"
                    step="10"
                    min="0"
                    value={allowances}
                    onChange={(e) => setAllowances(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Deductions (₹)</label>
                  <input
                    id="salary-deductions-input"
                    type="number"
                    step="10"
                    min="0"
                    value={deductions}
                    onChange={(e) => setDeductions(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-[#202534] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-[#090A0F] border border-[#1E232E] rounded-lg text-[10px] text-zinc-400 leading-relaxed">
                Attendance days & approved overtime records for {payPeriod} will be queried directly from Firestore to compute exact base and overtime earnings.
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  id="confirm-generate-salary-btn"
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" /> : null}
                  <span>Calculate & Save Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
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
