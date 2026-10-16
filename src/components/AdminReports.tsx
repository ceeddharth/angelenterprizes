import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Users,
  Building2,
  Calendar,
  Clock,
  IndianRupee,
  Download,
  Filter,
  RefreshCw,
  Search,
  Printer,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  TrendingUp,
  Layers,
  Wrench,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import {
  AdminAccount,
  WorkerRecord,
  ConstructionSite,
  BatchRecord,
  ReportType,
  ReportOverviewStats,
  AttendanceReportResponse,
  WorkforceReportResponse,
  LeaveReportResponse,
  OvertimeReportResponse,
  SalaryReportResponse
} from '../types';
import { FirebaseService } from '../services/firebaseService';
import { formatINR } from '../utils/currency';

interface AdminReportsProps {
  currentAdmin: AdminAccount | null;
  workers: WorkerRecord[];
  sites: ConstructionSite[];
  batches: BatchRecord[];
  onBack: () => void;
  simTheme?: 'light' | 'dark';
}

export const AdminReports: React.FC<AdminReportsProps> = ({
  currentAdmin,
  workers,
  sites,
  batches,
  onBack,
  simTheme = 'light'
}) => {
  const [activeTab, setActiveTab] = useState<ReportType | 'overview'>('overview');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Overview data
  const [overviewStats, setOverviewStats] = useState<ReportOverviewStats | null>(null);

  // Attendance filter & data
  const [attStartDate, setAttStartDate] = useState<string>('');
  const [attEndDate, setAttEndDate] = useState<string>('');
  const [attWorkerId, setAttWorkerId] = useState<string>('');
  const [attSiteId, setAttSiteId] = useState<string>('');
  const [attBatch, setAttBatch] = useState<string>('');
  const [attStatus, setAttStatus] = useState<string>('');
  const [attendanceReport, setAttendanceReport] = useState<AttendanceReportResponse | null>(null);

  // Workforce filter & data
  const [wfSiteId, setWfSiteId] = useState<string>('');
  const [wfBatch, setWfBatch] = useState<string>('');
  const [wfTrade, setWfTrade] = useState<string>('');
  const [wfStatus, setWfStatus] = useState<string>('');
  const [workforceReport, setWorkforceReport] = useState<WorkforceReportResponse | null>(null);

  // Leave filter & data
  const [leaveStartDate, setLeaveStartDate] = useState<string>('');
  const [leaveEndDate, setLeaveEndDate] = useState<string>('');
  const [leaveWorkerId, setLeaveWorkerId] = useState<string>('');
  const [leaveSiteId, setLeaveSiteId] = useState<string>('');
  const [leaveType, setLeaveType] = useState<string>('');
  const [leaveStatus, setLeaveStatus] = useState<string>('');
  const [leaveReport, setLeaveReport] = useState<LeaveReportResponse | null>(null);

  // Overtime filter & data
  const [otStartDate, setOtStartDate] = useState<string>('');
  const [otEndDate, setOtEndDate] = useState<string>('');
  const [otWorkerId, setOtWorkerId] = useState<string>('');
  const [otSiteId, setOtSiteId] = useState<string>('');
  const [otBatch, setOtBatch] = useState<string>('');
  const [otStatus, setOtStatus] = useState<string>('');
  const [overtimeReport, setOvertimeReport] = useState<OvertimeReportResponse | null>(null);

  // Salary filter & data
  const [salPayPeriod, setSalPayPeriod] = useState<string>('');
  const [salWorkerId, setSalWorkerId] = useState<string>('');
  const [salStatus, setSalStatus] = useState<string>('');
  const [salaryReport, setSalaryReport] = useState<SalaryReportResponse | null>(null);

  // Load overview stats on mount or tab change
  useEffect(() => {
    loadActiveReport();
  }, [activeTab]);

  const loadActiveReport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === 'overview') {
        const stats = await FirebaseService.getReportsOverview();
        setOverviewStats(stats);
      } else if (activeTab === 'attendance') {
        if (attStartDate && attEndDate && attStartDate > attEndDate) {
          setError('Invalid date range: end date cannot be earlier than start date.');
          setIsLoading(false);
          return;
        }
        const res = await FirebaseService.getAttendanceReport({
          startDate: attStartDate || undefined,
          endDate: attEndDate || undefined,
          workerId: attWorkerId || undefined,
          siteId: attSiteId || undefined,
          batchNumber: attBatch || undefined,
          status: attStatus || undefined
        });
        setAttendanceReport(res);
      } else if (activeTab === 'workforce') {
        const res = await FirebaseService.getWorkforceReport({
          siteId: wfSiteId || undefined,
          batchNumber: wfBatch || undefined,
          jobRole: wfTrade || undefined,
          status: wfStatus || undefined
        });
        setWorkforceReport(res);
      } else if (activeTab === 'leave') {
        if (leaveStartDate && leaveEndDate && leaveStartDate > leaveEndDate) {
          setError('Invalid date range: end date cannot be earlier than start date.');
          setIsLoading(false);
          return;
        }
        const res = await FirebaseService.getLeaveReport({
          startDate: leaveStartDate || undefined,
          endDate: leaveEndDate || undefined,
          workerId: leaveWorkerId || undefined,
          siteId: leaveSiteId || undefined,
          leaveType: leaveType || undefined,
          status: leaveStatus || undefined
        });
        setLeaveReport(res);
      } else if (activeTab === 'overtime') {
        if (otStartDate && otEndDate && otStartDate > otEndDate) {
          setError('Invalid date range: end date cannot be earlier than start date.');
          setIsLoading(false);
          return;
        }
        const res = await FirebaseService.getOvertimeReport({
          startDate: otStartDate || undefined,
          endDate: otEndDate || undefined,
          workerId: otWorkerId || undefined,
          siteId: otSiteId || undefined,
          batchNumber: otBatch || undefined,
          status: otStatus || undefined
        });
        setOvertimeReport(res);
      } else if (activeTab === 'salary') {
        const res = await FirebaseService.getSalaryReport({
          payPeriod: salPayPeriod || undefined,
          workerId: salWorkerId || undefined,
          status: salStatus || undefined
        });
        setSalaryReport(res);
      }
    } catch (err: any) {
      console.error('[AdminReports] Load error:', err);
      setError(FirebaseService.parseError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (activeTab === 'overview') return;
    setIsExporting(true);
    setNotice(null);
    setError(null);
    try {
      let filters: Record<string, any> = {};
      if (activeTab === 'attendance') {
        filters = {
          startDate: attStartDate,
          endDate: attEndDate,
          workerId: attWorkerId,
          siteId: attSiteId,
          batchNumber: attBatch,
          status: attStatus
        };
      } else if (activeTab === 'workforce') {
        filters = {
          siteId: wfSiteId,
          batchNumber: wfBatch,
          jobRole: wfTrade,
          status: wfStatus
        };
      } else if (activeTab === 'leave') {
        filters = {
          startDate: leaveStartDate,
          endDate: leaveEndDate,
          workerId: leaveWorkerId,
          siteId: leaveSiteId,
          leaveType,
          status: leaveStatus
        };
      } else if (activeTab === 'overtime') {
        filters = {
          startDate: otStartDate,
          endDate: otEndDate,
          workerId: otWorkerId,
          siteId: otSiteId,
          batchNumber: otBatch,
          status: otStatus
        };
      } else if (activeTab === 'salary') {
        filters = {
          payPeriod: salPayPeriod,
          workerId: salWorkerId,
          status: salStatus
        };
      }

      const csvData = await FirebaseService.exportReportCsv(activeTab, filters);

      // Trigger client browser download
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${activeTab}-report-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setNotice(`Report successfully exported to CSV (${activeTab.toUpperCase()}).`);
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      console.error('[AdminReports] Export error:', err);
      setError(FirebaseService.parseError(err));
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    try {
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      } else {
        setNotice('Direct browser printing is not supported in this environment. Use Export CSV to download the complete report data.');
        setTimeout(() => setNotice(null), 5000);
      }
    } catch (err: any) {
      console.warn('[AdminReports] print error or sandbox restriction:', err);
      setNotice('Browser printing is restricted inside the preview iframe. Use Export CSV to download data or open in a new tab.');
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const isDark = simTheme === 'dark';

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

  return (
    <div className={`w-full max-w-full min-w-0 flex-1 flex flex-col overflow-x-hidden ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Top Header */}
      <header className={`border-b sticky top-0 z-20 ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-200'} backdrop-blur-md`}>
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 py-2 sm:py-0 sm:h-16 flex items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center space-x-1.5 sm:space-x-3 min-w-0 flex-1">
            <button
              id="reports-back-btn"
              onClick={onBack}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors shrink-0 ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}
              title="Return to Admin Dashboard"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div className="flex items-center space-x-1.5 min-w-0 flex-1">
              <BarChart3 className="w-4 h-4 sm:w-6 sm:h-6 text-amber-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-[9px] sm:text-[10px] text-amber-500 font-bold uppercase tracking-wider block leading-none truncate">ANGEL ENTERPRISES</span>
                <h1 className="text-sm sm:text-lg font-bold tracking-tight truncate">Executive Reports</h1>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
            {activeTab !== 'overview' && (
              <>
                <button
                  id="reports-export-csv-btn"
                  onClick={handleExportCsv}
                  disabled={isExporting}
                  className="flex items-center space-x-1 px-2 sm:px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-medium transition-colors shadow-xs disabled:opacity-50"
                  title="Export to CSV"
                >
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export CSV'}</span>
                  <span className="sm:hidden text-[11px] font-semibold">CSV</span>
                </button>
                <button
                  id="reports-print-btn"
                  onClick={handlePrint}
                  className={`flex items-center space-x-1 px-2 sm:px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors ${
                    isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                  }`}
                  title="Print Report"
                >
                  <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Print View</span>
                </button>
              </>
            )}
            <button
              id="reports-refresh-btn"
              onClick={loadActiveReport}
              disabled={isLoading}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors border ${
                isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
              }`}
              title="Refresh Report Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isLoading ? 'animate-spin text-amber-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 flex space-x-1 overflow-x-auto py-1.5 border-t border-slate-100 dark:border-slate-800/60 scrollbar-none touch-pan-x min-w-0">
          {[
            { id: 'overview', label: 'Executive Overview', icon: TrendingUp },
            { id: 'attendance', label: 'Attendance Reports', icon: Clock },
            { id: 'workforce', label: 'Workforce Distribution', icon: Users },
            { id: 'leave', label: 'Leave Requests', icon: Calendar },
            { id: 'overtime', label: 'Overtime Ledger', icon: Layers },
            { id: 'salary', label: 'Payroll & Wages', icon: IndianRupee }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`report-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isActive ? 'text-amber-600 dark:text-amber-400' : ''}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Body */}
      <main className="w-full max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 py-3.5 sm:py-6 space-y-4 sm:space-y-6 min-w-0 overflow-x-hidden">
        {/* Banner Messages */}
        {error && (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 flex items-center justify-between text-sm animate-fade-in">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="font-semibold ml-4">✕</button>
          </div>
        )}

        {notice && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center justify-between text-sm animate-fade-in">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{notice}</span>
            </div>
            <button onClick={() => setNotice(null)} className="font-semibold ml-4">✕</button>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-600 animate-spin" />
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Aggregating live Firestore records across operational collections...
            </p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: EXECUTIVE OVERVIEW DASHBOARD */}
        {/* ========================================================================= */}
        {!isLoading && activeTab === 'overview' && overviewStats && (
          <div className="space-y-4 sm:space-y-6 min-w-0">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 min-w-0">
              {/* Workforce Card */}
              <div className={`p-3 sm:p-5 rounded-xl sm:rounded-2xl border shadow-xs min-w-0 flex flex-col justify-between ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">Workforce</span>
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0" />
                  </div>
                  <div className="mt-1 sm:mt-2 text-xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                    {overviewStats.workers.total}
                  </div>
                </div>
                <div className="mt-2 text-[10px] sm:text-xs space-y-0.5 text-slate-500 dark:text-slate-400">
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 truncate">Active</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">{overviewStats.workers.active}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="truncate">Suspended</span>
                    <span className="shrink-0">{overviewStats.workers.suspended}</span>
                  </div>
                  {overviewStats.workers.pendingRegistrations > 0 && (
                    <div className="flex items-center justify-between gap-1 min-w-0 text-amber-600 dark:text-amber-400 font-medium">
                      <span className="truncate">Pending</span>
                      <span className="shrink-0">{overviewStats.workers.pendingRegistrations}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Civil Sites Card */}
              <div className={`p-3 sm:p-5 rounded-xl sm:rounded-2xl border shadow-xs min-w-0 flex flex-col justify-between ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">Civil Sites</span>
                    <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
                  </div>
                  <div className="mt-1 sm:mt-2 text-xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                    {overviewStats.sites.total}
                  </div>
                </div>
                <div className="mt-2 text-[10px] sm:text-xs space-y-0.5 text-slate-500 dark:text-slate-400">
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 truncate">Active</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">{overviewStats.sites.active}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="truncate">Inactive</span>
                    <span className="shrink-0">{overviewStats.sites.inactive}</span>
                  </div>
                </div>
              </div>

              {/* Attendance Today Card */}
              <div className={`p-3 sm:p-5 rounded-xl sm:rounded-2xl border shadow-xs min-w-0 flex flex-col justify-between ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">Attendance</span>
                    <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                  </div>
                  <div className="mt-1 sm:mt-2 text-xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                    {overviewStats.attendance.checkedInToday + overviewStats.attendance.completedToday}
                  </div>
                </div>
                <div className="mt-2 text-[10px] sm:text-xs space-y-0.5 text-slate-500 dark:text-slate-400">
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="font-semibold text-amber-600 dark:text-amber-400 truncate">Checked In</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400 shrink-0">{overviewStats.attendance.checkedInToday}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="font-semibold text-blue-600 dark:text-blue-400 truncate">Completed</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400 shrink-0">{overviewStats.attendance.completedToday}</span>
                  </div>
                </div>
              </div>

              {/* Payroll Disbursed Card */}
              <div className={`p-3 sm:p-5 rounded-xl sm:rounded-2xl border shadow-xs min-w-0 flex flex-col justify-between ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">Payroll</span>
                    <IndianRupee className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 shrink-0" />
                  </div>
                  <div className="mt-1 sm:mt-2 text-base sm:text-2xl lg:text-3xl font-bold font-mono tracking-tight text-purple-600 dark:text-purple-400 truncate">
                    {formatINR(overviewStats.salary.totalPaidPayroll)}
                  </div>
                </div>
                <div className="mt-2 text-[10px] sm:text-xs space-y-0.5 text-slate-500 dark:text-slate-400">
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="text-slate-400 shrink-0">Proc:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono truncate">{formatINR(overviewStats.salary.totalProcessedPayroll)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="text-slate-400 shrink-0">Paid:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono truncate">{formatINR(overviewStats.salary.totalPaidPayroll)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Middle Section: Site & Batch Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-6 min-w-0">
              {/* Site Distribution */}
              <div className={`p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border shadow-sm min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between mb-3 min-w-0 gap-2">
                  <h3 className="font-semibold text-sm sm:text-base flex items-center space-x-1.5 min-w-0 truncate">
                    <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="truncate">Deployment by Site</span>
                  </h3>
                  <span className="text-[11px] text-slate-500 shrink-0">All sites</span>
                </div>
                <div className="space-y-2.5">
                  {overviewStats.workforceBySite.length === 0 ? (
                    <p className="text-xs sm:text-sm text-slate-500 py-4 text-center">No construction sites configured.</p>
                  ) : (
                    overviewStats.workforceBySite.map((site) => (
                      <div key={site.siteId} className="flex items-center justify-between text-xs sm:text-sm py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-none gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium flex items-center gap-1.5 min-w-0">
                            <span className="truncate font-semibold text-slate-900 dark:text-white">{site.siteName}</span>
                            {!site.isSiteActive && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">
                                Inactive
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] sm:text-xs text-slate-500 block truncate">{site.siteId}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-sm sm:text-base block">{site.workerCount}</span>
                          <span className="text-[10px] sm:text-xs text-slate-500 block whitespace-nowrap">{site.activeCount} active</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Trade Distribution */}
              <div className={`p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border shadow-sm min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between mb-3 min-w-0 gap-2">
                  <h3 className="font-semibold text-sm sm:text-base flex items-center space-x-1.5 min-w-0 truncate">
                    <Wrench className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate">Workforce by Trade</span>
                  </h3>
                  <span className="text-[11px] text-slate-500 shrink-0">{overviewStats.workforceByTrade.length} Trades</span>
                </div>
                <div className="space-y-2.5">
                  {overviewStats.workforceByTrade.length === 0 ? (
                    <p className="text-xs sm:text-sm text-slate-500 py-4 text-center">No trade data available.</p>
                  ) : (
                    overviewStats.workforceByTrade.map((item) => (
                      <div key={item.trade} className="flex items-center justify-between text-xs sm:text-sm py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-none gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-slate-900 dark:text-white truncate block">{item.trade}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-sm sm:text-base block">{item.workerCount}</span>
                          <span className="text-[10px] sm:text-xs text-slate-500 block whitespace-nowrap">{item.activeCount} active</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Operational Summary Grid: Leave, Overtime & Salary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6 min-w-0">
              {/* Leave Box */}
              <div className={`p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border shadow-sm min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                <h4 className="font-semibold text-xs sm:text-sm text-slate-500 uppercase tracking-wider mb-2.5 flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                  <span>Leave Activity</span>
                </h4>
                <div className="space-y-1.5 text-xs sm:text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 truncate">Total Requests:</span>
                    <span className="font-semibold shrink-0">{overviewStats.leave.totalRequests}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 truncate">Pending Review:</span>
                    <span className="font-semibold text-amber-600 shrink-0">{overviewStats.leave.pending}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 truncate">Approved:</span>
                    <span className="font-semibold text-emerald-600 shrink-0">{overviewStats.leave.approved}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 truncate">Approved Days:</span>
                    <span className="font-bold shrink-0">{overviewStats.leave.totalApprovedLeaveDays} days</span>
                  </div>
                </div>
              </div>

              {/* Overtime Box */}
              <div className={`p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border shadow-sm min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                <h4 className="font-semibold text-xs sm:text-sm text-slate-500 uppercase tracking-wider mb-2.5 flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0" />
                  <span>Overtime Summary</span>
                </h4>
                <div className="space-y-1.5 text-xs sm:text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 truncate">Total Shifts:</span>
                    <span className="font-semibold shrink-0">{overviewStats.overtime.totalRequests}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 truncate">Pending Approvals:</span>
                    <span className="font-semibold text-amber-600 shrink-0">{overviewStats.overtime.pending}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 truncate">Approved Shifts:</span>
                    <span className="font-semibold text-emerald-600 shrink-0">{overviewStats.overtime.approved}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 truncate">Approved Hours:</span>
                    <span className="font-bold text-emerald-600 shrink-0">{overviewStats.overtime.totalApprovedHours} hrs</span>
                  </div>
                </div>
              </div>

              {/* Salary Box */}
              <div className={`p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border shadow-sm min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                <h4 className="font-semibold text-xs sm:text-sm text-slate-500 uppercase tracking-wider mb-2.5 flex items-center space-x-1.5">
                  <IndianRupee className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 shrink-0" />
                  <span>Wage Ledger Totals</span>
                </h4>
                <div className="space-y-1.5 text-xs sm:text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 truncate">Calculated Slips:</span>
                    <span className="font-semibold shrink-0">{overviewStats.salary.recordCount}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 truncate">Overtime Earnings:</span>
                    <span className="font-semibold text-blue-600 shrink-0">{formatINR(overviewStats.salary.totalOvertimeEarnings)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 truncate">Total Deductions:</span>
                    <span className="font-semibold text-red-600 shrink-0">-{formatINR(overviewStats.salary.totalDeductions)}</span>
                  </div>
                  <div className="flex justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500 font-medium truncate">Net Payroll:</span>
                    <span className="font-bold text-purple-600 shrink-0">{formatINR(overviewStats.salary.totalNetSalary)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Metadata Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10px] sm:text-xs text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
              <span className="truncate">Report Generated: {new Date(overviewStats.generatedAt).toLocaleString()}</span>
              <span className="truncate">Authorized Admin: {overviewStats.generatedBy}</span>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ATTENDANCE REPORTS */}
        {/* ========================================================================= */}
        {!isLoading && activeTab === 'attendance' && (
          <div className="space-y-4 sm:space-y-6 min-w-0">
            {/* Filter Bar */}
            <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} space-y-3 min-w-0`}>
              <div className="flex items-center space-x-2 text-xs sm:text-sm font-semibold">
                <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
                <span>Attendance Report Filters</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 min-w-0">
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    id="filter-att-start-date"
                    value={attStartDate}
                    onChange={(e) => setAttStartDate(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">End Date</label>
                  <input
                    type="date"
                    id="filter-att-end-date"
                    value={attEndDate}
                    onChange={(e) => setAttEndDate(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Worker</label>
                  <select
                    id="filter-att-worker"
                    value={attWorkerId}
                    onChange={(e) => setAttWorkerId(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Workers</option>
                    {workers.map((w) => (
                      <option key={w.workerId} value={w.workerId}>
                        {w.workerId} - {w.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Site</label>
                  <select
                    id="filter-att-site"
                    value={attSiteId}
                    onChange={(e) => setAttSiteId(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Sites</option>
                    {sites.map((s) => (
                      <option key={s.siteId} value={s.siteId}>
                        {s.siteId} - {s.siteName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Status</label>
                  <select
                    id="filter-att-status"
                    value={attStatus}
                    onChange={(e) => setAttStatus(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Statuses</option>
                    <option value="CHECKED_IN">CHECKED_IN</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end items-center gap-2 pt-1">
                <button
                  id="filter-att-reset"
                  onClick={() => {
                    setAttStartDate('');
                    setAttEndDate('');
                    setAttWorkerId('');
                    setAttSiteId('');
                    setAttBatch('');
                    setAttStatus('');
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg border ${
                    isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Clear Filters
                </button>
                <button
                  id="filter-att-apply"
                  onClick={loadActiveReport}
                  className="px-4 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  Apply Filters
                </button>
              </div>
            </div>

            {/* Attendance Summary */}
            {attendanceReport && (
              <>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-4 min-w-0">
                  <div className={`p-2 sm:p-4 rounded-xl border text-center sm:text-left min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                    <span className="text-[9px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Total Records</span>
                    <span className="text-base sm:text-2xl font-bold mt-0.5 sm:mt-1 block truncate">{attendanceReport.summary.totalRecords}</span>
                  </div>
                  <div className={`p-2 sm:p-4 rounded-xl border text-center sm:text-left min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                    <span className="text-[9px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Checked-In</span>
                    <span className="text-base sm:text-2xl font-bold text-amber-600 mt-0.5 sm:mt-1 block truncate">{attendanceReport.summary.checkedInCount}</span>
                  </div>
                  <div className={`p-2 sm:p-4 rounded-xl border text-center sm:text-left min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                    <span className="text-[9px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Completed</span>
                    <span className="text-base sm:text-2xl font-bold text-emerald-600 mt-0.5 sm:mt-1 block truncate">{attendanceReport.summary.completedCount}</span>
                  </div>
                </div>

                {/* Mobile Card List (< sm) */}
                <div className="block sm:hidden space-y-2.5 min-w-0">
                  {attendanceReport.records.length === 0 ? (
                    <div className={`p-6 rounded-xl border text-center text-xs text-slate-500 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                      No attendance records match the selected filters.
                    </div>
                  ) : (
                    attendanceReport.records.map((r) => (
                      <div
                        key={r.attendanceId}
                        className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} space-y-2 shadow-xs min-w-0`}
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="min-w-0 flex-1">
                            <span className="font-mono font-bold text-xs text-amber-600 block">{r.workerId}</span>
                            <span className="font-semibold text-xs text-slate-900 dark:text-white truncate block">{r.workerName}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                            r.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}>
                            {r.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1.5 border-t border-slate-100 dark:border-slate-800/60 min-w-0">
                          <div className="min-w-0">
                            <span className="text-slate-400 block text-[10px] uppercase font-medium">Site</span>
                            <span className="text-slate-600 dark:text-slate-300 font-medium truncate block">{r.siteName}</span>
                          </div>
                          <div className="min-w-0">
                            <span className="text-slate-400 block text-[10px] uppercase font-medium">Date</span>
                            <span className="text-slate-600 dark:text-slate-300 font-medium block">{r.date}</span>
                          </div>
                          <div className="min-w-0">
                            <span className="text-slate-400 block text-[10px] uppercase font-medium">Check-In</span>
                            <span className="font-mono text-slate-700 dark:text-slate-200 block">
                              {r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <span className="text-slate-400 block text-[10px] uppercase font-medium">Check-Out</span>
                            <span className="font-mono text-slate-700 dark:text-slate-200 block">
                              {r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Desktop Detailed Table (>= sm) */}
                <div className={`hidden sm:block rounded-2xl border shadow-sm overflow-hidden min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="w-full min-w-0 overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className={`text-xs uppercase border-b ${isDark ? 'bg-slate-900/60 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        <tr>
                          <th className="px-4 py-3">Worker ID</th>
                          <th className="px-4 py-3">Worker Name</th>
                          <th className="px-4 py-3">Site</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Check-In</th>
                          <th className="px-4 py-3">Check-Out</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {attendanceReport.records.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                              No attendance records match the selected filters.
                            </td>
                          </tr>
                        ) : (
                          attendanceReport.records.map((r) => (
                            <tr key={r.attendanceId} className={`${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                              <td className="px-4 py-3 font-semibold text-amber-600">{r.workerId}</td>
                              <td className="px-4 py-3 font-medium">{r.workerName}</td>
                              <td className="px-4 py-3 text-slate-500">{r.siteName}</td>
                              <td className="px-4 py-3">{r.date}</td>
                              <td className="px-4 py-3 font-mono text-xs">
                                {r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">
                                {r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  r.status === 'COMPLETED'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                }`}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: WORKFORCE REPORTS */}
        {/* ========================================================================= */}
        {!isLoading && activeTab === 'workforce' && workforceReport && (
          <div className="space-y-4 sm:space-y-6 min-w-0">
            {/* Filter Bar */}
            <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-xs min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} space-y-3`}>
              <div className="flex items-center space-x-2 text-xs sm:text-sm font-semibold">
                <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
                <span>Workforce Distribution Filters</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 min-w-0">
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Site</label>
                  <select
                    id="filter-wf-site"
                    value={wfSiteId}
                    onChange={(e) => setWfSiteId(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Sites</option>
                    {sites.map((s) => (
                      <option key={s.siteId} value={s.siteId}>
                        {s.siteId} - {s.siteName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Batch</label>
                  <select
                    id="filter-wf-batch"
                    value={wfBatch}
                    onChange={(e) => setWfBatch(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Batches</option>
                    {batches.map((b) => (
                      <option key={b.batchId} value={b.batchId}>
                        {b.batchId} - {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Civil Trade</label>
                  <input
                    type="text"
                    id="filter-wf-trade"
                    placeholder="e.g. Mason, Electrician"
                    value={wfTrade}
                    onChange={(e) => setWfTrade(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Worker Status</label>
                  <select
                    id="filter-wf-status"
                    value={wfStatus}
                    onChange={(e) => setWfStatus(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Statuses</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                    <option value="PENDING">PENDING</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end items-center gap-2 pt-1">
                <button
                  id="filter-wf-reset"
                  onClick={() => {
                    setWfSiteId('');
                    setWfBatch('');
                    setWfTrade('');
                    setWfStatus('');
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg border ${
                    isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Clear Filters
                </button>
                <button
                  id="filter-wf-apply"
                  onClick={loadActiveReport}
                  className="px-4 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  Apply Filters
                </button>
              </div>
            </div>

            {/* Distribution Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 min-w-0">
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Total Workers</span>
                <span className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 block truncate">{workforceReport.summary.totalWorkers}</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Active</span>
                <span className="text-lg sm:text-2xl font-bold text-emerald-600 mt-0.5 sm:mt-1 block truncate">{workforceReport.summary.activeWorkers}</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Suspended</span>
                <span className="text-lg sm:text-2xl font-bold text-red-600 mt-0.5 sm:mt-1 block truncate">{workforceReport.summary.suspendedWorkers}</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Pending Regs</span>
                <span className="text-lg sm:text-2xl font-bold text-amber-600 mt-0.5 sm:mt-1 block truncate">{workforceReport.summary.pendingRegistrations}</span>
              </div>
            </div>

            {/* Mobile Card List (< sm) */}
            <div className="block sm:hidden space-y-2.5 min-w-0">
              {workforceReport.workers.length === 0 ? (
                <div className={`p-6 rounded-xl border text-center text-xs text-slate-500 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                  No workers match the selected criteria.
                </div>
              ) : (
                workforceReport.workers.map((w) => (
                  <div
                    key={w.workerId}
                    className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} space-y-2 shadow-xs min-w-0`}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono font-bold text-xs text-amber-600 block">{w.workerId}</span>
                        <span className="font-semibold text-xs text-slate-900 dark:text-white truncate block">{w.fullName}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        w.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : w.status === 'SUSPENDED'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}>
                        {w.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1.5 border-t border-slate-100 dark:border-slate-800/60 min-w-0">
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Trade / Role</span>
                        <span className="font-medium text-slate-700 dark:text-slate-200 truncate block">{w.jobRole}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Batch</span>
                        <span className="text-slate-600 dark:text-slate-300 truncate block">{w.batchName}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Site</span>
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-slate-600 dark:text-slate-300 font-medium truncate">{w.siteName}</span>
                          {!w.isSiteActive && (
                            <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">
                              Inactive
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Contact</span>
                        <span className="font-mono text-slate-600 dark:text-slate-300 block truncate">{w.phone}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Detailed Table (>= sm) */}
            <div className={`hidden sm:block rounded-2xl border shadow-sm overflow-hidden min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="w-full min-w-0 overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className={`text-xs uppercase border-b ${isDark ? 'bg-slate-900/60 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    <tr>
                      <th className="px-4 py-3">Worker ID</th>
                      <th className="px-4 py-3">Full Name</th>
                      <th className="px-4 py-3">Site Name</th>
                      <th className="px-4 py-3">Batch</th>
                      <th className="px-4 py-3">Trade</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {workforceReport.workers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No workers match the selected criteria.
                        </td>
                      </tr>
                    ) : (
                      workforceReport.workers.map((w) => (
                        <tr key={w.workerId} className={`${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                          <td className="px-4 py-3 font-semibold text-amber-600">{w.workerId}</td>
                          <td className="px-4 py-3 font-medium">{w.fullName}</td>
                          <td className="px-4 py-3 text-slate-500">
                            <div className="flex items-center space-x-1">
                              <span>{w.siteName}</span>
                              {!w.isSiteActive && (
                                <span className="text-[10px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                  Inactive
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">{w.batchName}</td>
                          <td className="px-4 py-3 font-medium">{w.jobRole}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{w.phone}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              w.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : w.status === 'SUSPENDED'
                                ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}>
                              {w.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: LEAVE REPORTS */}
        {/* ========================================================================= */}
        {!isLoading && activeTab === 'leave' && leaveReport && (
          <div className="space-y-4 sm:space-y-6 min-w-0">
            {/* Filter Bar */}
            <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-xs min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} space-y-3`}>
              <div className="flex items-center space-x-2 text-xs sm:text-sm font-semibold">
                <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
                <span>Leave Request Report Filters</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 min-w-0">
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    id="filter-leave-start-date"
                    value={leaveStartDate}
                    onChange={(e) => setLeaveStartDate(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">End Date</label>
                  <input
                    type="date"
                    id="filter-leave-end-date"
                    value={leaveEndDate}
                    onChange={(e) => setLeaveEndDate(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Worker</label>
                  <select
                    id="filter-leave-worker"
                    value={leaveWorkerId}
                    onChange={(e) => setLeaveWorkerId(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Workers</option>
                    {workers.map((w) => (
                      <option key={w.workerId} value={w.workerId}>
                        {w.workerId} - {w.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Leave Type</label>
                  <select
                    id="filter-leave-type"
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Types</option>
                    <option value="CASUAL">CASUAL</option>
                    <option value="MEDICAL">MEDICAL</option>
                    <option value="SICK">SICK</option>
                    <option value="EMERGENCY">EMERGENCY</option>
                    <option value="PAID">PAID</option>
                    <option value="UNPAID">UNPAID</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Status</label>
                  <select
                    id="filter-leave-status"
                    value={leaveStatus}
                    onChange={(e) => setLeaveStatus(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Statuses</option>
                    <option value="PENDING">PENDING</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end items-center gap-2 pt-1">
                <button
                  id="filter-leave-reset"
                  onClick={() => {
                    setLeaveStartDate('');
                    setLeaveEndDate('');
                    setLeaveWorkerId('');
                    setLeaveSiteId('');
                    setLeaveType('');
                    setLeaveStatus('');
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg border ${
                    isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Clear Filters
                </button>
                <button
                  id="filter-leave-apply"
                  onClick={loadActiveReport}
                  className="px-4 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  Apply Filters
                </button>
              </div>
            </div>

            {/* Leave Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 min-w-0">
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Total Requests</span>
                <span className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 block truncate">{leaveReport.summary.totalRequests}</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Pending Review</span>
                <span className="text-lg sm:text-2xl font-bold text-amber-600 mt-0.5 sm:mt-1 block truncate">{leaveReport.summary.pendingCount}</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Approved</span>
                <span className="text-lg sm:text-2xl font-bold text-emerald-600 mt-0.5 sm:mt-1 block truncate">{leaveReport.summary.approvedCount}</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Approved Days</span>
                <span className="text-lg sm:text-2xl font-bold text-emerald-600 mt-0.5 sm:mt-1 block truncate">{leaveReport.summary.totalLeaveDays} days</span>
              </div>
            </div>

            {/* Mobile Card List (< sm) */}
            <div className="block sm:hidden space-y-2.5 min-w-0">
              {leaveReport.records.length === 0 ? (
                <div className={`p-6 rounded-xl border text-center text-xs text-slate-500 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                  No leave requests match the selected filters.
                </div>
              ) : (
                leaveReport.records.map((r) => (
                  <div
                    key={r.leaveId}
                    className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} space-y-2 shadow-xs min-w-0`}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono font-bold text-xs text-amber-600 block">{r.workerId}</span>
                        <span className="font-semibold text-xs text-slate-900 dark:text-white truncate block">{r.workerName}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        r.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : r.status === 'REJECTED'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1.5 border-t border-slate-100 dark:border-slate-800/60 min-w-0">
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Leave Type</span>
                        <span className="font-medium text-slate-700 dark:text-slate-200 block">{r.leaveType}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Duration</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">{r.daysCount} {r.daysCount === 1 ? 'day' : 'days'}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Start Date</span>
                        <span className="text-slate-600 dark:text-slate-300 block">{r.startDate}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">End Date</span>
                        <span className="text-slate-600 dark:text-slate-300 block">{r.endDate}</span>
                      </div>
                    </div>
                    {r.reason && (
                      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/60 text-[11px]">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Reason</span>
                        <p className="text-slate-600 dark:text-slate-300 break-words leading-tight">{r.reason}</p>
                      </div>
                    )}
                    {r.reviewedBy && (
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                        <span>Reviewed by:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{r.reviewedBy}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Desktop Detailed Table (>= sm) */}
            <div className={`hidden sm:block rounded-2xl border shadow-sm overflow-hidden min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="w-full min-w-0 overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className={`text-xs uppercase border-b ${isDark ? 'bg-slate-900/60 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    <tr>
                      <th className="px-4 py-3">Worker</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Start Date</th>
                      <th className="px-4 py-3">End Date</th>
                      <th className="px-4 py-3">Days</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Reviewed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {leaveReport.records.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          No leave requests match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      leaveReport.records.map((r) => (
                        <tr key={r.leaveId} className={`${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-amber-600 block">{r.workerId}</span>
                            <span className="text-xs text-slate-500">{r.workerName}</span>
                          </td>
                          <td className="px-4 py-3 font-medium">{r.leaveType}</td>
                          <td className="px-4 py-3">{r.startDate}</td>
                          <td className="px-4 py-3">{r.endDate}</td>
                          <td className="px-4 py-3 font-semibold">{r.daysCount}</td>
                          <td className="px-4 py-3 text-xs max-w-xs truncate" title={r.reason}>{r.reason}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              r.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : r.status === 'REJECTED'
                                ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{r.reviewedBy || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: OVERTIME REPORTS */}
        {/* ========================================================================= */}
        {!isLoading && activeTab === 'overtime' && overtimeReport && (
          <div className="space-y-4 sm:space-y-6 min-w-0">
            {/* Filter Bar */}
            <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-xs min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} space-y-3`}>
              <div className="flex items-center space-x-2 text-xs sm:text-sm font-semibold">
                <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
                <span>Overtime Ledger Report Filters</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 min-w-0">
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    id="filter-ot-start-date"
                    value={otStartDate}
                    onChange={(e) => setOtStartDate(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">End Date</label>
                  <input
                    type="date"
                    id="filter-ot-end-date"
                    value={otEndDate}
                    onChange={(e) => setOtEndDate(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Worker</label>
                  <select
                    id="filter-ot-worker"
                    value={otWorkerId}
                    onChange={(e) => setOtWorkerId(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Workers</option>
                    {workers.map((w) => (
                      <option key={w.workerId} value={w.workerId}>
                        {w.workerId} - {w.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Site</label>
                  <select
                    id="filter-ot-site"
                    value={otSiteId}
                    onChange={(e) => setOtSiteId(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Sites</option>
                    {sites.map((s) => (
                      <option key={s.siteId} value={s.siteId}>
                        {s.siteId} - {s.siteName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Status</label>
                  <select
                    id="filter-ot-status"
                    value={otStatus}
                    onChange={(e) => setOtStatus(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Statuses</option>
                    <option value="PENDING">PENDING</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end items-center gap-2 pt-1">
                <button
                  id="filter-ot-reset"
                  onClick={() => {
                    setOtStartDate('');
                    setOtEndDate('');
                    setOtWorkerId('');
                    setOtSiteId('');
                    setOtBatch('');
                    setOtStatus('');
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg border ${
                    isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Clear Filters
                </button>
                <button
                  id="filter-ot-apply"
                  onClick={loadActiveReport}
                  className="px-4 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  Apply Filters
                </button>
              </div>
            </div>

            {/* Overtime Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 min-w-0">
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Total Shifts</span>
                <span className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 block truncate">{overtimeReport.summary.totalRequests}</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Requested Hours</span>
                <span className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 block truncate">{overtimeReport.summary.totalRequestedHours} hrs</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Approved Hours</span>
                <span className="text-lg sm:text-2xl font-bold text-emerald-600 mt-0.5 sm:mt-1 block truncate">{overtimeReport.summary.totalApprovedHours} hrs</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Pending Review</span>
                <span className="text-lg sm:text-2xl font-bold text-amber-600 mt-0.5 sm:mt-1 block truncate">{overtimeReport.summary.pendingCount}</span>
              </div>
            </div>

            {/* Mobile Card List (< sm) */}
            <div className="block sm:hidden space-y-2.5 min-w-0">
              {overtimeReport.records.length === 0 ? (
                <div className={`p-6 rounded-xl border text-center text-xs text-slate-500 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                  No overtime records match the selected filters.
                </div>
              ) : (
                overtimeReport.records.map((r) => (
                  <div
                    key={r.overtimeId}
                    className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} space-y-2 shadow-xs min-w-0`}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono font-bold text-xs text-amber-600 block">{r.workerId}</span>
                        <span className="font-semibold text-xs text-slate-900 dark:text-white truncate block">{r.workerName}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        r.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : r.status === 'REJECTED'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1.5 border-t border-slate-100 dark:border-slate-800/60 min-w-0">
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Site</span>
                        <span className="text-slate-600 dark:text-slate-300 truncate block font-medium">{r.siteName}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Date</span>
                        <span className="text-slate-600 dark:text-slate-300 block">{r.date}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Requested</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">{r.hours} hrs</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Approved Hours</span>
                        <span className="font-bold text-emerald-600 block">
                          {r.status === 'APPROVED' ? `${r.approvedHours} hrs` : '-'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Rate</span>
                        <span className="font-mono text-slate-600 dark:text-slate-300 block">{formatINR(r.hourlyRate)}/hr</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Est. Payout</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-100 block">
                          {formatINR(r.status === 'APPROVED' ? r.approvedHours * r.hourlyRate : r.hours * r.hourlyRate)}
                        </span>
                      </div>
                    </div>
                    {r.reason && (
                      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/60 text-[11px]">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Reason</span>
                        <p className="text-slate-600 dark:text-slate-300 break-words leading-tight">{r.reason}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Desktop Detailed Table (>= sm) */}
            <div className={`hidden sm:block rounded-2xl border shadow-sm overflow-hidden min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="w-full min-w-0 overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className={`text-xs uppercase border-b ${isDark ? 'bg-slate-900/60 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    <tr>
                      <th className="px-4 py-3">Worker</th>
                      <th className="px-4 py-3">Site</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Requested</th>
                      <th className="px-4 py-3">Approved</th>
                      <th className="px-4 py-3">Hourly Rate</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {overtimeReport.records.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          No overtime records match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      overtimeReport.records.map((r) => (
                        <tr key={r.overtimeId} className={`${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-amber-600 block">{r.workerId}</span>
                            <span className="text-xs text-slate-500">{r.workerName}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{r.siteName}</td>
                          <td className="px-4 py-3">{r.date}</td>
                          <td className="px-4 py-3 font-semibold">{r.hours} hrs</td>
                          <td className="px-4 py-3 font-bold text-emerald-600">
                            {r.status === 'APPROVED' ? `${r.approvedHours} hrs` : '-'}
                          </td>
                          <td className="px-4 py-3 text-xs">{formatINR(r.hourlyRate)}/hr</td>
                          <td className="px-4 py-3 text-xs max-w-xs truncate" title={r.reason}>{r.reason}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              r.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : r.status === 'REJECTED'
                                ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: SALARY & PAYROLL REPORTS */}
        {/* ========================================================================= */}
        {!isLoading && activeTab === 'salary' && salaryReport && (
          <div className="space-y-4 sm:space-y-6 min-w-0">
            {/* Disclaimer Banner */}
            <div className={`p-3 sm:p-4 rounded-xl border ${isDark ? 'bg-purple-950/20 border-purple-800/60 text-purple-200' : 'bg-purple-50 border-purple-200 text-purple-800'} text-[11px] sm:text-xs flex items-start space-x-2`}>
              <ShieldCheck className="w-4 h-4 flex-shrink-0 text-purple-600 mt-0.5" />
              <span>
                <strong>Administrative Ledger:</strong> The 'PAID' status indicates wage calculation finalization within internal accounting records. It does not initiate or represent an external bank or electronic payment disbursement.
              </span>
            </div>

            {/* Filter Bar */}
            <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-xs min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} space-y-3`}>
              <div className="flex items-center space-x-2 text-xs sm:text-sm font-semibold">
                <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
                <span>Payroll Report Filters</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 min-w-0">
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Pay Period</label>
                  <input
                    type="month"
                    id="filter-sal-pay-period"
                    value={salPayPeriod}
                    onChange={(e) => setSalPayPeriod(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Worker</label>
                  <select
                    id="filter-sal-worker"
                    value={salWorkerId}
                    onChange={(e) => setSalWorkerId(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Workers</option>
                    {workers.map((w) => (
                      <option key={w.workerId} value={w.workerId}>
                        {w.workerId} - {w.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-1">Status</label>
                  <select
                    id="filter-sal-status"
                    value={salStatus}
                    onChange={(e) => setSalStatus(e.target.value)}
                    className={`w-full min-w-0 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="">All Statuses</option>
                    <option value="DRAFT">DRAFT (Calculated)</option>
                    <option value="PROCESSED">PROCESSED (Approved)</option>
                    <option value="PAID">PAID (Ledger Settled)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end items-center gap-2 pt-1">
                <button
                  id="filter-sal-reset"
                  onClick={() => {
                    setSalPayPeriod('');
                    setSalWorkerId('');
                    setSalStatus('');
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg border ${
                    isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Clear Filters
                </button>
                <button
                  id="filter-sal-apply"
                  onClick={loadActiveReport}
                  className="px-4 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  Apply Filters
                </button>
              </div>
            </div>

            {/* Payroll Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 min-w-0">
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Total Slips</span>
                <span className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 block truncate">{salaryReport.summary.totalRecords}</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Overtime Pay</span>
                <span className="text-base sm:text-2xl font-bold text-blue-600 mt-0.5 sm:mt-1 block truncate font-mono">{formatINR(salaryReport.summary.totalOvertimeEarnings)}</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Deductions</span>
                <span className="text-base sm:text-2xl font-bold text-red-600 mt-0.5 sm:mt-1 block truncate font-mono">-{formatINR(salaryReport.summary.totalDeductions)}</span>
              </div>
              <div className={`p-2.5 sm:p-4 rounded-xl border min-w-0 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider block font-semibold truncate">Net Wages</span>
                <span className="text-base sm:text-2xl font-bold text-purple-600 mt-0.5 sm:mt-1 block truncate font-mono">{formatINR(salaryReport.summary.totalNetSalary)}</span>
              </div>
            </div>

            {/* Mobile Card List (< sm) */}
            <div className="block sm:hidden space-y-2.5 min-w-0">
              {salaryReport.records.length === 0 ? (
                <div className={`p-6 rounded-xl border text-center text-xs text-slate-500 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                  No salary slips match the selected filters.
                </div>
              ) : (
                salaryReport.records.map((r) => (
                  <div
                    key={r.salaryId}
                    className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} space-y-2 shadow-xs min-w-0`}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono font-bold text-xs text-amber-600 block">{r.workerId}</span>
                        <span className="font-semibold text-xs text-slate-900 dark:text-white truncate block">{r.workerName}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        r.status === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : r.status === 'PROCESSED'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1.5 border-t border-slate-100 dark:border-slate-800/60 min-w-0">
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Role</span>
                        <span className="text-slate-600 dark:text-slate-300 truncate block font-medium">{r.jobRole}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Pay Period</span>
                        <span className="font-mono text-slate-600 dark:text-slate-300 block">{r.payPeriod}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Days Attended</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">{r.daysAttended} days</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Base Pay</span>
                        <span className="font-mono text-slate-600 dark:text-slate-300 block">{formatINR(r.baseEarnings)}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Overtime</span>
                        <span className="font-mono text-blue-600 block">+{formatINR(r.overtimeEarnings)}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-medium">Net Wages</span>
                        <span className="font-mono font-bold text-purple-600 block">{formatINR(r.netSalary)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Detailed Table (>= sm) */}
            <div className={`hidden sm:block rounded-2xl border shadow-sm overflow-hidden min-w-0 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="w-full min-w-0 overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className={`text-xs uppercase border-b ${isDark ? 'bg-slate-900/60 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    <tr>
                      <th className="px-4 py-3">Worker</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Pay Period</th>
                      <th className="px-4 py-3">Days</th>
                      <th className="px-4 py-3">Base Pay</th>
                      <th className="px-4 py-3">OT Pay</th>
                      <th className="px-4 py-3">Net Salary</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {salaryReport.records.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          No salary slips match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      salaryReport.records.map((r) => (
                        <tr key={r.salaryId} className={`${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-amber-600 block">{r.workerId}</span>
                            <span className="text-xs text-slate-500">{r.workerName}</span>
                          </td>
                          <td className="px-4 py-3">{r.jobRole}</td>
                          <td className="px-4 py-3 font-mono text-xs">{r.payPeriod}</td>
                          <td className="px-4 py-3 font-semibold">{r.daysAttended}</td>
                          <td className="px-4 py-3">{formatINR(r.baseEarnings)}</td>
                          <td className="px-4 py-3 text-blue-600 font-medium">+{formatINR(r.overtimeEarnings)}</td>
                          <td className="px-4 py-3 font-bold text-purple-600">{formatINR(r.netSalary)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              r.status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : r.status === 'PROCESSED'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
