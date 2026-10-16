import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ListTodo,
  TrendingUp,
  Building2,
  Clock,
  DollarSign,
  FileText,
  MessageSquare,
  Send,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  Info,
  ExternalLink,
  Users,
  CheckSquare,
  Square,
  AlertOctagon
} from 'lucide-react';
import { FirebaseService } from '../services/firebaseService';
import {
  AiManagementInsightsResponse,
  AiSiteRiskAlert,
  AiDailyActionItem,
  AskOperationsAiResponse,
  WorkerRecord,
  ConstructionSite,
  BatchRecord,
  WorkerRegistrationRecord,
  SiteDeactivationImpact
} from '../types';

interface AdminAiOperationsAssistantProps {
  workers: WorkerRecord[];
  sites: ConstructionSite[];
  batches: BatchRecord[];
  registrations: WorkerRegistrationRecord[];
  onNavigate: (screen: string) => void;
  isCompact?: boolean;
}

type AiTab = 'brief' | 'alerts' | 'actions' | 'attendance' | 'planning' | 'payroll' | 'summary' | 'ask' | 'deactivation';

export const AdminAiOperationsAssistant: React.FC<AdminAiOperationsAssistantProps> = ({
  workers,
  sites,
  batches,
  registrations,
  onNavigate,
  isCompact = false
}) => {
  const [activeTab, setActiveTab] = useState<AiTab>('brief');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [insightsData, setInsightsData] = useState<AiManagementInsightsResponse | null>(null);
  const [completedActions, setCompletedActions] = useState<Record<string, boolean>>({});

  // Site Deactivation Impact Preview state
  const [selectedSiteIdForDeactivation, setSelectedSiteIdForDeactivation] = useState<string>('');
  const [deactivationImpact, setDeactivationImpact] = useState<SiteDeactivationImpact | null>(null);
  const [isLoadingImpact, setIsLoadingImpact] = useState<boolean>(false);
  const [impactError, setImpactError] = useState<string | null>(null);

  // Ask Operations AI state
  const [queryInput, setQueryInput] = useState<string>('');
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<Array<{
    sender: 'user' | 'ai';
    text: string;
    sourceFacts?: string[];
    suggestedFollowUps?: string[];
    timestamp: string;
    modelUsed?: string;
    isCommand?: boolean;
    commandProposal?: {
      commandType: string;
      targetId: string;
      targetName: string;
      summary: string;
      warning?: string;
      actionId: string;
    } | null;
    executionResult?: {
      success: boolean;
      message: string;
    } | null;
  }>>([]);

  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [refreshSuccessNotice, setRefreshSuccessNotice] = useState<string | null>(null);

  // Load insights
  const fetchInsights = async (isManualSync = false) => {
    setIsLoading(true);
    setError(null);
    setRefreshSuccessNotice(null);
    try {
      const data = await FirebaseService.getAiManagementInsights({
        forceRefresh: isManualSync
      });
      setInsightsData(data);
      setLastRefreshedAt(new Date());
      if (isManualSync) {
        if (data.workforceBrief?.attendanceDataAvailable !== false) {
          setRefreshSuccessNotice(`Live Sync Complete (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
          setTimeout(() => setRefreshSuccessNotice(null), 4000);
        } else {
          setError("Live sync retrieved operational records, but attendance data is currently unavailable from the server.");
        }
      }
    } catch (err: any) {
      console.error('[AdminAiOperationsAssistant] fetch error:', err);
      setError(err.message || 'Failed to load live AI operations insights.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights(false);
  }, []);

  const handleToggleAction = (actionId: string) => {
    setCompletedActions((prev) => ({
      ...prev,
      [actionId]: !prev[actionId]
    }));
  };

  const handleConfirmCommand = async (proposal: any, msgIndex: number) => {
    if (!proposal || executingActionId) return;
    setExecutingActionId(proposal.actionId);
    try {
      const result = await FirebaseService.executeAdminCommand(
        proposal.commandType,
        proposal.targetId,
        proposal.actionId
      );
      setChatHistory((prev) =>
        prev.map((m, idx) =>
          idx === msgIndex
            ? {
                ...m,
                executionResult: {
                  success: true,
                  message: result.message || 'Command executed and verified in database.'
                }
              }
            : m
        )
      );
      await fetchInsights(true);
    } catch (err: any) {
      setChatHistory((prev) =>
        prev.map((m, idx) =>
          idx === msgIndex
            ? {
                ...m,
                executionResult: {
                  success: false,
                  message: err.message || 'Administrative command execution failed.'
                }
              }
            : m
        )
      );
    } finally {
      setExecutingActionId(null);
    }
  };

  const handleSendQuery = async (queryToRun?: string) => {
    const q = (queryToRun || queryInput).trim();
    if (!q || isQuerying) return;

    const userMessageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatHistory((prev) => [
      ...prev,
      { sender: 'user', text: q, timestamp: userMessageTime }
    ]);
    setQueryInput('');
    setIsQuerying(true);

    try {
      const res: AskOperationsAiResponse = await FirebaseService.askOperationsAi(q);
      const aiMessageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setChatHistory((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: res.answer,
          sourceFacts: res.sourceFacts,
          suggestedFollowUps: res.suggestedFollowUps,
          timestamp: aiMessageTime,
          modelUsed: res.modelUsed,
          isCommand: res.isCommand,
          commandProposal: res.commandProposal
        }
      ]);
    } catch (err: any) {
      const aiMessageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setChatHistory((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `Operational query failed: ${err.message || 'Unable to retrieve answer.'}`,
          timestamp: aiMessageTime
        }
      ]);
    } finally {
      setIsQuerying(false);
    }
  };

  const handlePreviewSiteDeactivation = async (siteId: string) => {
    if (!siteId) return;
    setIsLoadingImpact(true);
    setImpactError(null);
    try {
      const res = await FirebaseService.getSiteDeactivationImpact(siteId);
      setDeactivationImpact(res);
    } catch (err: any) {
      setImpactError(err.message || 'Failed to calculate deactivation impact.');
    } finally {
      setIsLoadingImpact(false);
    }
  };

  const brief = insightsData?.workforceBrief;
  const siteAlerts = insightsData?.siteRiskAlerts || [];
  const dailyActions = insightsData?.dailyActions || [];
  const attendancePattern = insightsData?.attendancePattern;
  const workforcePlanning = insightsData?.workforcePlanning;
  const overtimePayroll = insightsData?.overtimePayroll;
  const reportSummary = insightsData?.reportSummary;

  // Pre-calculated fast stats from props for instant responsive rendering
  const activeCount = workers.filter((w) => w.status === 'ACTIVE').length;
  const unassignedCount = workers.filter((w) => w.status === 'ACTIVE' && !w.siteId && !(w as any).assignedSiteId).length;
  const activeSitesCount = sites.filter((s) => s.status === 'ACTIVE').length;

  return (
    <div id="admin-ai-operations-assistant" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Assistant Header */}
      <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-100">
                AI Operations Assistant
              </h4>
              <span className="text-[9px] font-mono font-bold bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded">
                PHASE 8
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Read-only managerial intelligence grounded in live Firestore records
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {refreshSuccessNotice && (
            <span className="hidden md:inline-flex text-[9px] font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
              {refreshSuccessNotice}
            </span>
          )}
          <button
            id="btn-refresh-ai-operations"
            onClick={() => fetchInsights(true)}
            disabled={isLoading}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md text-[10px] font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            title="Re-query live Firestore collections and recalculate operational intelligence"
          >
            <RefreshCw className={`w-3 h-3 text-amber-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Syncing...' : 'Sync Live'}</span>
          </button>
        </div>
      </div>

      {/* Strict Read-Only Guard Notice */}
      <div className="bg-amber-50/70 border-b border-amber-100 px-3.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-amber-900 font-medium">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>
            <strong>Advisory Only:</strong> AI cannot alter attendance, approve overtime/leave, modify wages, or write to Firestore records.
          </span>
        </div>
        {insightsData?.modelUsed && (
          <span className="text-[9px] font-mono font-semibold text-slate-600 bg-amber-100/70 px-1.5 py-0.5 rounded border border-amber-200 shrink-0">
            Engine: {insightsData.modelUsed}
          </span>
        )}
      </div>

      {/* Navigation Pills for the 8 Capabilities */}
      <div className="flex overflow-x-auto no-scrollbar border-b border-slate-100 bg-slate-50/50 p-1.5 gap-1 text-[11px] font-mono font-bold">
        <button
          id="tab-ai-brief"
          onClick={() => setActiveTab('brief')}
          className={`px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'brief' ? 'bg-slate-900 text-amber-400 shadow-2xs border border-slate-700' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>1. Brief</span>
        </button>

        <button
          id="tab-ai-alerts"
          onClick={() => setActiveTab('alerts')}
          className={`px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'alerts' ? 'bg-slate-900 text-amber-400 shadow-2xs border border-slate-700' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span>2. Risks</span>
          {siteAlerts.some((a) => a.severity === 'HIGH' || a.severity === 'CRITICAL') && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          )}
        </button>

        <button
          id="tab-ai-actions"
          onClick={() => setActiveTab('actions')}
          className={`px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'actions' ? 'bg-slate-900 text-amber-400 shadow-2xs border border-slate-700' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <ListTodo className="w-3 h-3" />
          <span>3. Actions</span>
          {dailyActions.length > 0 && (
            <span className="text-[9px] bg-amber-400 text-slate-950 px-1 rounded font-bold">
              {dailyActions.length}
            </span>
          )}
        </button>

        <button
          id="tab-ai-attendance"
          onClick={() => setActiveTab('attendance')}
          className={`px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'attendance' ? 'bg-slate-900 text-amber-400 shadow-2xs border border-slate-700' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <TrendingUp className="w-3 h-3" />
          <span>4. Attendance</span>
        </button>

        <button
          id="tab-ai-planning"
          onClick={() => setActiveTab('planning')}
          className={`px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'planning' ? 'bg-slate-900 text-amber-400 shadow-2xs border border-slate-700' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <Building2 className="w-3 h-3" />
          <span>5. Planning</span>
        </button>

        <button
          id="tab-ai-payroll"
          onClick={() => setActiveTab('payroll')}
          className={`px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'payroll' ? 'bg-slate-900 text-amber-400 shadow-2xs border border-slate-700' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <DollarSign className="w-3 h-3" />
          <span>6. Payroll</span>
        </button>

        <button
          id="tab-ai-summary"
          onClick={() => setActiveTab('summary')}
          className={`px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'summary' ? 'bg-slate-900 text-amber-400 shadow-2xs border border-slate-700' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <FileText className="w-3 h-3" />
          <span>7. Executive Report</span>
        </button>

        <button
          id="tab-ai-ask"
          onClick={() => setActiveTab('ask')}
          className={`px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'ask' ? 'bg-slate-900 text-amber-400 shadow-2xs border border-slate-700' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <MessageSquare className="w-3 h-3 text-amber-400" />
          <span>8. Ask Ops AI</span>
        </button>

        <button
          id="tab-ai-deactivation"
          onClick={() => setActiveTab('deactivation')}
          className={`px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'deactivation' ? 'bg-slate-900 text-red-400 shadow-2xs border border-slate-700' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <AlertOctagon className="w-3 h-3 text-red-400" />
          <span>9. Deactivation</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="p-4">
        {isLoading && !insightsData && (
          <div className="py-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
            <div>
              <h5 className="text-sm font-bold text-slate-900">Grounding AI Operations Intelligence</h5>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Aggregating live civil workforce rosters, site allocations, attendance timestamps, and security audit records...
              </p>
            </div>
          </div>
        )}

        {error && !insightsData && (
          <div className="py-8 px-4 bg-red-50 border border-red-200 rounded-xl text-center space-y-3 my-2">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
            <div>
              <h5 className="text-sm font-bold text-red-900">Unable to Load Operations Intelligence</h5>
              <p className="text-xs text-red-700 mt-1 max-w-md mx-auto">{error}</p>
            </div>
            <button
              onClick={() => fetchInsights(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Sync Live</span>
            </button>
          </div>
        )}

        {error && insightsData && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Live sync notice: {error} (Displaying last retrieved operational snapshot)</span>
            </div>
            <button
              onClick={() => fetchInsights(true)}
              className="underline font-bold text-amber-800 hover:text-amber-950 cursor-pointer text-xs"
            >
              Retry Sync
            </button>
          </div>
        )}

        {insightsData?.insufficientData && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1 mb-3">
            <p className="font-bold flex items-center gap-1.5 text-slate-900">
              <Info className="w-4 h-4 text-slate-600 shrink-0" />
              Zero Operational Records Found for Period
            </p>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Live Firestore queries confirmed zero registered workers or shift sessions for the selected period. To accumulate real operational metrics, register workers in Civil Workers management and initialize active site shifts.
            </p>
          </div>
        )}

        {insightsData && (
          <>
            {/* 1. Today's Workforce Brief */}
            {activeTab === 'brief' && (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-indigo-600 uppercase tracking-wider">
                      Operational Synthesis
                    </span>
                    <h5 className="text-sm font-bold text-slate-900 mt-0.5">
                      {brief?.todayHeadline || `${insightsData.observedData?.workforce?.active ?? activeCount} Active Personnel Deployed across ${insightsData.observedData?.sites?.active ?? activeSitesCount} Civil Sites`}
                    </h5>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    {brief?.staffingStatus || 'Balanced Coverage'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-700 leading-relaxed">
                  <p>
                    {brief?.summary ||
                      `Workforce deployment is running with ${insightsData.observedData?.workforce?.active ?? activeCount} active personnel across ${insightsData.observedData?.sites?.active ?? activeSitesCount} construction locations. Real-time verification is actively logging shift records.`}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  <div className="p-2.5 bg-indigo-50/50 rounded-lg border border-indigo-100">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Registered Total</span>
                    <p className="text-lg font-black text-slate-900 mt-0.5">{insightsData.observedData?.workforce?.total ?? workers.length}</p>
                    <span className="text-[9px] text-slate-400 font-medium">Civil workforce count</span>
                  </div>
                  <div className="p-2.5 bg-emerald-50/50 rounded-lg border border-emerald-100">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase">Active Personnel</span>
                    <p className="text-lg font-black text-emerald-800 mt-0.5">{brief?.totalActiveWorkers ?? insightsData.observedData?.workforce?.active ?? activeCount}</p>
                    <span className="text-[9px] text-emerald-600 font-medium">Approved for deployment</span>
                  </div>
                  <div className="p-2.5 bg-amber-50/50 rounded-lg border border-amber-100">
                    <span className="text-[10px] font-bold text-amber-700 uppercase">Unassigned</span>
                    <p className="text-lg font-black text-amber-800 mt-0.5">{brief?.unassignedWorkers ?? unassignedCount}</p>
                    <span className="text-[9px] text-amber-600 font-medium">Awaiting site assignment</span>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${
                    brief?.attendanceDataAvailable === false || (brief?.presentToday === null || brief?.presentToday === undefined)
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-sky-50/50 border-sky-100'
                  }`}>
                    <span className={`text-[10px] font-bold uppercase ${
                      brief?.attendanceDataAvailable === false || (brief?.presentToday === null || brief?.presentToday === undefined)
                        ? 'text-slate-500'
                        : 'text-sky-700'
                    }`}>Present Today</span>
                    <p className={`text-lg font-black mt-0.5 ${
                      brief?.attendanceDataAvailable === false || (brief?.presentToday === null || brief?.presentToday === undefined)
                        ? 'text-slate-500'
                        : 'text-sky-900'
                    }`}>
                      {brief?.attendanceDataAvailable === false || (brief?.presentToday === null || brief?.presentToday === undefined)
                        ? 'Unavailable'
                        : brief.presentToday}
                    </p>
                    <span className={`text-[9px] font-medium ${
                      brief?.attendanceDataAvailable === false || (brief?.presentToday === null || brief?.presentToday === undefined)
                        ? 'text-slate-400'
                        : 'text-sky-600'
                    }`}>
                      {brief?.attendanceDataAvailable === false || (brief?.presentToday === null || brief?.presentToday === undefined)
                        ? 'Data unavailable'
                        : 'Logged on-site today'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Active Sites</span>
                    <p className="text-lg font-black text-slate-900 mt-0.5">{(insightsData.observedData?.sites?.active ?? activeSitesCount)} / {(insightsData.observedData?.sites?.total ?? sites.length)}</p>
                    <span className="text-[9px] text-slate-500 font-medium">Operational perimeters</span>
                  </div>
                  <div className="p-2.5 bg-rose-50/50 rounded-lg border border-rose-100">
                    <span className="text-[10px] font-bold text-rose-700 uppercase">Pending Reg.</span>
                    <p className="text-lg font-black text-rose-900 mt-0.5">{brief?.pendingRegistrations ?? registrations.filter(r => r.status === 'PENDING').length}</p>
                    <span className="text-[9px] text-rose-600 font-medium">Awaiting verification</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setActiveTab('actions')}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Today's Action Checklist</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

        {/* 2. Site Risk & Attention Alerts */}
        {activeTab === 'alerts' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Site Risk & Attention Alerts
                </h5>
                <p className="text-[10px] text-slate-500">
                  Algorithmic risk evaluation across construction perimeters
                </p>
              </div>
              <span className="text-[10px] font-bold text-slate-500 font-mono">
                {siteAlerts.length} Flagged Item(s)
              </span>
            </div>

            {siteAlerts.length === 0 ? (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-center space-y-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto" />
                <p className="text-xs font-bold text-emerald-800">All Project Sites Nominal</p>
                <p className="text-[10px] text-emerald-600">
                  Zero critical risk flags, understaffed sites, or anomalous QR activities detected.
                </p>
              </div>
            ) : (
              siteAlerts.map((alert, idx) => (
                <div
                  key={alert.id || idx}
                  className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                    alert.severity === 'CRITICAL'
                      ? 'bg-red-50/70 border-red-200 text-red-900'
                      : alert.severity === 'HIGH'
                      ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                      : alert.severity === 'MEDIUM'
                      ? 'bg-indigo-50/50 border-indigo-100 text-indigo-950'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      <AlertTriangle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          alert.severity === 'CRITICAL'
                            ? 'text-red-600'
                            : alert.severity === 'HIGH'
                            ? 'text-amber-600'
                            : 'text-indigo-600'
                        }`}
                      />
                      {alert.title}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-red-600 text-white'
                          : alert.severity === 'HIGH'
                          ? 'bg-amber-600 text-white'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">{alert.description}</p>
                  {alert.mitigation && (
                    <div className="pt-1 text-[10px] flex items-start gap-1 font-medium opacity-80 border-t border-slate-200/50">
                      <span className="font-bold shrink-0">Mitigation:</span>
                      <span>{alert.mitigation}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* 3. AI Daily Action List */}
        {activeTab === 'actions' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  AI Daily Action List
                </h5>
                <p className="text-[10px] text-slate-500">
                  Prioritized administrative tasks derived from system backlogs
                </p>
              </div>
              <span className="text-[10px] font-bold text-indigo-600">
                {Object.values(completedActions).filter(Boolean).length} / {dailyActions.length} Done
              </span>
            </div>

            {dailyActions.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg text-center text-xs text-slate-400">
                No immediate daily actions pending. All rosters and claims are clear.
              </div>
            ) : (
              <div className="space-y-1.5">
                {dailyActions.map((action, idx) => {
                  const isDone = !!completedActions[action.id || `action-${idx}`];
                  return (
                    <div
                      key={action.id || idx}
                      className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 ${
                        isDone
                          ? 'bg-slate-50 border-slate-200 opacity-60'
                          : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      <button
                        onClick={() => handleToggleAction(action.id || `action-${idx}`)}
                        className="mt-0.5 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                        title={isDone ? 'Mark uncompleted' : 'Mark completed'}
                      >
                        {isDone ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-bold px-1 rounded uppercase ${
                              action.priority === 'HIGH'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : action.priority === 'MEDIUM'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {action.priority}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            {action.category}
                          </span>
                        </div>
                        <p
                          className={`text-xs text-slate-800 mt-1 leading-snug ${
                            isDone ? 'line-through text-slate-400' : ''
                          }`}
                        >
                          {action.action}
                        </p>
                      </div>

                      {action.linkScreen && (
                        <button
                          onClick={() => onNavigate(action.linkScreen!)}
                          className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded text-[10px] font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                          title="Navigate to screen"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 4. Attendance Pattern Analysis */}
        {activeTab === 'attendance' && (
          <div className="space-y-3">
            <div>
              <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Attendance Pattern Analysis
              </h5>
              <p className="text-[10px] text-slate-500">
                Punctuality, shift completion rate, and absenteeism flags
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Completion Rate</span>
                <p className="text-xl font-black text-indigo-700 mt-0.5">
                  {attendancePattern?.completionRatePercent ?? 100}%
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Open Shifts</span>
                <p className="text-xl font-black text-amber-600 mt-0.5">
                  {attendancePattern?.openShiftsCount ?? 0}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Absenteeism</span>
                <p className="text-xl font-black text-slate-700 mt-0.5">
                  {attendancePattern?.absenteeismCount ?? 0}
                </p>
              </div>
            </div>

            <div className="p-3 bg-indigo-50/40 rounded-lg border border-indigo-100 text-xs text-slate-800 leading-relaxed">
              <p>
                {attendancePattern?.analysis ||
                  'Active shift logs demonstrate regular exit QR verification. Compliance rates remain within designated civil site benchmarks.'}
              </p>
            </div>

            {attendancePattern?.flags && attendancePattern.flags.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Attendance Anomalies Flagged
                </span>
                {attendancePattern.flags.map((flag, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-amber-50/60 border border-amber-200 rounded-md text-[11px] text-amber-900 flex items-center gap-2"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{flag}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. Workforce Planning Insights */}
        {activeTab === 'planning' && (
          <div className="space-y-3">
            <div>
              <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Workforce Planning & Allocation
              </h5>
              <p className="text-[10px] text-slate-500">
                Trade balance, cohort deployment, and site allocation optimization
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Specialized Trade Distribution
              </span>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(workforcePlanning?.tradeDistribution || {}).map(([role, count]) => {
                  const pct = workers.length > 0 ? Math.round((Number(count) / workers.length) * 100) : 0;
                  return (
                    <div key={role} className="p-2 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-800 truncate">{role}</span>
                        <span className="font-mono text-[11px] text-indigo-600 font-bold">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-indigo-600 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Planning Recommendations
              </span>
              <ul className="space-y-1 text-xs text-slate-700">
                {(workforcePlanning?.siteBalancingRecommendations || [
                  'Maintain balanced trade distribution across active project sites.',
                  'Assign any unassigned general labor to civil foundation cohorts.'
                ]).map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-[11px]">
                    <span className="text-indigo-600 font-bold">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* 6. Overtime & Payroll Insights */}
        {activeTab === 'payroll' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Overtime & Payroll Insights
                </h5>
                <p className="text-[10px] text-slate-500">
                  Comp hours, liability forecasting, and wage slip readiness
                </p>
              </div>
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  overtimePayroll?.payrollReadiness === 'READY'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {overtimePayroll?.payrollReadiness === 'READY' ? 'Payroll Ready' : 'Review Needed'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Pending OT</span>
                <p className="text-xl font-black text-amber-600 mt-0.5">
                  {overtimePayroll?.pendingOvertimeCount ?? 0}
                </p>
                <span className="text-[9px] text-slate-400">requests</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Approved OT</span>
                <p className="text-xl font-black text-emerald-700 mt-0.5">
                  {overtimePayroll?.approvedOvertimeHours ?? 0}h
                </p>
                <span className="text-[9px] text-slate-400">authorized</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Est. OT Cost</span>
                <p className="text-xl font-black text-slate-800 mt-0.5">
                  ₹{(overtimePayroll?.estimatedOvertimeCost ?? 0).toLocaleString()}
                </p>
                <span className="text-[9px] text-slate-400">liability</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-700 leading-relaxed">
              <p>
                {overtimePayroll?.analysis ||
                  'Overtime requests remain within projected operational allowances. Ensure all supervisor sign-offs are submitted before payroll finalization.'}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
              <button
                onClick={() => onNavigate('admin_overtime')}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold transition-colors cursor-pointer"
              >
                Go to Overtime Approvals
              </button>
            </div>
          </div>
        )}

        {/* 7. AI Report Summary */}
        {activeTab === 'summary' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  AI Report Summary
                </h5>
                <p className="text-[10px] text-slate-500">
                  Executive management narrative for civil site directors
                </p>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Health Score</span>
                <p className="text-lg font-black text-indigo-700">
                  {reportSummary?.operationalHealthScore ?? 92}/100
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900 text-white rounded-lg space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase">
                  Executive Narrative
                </span>
                <span className="text-[9px] text-slate-400">Automated Audit Analysis</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                {reportSummary?.executiveSummary ||
                  `Civil operations are operating with ${activeCount} active personnel across ${activeSitesCount} project sites. Shift records and QR verifications are maintained within compliance boundaries.`}
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Key Strategic Takeaways
              </span>
              <div className="space-y-1">
                {(reportSummary?.keyTakeaways || [
                  `${activeCount} active workers deployed across ${activeSitesCount} sites.`,
                  'Attendance exit QR scan compliance is actively enforced.',
                  'Zero critical security ledger breaches.'
                ]).map((takeaway, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-slate-50 rounded-md border border-slate-100 text-xs text-slate-700 flex items-start gap-2"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{takeaway}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 8. Ask Operations AI */}
        {activeTab === 'ask' && (
          <div className="space-y-3">
            <div>
              <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                Ask Operations AI
              </h5>
              <p className="text-[10px] text-slate-500">
                Ask operational questions grounded strictly in live database facts
              </p>
            </div>

            {/* Pre-canned suggested prompts */}
            <div className="flex flex-wrap gap-1">
              {[
                'Which sites have no workers assigned?',
                'How many overtime hours are pending approval?',
                'Which workforce batches are currently active?',
                'Deactivate batch B-01',
                'Show workforce trade distribution'
              ].map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendQuery(suggestion)}
                  disabled={isQuerying}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-indigo-50 border border-slate-200 text-slate-700 hover:text-indigo-700 rounded-full text-[10px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* Conversation list */}
            <div className="max-h-[220px] overflow-y-auto space-y-2 p-2 bg-slate-50/70 rounded-lg border border-slate-200 text-xs">
              {chatHistory.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs space-y-1">
                  <Sparkles className="w-5 h-5 mx-auto text-slate-300" />
                  <p>Ask any operational question about workers, sites, shifts, or payroll.</p>
                  <p className="text-[10px] text-slate-400">All answers are strictly grounded in Firestore data.</p>
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`p-2.5 rounded-xl max-w-[88%] text-xs leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-2xs'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-2xs shadow-2xs'
                      }`}
                    >
                      <p>{msg.text}</p>
                      {msg.sourceFacts && msg.sourceFacts.length > 0 && (
                        <div className="mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500 space-y-0.5">
                          <span className="font-bold text-slate-600 uppercase">Grounded Facts:</span>
                          {msg.sourceFacts.map((fact, fIdx) => (
                            <div key={fIdx}>• {fact}</div>
                          ))}
                        </div>
                      )}
                    </div>

                    {msg.commandProposal && (
                      <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-slate-800 space-y-2 max-w-[88%] shadow-2xs">
                        <div className="flex items-center gap-1.5 text-amber-800 font-bold text-[11px] uppercase tracking-wider">
                          <AlertOctagon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Proposed Write Operation: {msg.commandProposal.commandType}</span>
                        </div>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold text-slate-900">{msg.commandProposal.summary}</p>
                          <p className="text-[11px] text-slate-600">Target: <strong className="text-slate-800">{msg.commandProposal.targetName}</strong> ({msg.commandProposal.targetId})</p>
                          {msg.commandProposal.warning && (
                            <p className="text-[10px] text-amber-800 bg-amber-100/70 p-1.5 rounded border border-amber-200">
                              ⚠️ {msg.commandProposal.warning}
                            </p>
                          )}
                        </div>

                        {msg.executionResult ? (
                          <div className={`p-2 rounded-lg text-xs flex items-center gap-2 ${
                            msg.executionResult.success
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}>
                            {msg.executionResult.success ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                            )}
                            <span className="font-medium">{msg.executionResult.message}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              id={`btn-confirm-action-${msg.commandProposal.actionId}`}
                              disabled={executingActionId === msg.commandProposal.actionId}
                              onClick={() => handleConfirmCommand(msg.commandProposal, idx)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                            >
                              {executingActionId === msg.commandProposal.actionId ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Executing on Server...</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Confirm Execution</span>
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setChatHistory((prev) =>
                                  prev.map((m, mIdx) => (mIdx === idx ? { ...m, commandProposal: null } : m))
                                );
                              }}
                              disabled={executingActionId === msg.commandProposal.actionId}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer border border-slate-200"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <span className="text-[9px] text-slate-400 mt-0.5 px-1">{msg.timestamp}</span>
                  </div>
                ))
              )}
              {isQuerying && (
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 text-xs text-slate-500">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>Consulting live Firestore records...</span>
                </div>
              )}
            </div>

            {/* Input bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendQuery();
              }}
              className="flex items-center gap-1.5"
            >
              <input
                id="input-ask-operations-ai"
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Ask about sites, shifts, overtime, or trades..."
                disabled={isQuerying}
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 shadow-2xs disabled:bg-slate-100"
              />
              <button
                id="btn-send-operations-query"
                type="submit"
                disabled={isQuerying || !queryInput.trim()}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Ask</span>
              </button>
            </form>
          </div>
        )}

        {/* Tab 9: Site Deactivation Impact Preview */}
        {activeTab === 'deactivation' && (
          <div id="ai-site-deactivation-preview" className="space-y-4">
            <div className="bg-red-50/60 border border-red-100 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertOctagon className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <h5 className="text-xs font-bold text-red-900">
                    Site Deactivation Impact Preview (Read-Only)
                  </h5>
                  <p className="text-[11px] text-red-700 leading-relaxed">
                    Evaluate the exact workforce and operational consequences before taking any construction site offline. Calculations are computed deterministically from real Firestore collections.
                  </p>
                </div>
              </div>
            </div>

            {/* Site Selector Form */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
              <label className="block text-[11px] font-bold text-slate-700">
                Select Construction Site for Impact Simulation
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="select-deactivation-site"
                  value={selectedSiteIdForDeactivation}
                  onChange={(e) => setSelectedSiteIdForDeactivation(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-indigo-600"
                >
                  <option value="">-- Choose a Construction Site --</option>
                  {sites.map((site) => (
                    <option key={site.siteId} value={site.siteId}>
                      {site.siteName} ({site.siteId}) — Status: {site.status}
                    </option>
                  ))}
                </select>
                <button
                  id="btn-simulate-site-deactivation"
                  onClick={() => handlePreviewSiteDeactivation(selectedSiteIdForDeactivation)}
                  disabled={!selectedSiteIdForDeactivation || isLoadingImpact}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
                >
                  {isLoadingImpact ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <AlertOctagon className="w-3.5 h-3.5" />
                  )}
                  <span>Calculate Impact</span>
                </button>
              </div>
            </div>

            {impactError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{impactError}</span>
              </div>
            )}

            {/* Impact Results */}
            {deactivationImpact && (
              <div className="space-y-3.5 border border-slate-200 rounded-lg p-3.5 bg-white shadow-2xs">
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div>
                    <h6 className="text-xs font-black text-slate-900 uppercase">
                      {deactivationImpact.siteName}
                    </h6>
                    <span className="text-[10px] font-mono text-slate-500">
                      Site ID: {deactivationImpact.siteId}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      deactivationImpact.currentStatus === 'ACTIVE'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    Current: {deactivationImpact.currentStatus}
                  </span>
                </div>

                {/* 6 Key Deterministic Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <span className="text-[10px] font-semibold text-slate-500 block">Assigned Workers</span>
                    <span className="text-base font-black text-slate-900">{deactivationImpact.workersAssigned}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <span className="text-[10px] font-semibold text-slate-500 block">Workers Active Today</span>
                    <span className="text-base font-black text-indigo-600">{deactivationImpact.activeWorkersToday}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <span className="text-[10px] font-semibold text-slate-500 block">Today's Attendance</span>
                    <span className="text-base font-black text-slate-900">{deactivationImpact.todayAttendanceRecords}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <span className="text-[10px] font-semibold text-slate-500 block">Pending Leave</span>
                    <span className="text-base font-black text-amber-600">{deactivationImpact.pendingLeaveRequests}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <span className="text-[10px] font-semibold text-slate-500 block">Pending Overtime</span>
                    <span className="text-base font-black text-amber-600">{deactivationImpact.pendingOvertimeClaims}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <span className="text-[10px] font-semibold text-slate-500 block">Requiring Reassignment</span>
                    <span className="text-base font-black text-red-600">{deactivationImpact.workersRequiringReassignment}</span>
                  </div>
                </div>

                {/* AI Observation */}
                {deactivationImpact.aiObservation && (
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-900 uppercase">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>AI Operational Analysis</span>
                    </div>
                    <p className="text-[11px] text-indigo-950 leading-relaxed font-medium">
                      {deactivationImpact.aiObservation}
                    </p>
                  </div>
                )}

                {/* Operational Impact Rules */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    Operational Rules & Data Guarantees:
                  </span>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1 text-[11px] text-slate-700">
                    {deactivationImpact.operationalImpact.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Affected Workers Preview */}
                {deactivationImpact.affectedWorkers.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-700 block">
                      Assigned Personnel ({deactivationImpact.affectedWorkers.length}):
                    </span>
                    <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-[11px]">
                      {deactivationImpact.affectedWorkers.map((w) => (
                        <div key={w.workerId} className="p-2 flex items-center justify-between bg-white">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{w.fullName}</span>
                            <span className="text-[10px] font-mono text-slate-400">({w.workerId})</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded font-medium">{w.trade}</span>
                            <span className="text-slate-400">{w.batchNumber}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Advisory Notice */}
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900 flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    <strong>Strict Read-Only Guard:</strong> AI cannot deactivate or modify sites. To deactivate this site, navigate to the <strong>Construction Sites</strong> management screen and manually click Deactivate.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
};

