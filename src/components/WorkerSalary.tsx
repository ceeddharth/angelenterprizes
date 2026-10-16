import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  IndianRupee,
  Calendar,
  CheckCircle2,
  Clock,
  RefreshCw,
  FileText,
  Building2,
  Download,
  AlertCircle
} from 'lucide-react';
import { WorkerRecord, SalaryRecord } from '../types';
import { FirebaseService } from '../services/firebaseService';
import { formatINR } from '../utils/currency';

interface WorkerSalaryProps {
  currentWorker: WorkerRecord | null;
  onBack: () => void;
  simTheme?: 'light' | 'dark';
  onNavigateToLogin: () => void;
}

export const WorkerSalary: React.FC<WorkerSalaryProps> = ({
  currentWorker,
  onBack,
  simTheme = 'light',
  onNavigateToLogin
}) => {
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<SalaryRecord | null>(null);

  const loadSalaryRecords = async () => {
    if (!currentWorker?.workerId) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await FirebaseService.getWorkerSalaryRecords(currentWorker.workerId);
      setSalaryRecords(data);
      if (data.length > 0 && !selectedRecord) {
        setSelectedRecord(data[0]);
      }
    } catch (err: any) {
      console.error('[WorkerSalary] load error:', err);
      setError(FirebaseService.parseError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentWorker?.workerId) {
      loadSalaryRecords();
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

  if (!currentWorker) {
    return (
      <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
        <div className="bg-[#0E1118] text-white p-4 flex items-center gap-3 sticky top-0 z-20 border-b border-[#1E232E]">
          <button onClick={onBack} className="p-1.5 hover:bg-[#1E232E] text-zinc-400 hover:text-white rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] text-amber-500 font-mono font-bold uppercase tracking-wider block leading-none">ANGEL ENTERPRISES</span>
            <h3 className="font-bold text-base text-zinc-100">Salary & Wage Slips</h3>
          </div>
        </div>
        <div className="p-8 text-center m-auto max-w-sm">
          <div className="w-12 h-12 rounded-xl bg-[#161A24] border border-[#202534] flex items-center justify-center mx-auto mb-3 text-zinc-400">
            <IndianRupee className="w-6 h-6 text-amber-400" />
          </div>
          <p className="text-sm font-bold text-zinc-200">Worker Session Required</p>
          <p className="text-xs text-zinc-400 mt-1 mb-4">Please log in with your registered Worker ID to inspect wage records and slips.</p>
          <button
            onClick={onNavigateToLogin}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-lg shadow-sm transition-colors"
          >
            Sign In as Worker
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#090A0F] text-zinc-100 overflow-y-auto">
      {/* Header */}
      <div className="bg-[#0E1118] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 border-b border-[#1E232E]">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg bg-[#161A24] hover:bg-[#202534] border border-[#252C3D] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">Civil Payroll Records</span>
            <h3 className="font-bold text-sm text-zinc-100 tracking-wide">Salary & Wage Slips</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
            {currentWorker.workerId}
          </span>
          <button
            id="worker-refresh-salary-btn"
            onClick={loadSalaryRecords}
            className="p-1.5 rounded-lg bg-[#161A24] hover:bg-[#202534] border border-[#252C3D] text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-950/40 border border-red-800/60 text-red-300 text-xs rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 font-bold ml-2">×</button>
          </div>
        )}

        {/* Wage Foundation Info Card */}
        <div className="bg-[#11141C] rounded-xl border border-[#202534] p-3.5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Deterministic Wage Basis</span>
            <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
              {currentWorker.jobRole}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-[#161A24] rounded-lg border border-[#202534]">
              <span className="text-[10px] text-zinc-400 block font-medium">Standard Daily Rate</span>
              <span className="text-base font-bold text-zinc-100 font-mono">
                {formatINR(selectedRecord?.dailyRate || 250)}/day
              </span>
            </div>
            <div className="p-2.5 bg-[#161A24] rounded-lg border border-[#202534]">
              <span className="text-[10px] text-zinc-400 block font-medium">Overtime Multiplier</span>
              <span className="text-base font-bold text-amber-400 font-mono">
                1.5x Hourly Rate
              </span>
            </div>
          </div>
        </div>

        {/* Pay Slips List / Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Monthly Wage Slips</h4>
            <span className="text-[10px] text-zinc-400 font-semibold font-mono">{salaryRecords.length} Generated</span>
          </div>

          {isLoading ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
              <span>Loading salary records from Firestore...</span>
            </div>
          ) : salaryRecords.length === 0 ? (
            <div className="p-8 bg-[#11141C] rounded-xl border border-[#202534] text-center">
              <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-zinc-300">No salary slips calculated yet</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Monthly salary slips generated by management will appear here.</p>
            </div>
          ) : (
            salaryRecords.map((sal) => {
              const isSelected = selectedRecord?.salaryId === sal.salaryId;
              const statusColor =
                sal.status === 'PAID'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : sal.status === 'PROCESSED'
                  ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/30';

              return (
                <div
                  key={sal.salaryId}
                  onClick={() => setSelectedRecord(sal)}
                  className={`p-3.5 bg-[#11141C] rounded-xl border cursor-pointer shadow-sm transition-all space-y-2.5 ${
                    isSelected
                      ? 'border-amber-500 ring-1 ring-amber-500/30'
                      : 'border-[#202534] hover:border-[#2E354A]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-amber-400" />
                      <span className="font-bold text-xs text-zinc-200">Period: {sal.payPeriod}</span>
                      <span className="text-[10px] font-mono text-zinc-400">({sal.salaryId})</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${statusColor}`}>
                      {sal.status}
                    </span>
                  </div>

                  {/* Slip Breakdown Details */}
                  <div className="grid grid-cols-4 gap-1.5 text-center pt-1 border-t border-[#1E232E] text-xs">
                    <div className="p-1.5 bg-[#161A24] rounded border border-[#202534]">
                      <span className="text-[9px] text-zinc-400 block font-mono">Attended</span>
                      <span className="font-bold text-zinc-200 font-mono">{sal.daysAttended}d</span>
                    </div>
                    <div className="p-1.5 bg-[#161A24] rounded border border-[#202534]">
                      <span className="text-[9px] text-zinc-400 block font-mono">OT Hours</span>
                      <span className="font-bold text-amber-400 font-mono">{sal.approvedOvertimeHours}h</span>
                    </div>
                    <div className="p-1.5 bg-[#161A24] rounded border border-[#202534]">
                      <span className="text-[9px] text-zinc-400 block font-mono">Deductions</span>
                      <span className="font-bold text-rose-400 font-mono">-{formatINR(sal.deductions || 0)}</span>
                    </div>
                    <div className="p-1.5 bg-emerald-950/30 rounded border border-emerald-500/30">
                      <span className="text-[9px] text-emerald-400 block font-mono font-bold">Net Salary</span>
                      <span className="font-black text-emerald-300 font-mono">{formatINR(sal.netSalary || 0)}</span>
                    </div>
                  </div>

                  {/* Financial Breakdown Accordion */}
                  <div className="text-[11px] text-zinc-400 space-y-1 pt-1.5 border-t border-[#1E232E] font-mono">
                    <div className="flex justify-between">
                      <span className="font-sans text-zinc-400">Base Wages ({sal.daysAttended} days @ {formatINR(sal.dailyRate)}/day):</span>
                      <span className="font-semibold text-zinc-200">{formatINR(sal.baseEarnings || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-zinc-400">Overtime Comp ({sal.approvedOvertimeHours}h @ {formatINR(sal.overtimeHourlyRate || 46.88)}/hr):</span>
                      <span className="font-semibold text-zinc-200">{formatINR(sal.overtimeEarnings || 0)}</span>
                    </div>
                    {sal.allowances > 0 && (
                      <div className="flex justify-between text-amber-400">
                        <span className="font-sans text-zinc-400">Allowances (Site / Duty):</span>
                        <span className="font-semibold">+{formatINR(sal.allowances || 0)}</span>
                      </div>
                    )}
                    {sal.deductions > 0 && (
                      <div className="flex justify-between text-rose-400">
                        <span className="font-sans text-zinc-400">Deductions:</span>
                        <span className="font-semibold">-{formatINR(sal.deductions || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-xs text-zinc-100 pt-1.5 border-t border-[#1E232E]">
                      <span className="font-sans text-zinc-300">Net Payable:</span>
                      <span className="text-emerald-400 font-black">{formatINR(sal.netSalary || 0)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
