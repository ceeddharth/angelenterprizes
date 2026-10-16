import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  BrainCircuit,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  Lock,
  Eye,
  AlertOctagon,
  KeyRound,
  FileWarning,
  Sparkles,
  Info,
  CheckCircle2,
  Clock,
  UserCheck,
  Building2,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import {
  AdminAccount,
  SecurityEventRecord,
  SuspiciousAlert,
  SecurityDashboardData,
  AiManagementInsightsResponse
} from '../types';
import { FirebaseService } from '../services/firebaseService';

interface AdminSecurityDashboardProps {
  currentAdmin: AdminAccount | null;
  onBack?: () => void;
}

export const AdminSecurityDashboard: React.FC<AdminSecurityDashboardProps> = ({
  currentAdmin,
  onBack
}) => {
  const [activeTab, setActiveTab] = useState<'MONITOR' | 'AI_INSIGHTS'>('MONITOR');

  // Security Monitoring State
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);
  const [eventsData, setEventsData] = useState<SecurityDashboardData | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);

  // Filter State
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterEventType, setFilterEventType] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterWorkerId, setFilterWorkerId] = useState<string>('');
  const [filterSiteId, setFilterSiteId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // AI Insights State
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<AiManagementInsightsResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiStartDate, setAiStartDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [aiEndDate, setAiEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>({});

  const loadSecurityEvents = async () => {
    setLoadingEvents(true);
    setEventError(null);
    try {
      const data = await FirebaseService.getSecurityEvents({
        severity: filterSeverity || undefined,
        eventType: filterEventType || undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        workerId: filterWorkerId.trim() || undefined,
        siteId: filterSiteId.trim() || undefined,
        limit: 100
      });
      setEventsData(data);
    } catch (err: any) {
      setEventError(err.message || 'Failed to load security events.');
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadSecurityEvents();
  }, [filterSeverity, filterEventType]);

  // Non-blocking temporary notification auto-dismiss (3000ms)
  useEffect(() => {
    if (!eventError) return;
    const timer = setTimeout(() => setEventError(null), 3000);
    return () => clearTimeout(timer);
  }, [eventError]);

  useEffect(() => {
    if (!aiError) return;
    const timer = setTimeout(() => setAiError(null), 3000);
    return () => clearTimeout(timer);
  }, [aiError]);

  const handleGenerateAiInsights = async () => {
    if (currentAdmin?.role !== 'ADMIN') {
      setAiError('Access denied: Administrator role required for AI Management Insights.');
      return;
    }
    setLoadingAi(true);
    setAiError(null);
    try {
      const res = await FirebaseService.getAiManagementInsights({
        startDate: aiStartDate || undefined,
        endDate: aiEndDate || undefined
      });
      setAiResult(res);
    } catch (err: any) {
      setAiError(err.message || 'Failed to generate AI management insights.');
    } finally {
      setLoadingAi(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'WARNING':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'INFO':
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const filteredEventsList = (eventsData?.recentEvents || []).filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (e.eventId && e.eventId.toLowerCase().includes(q)) ||
      (e.eventType && e.eventType.toLowerCase().includes(q)) ||
      (e.workerId && e.workerId.toLowerCase().includes(q)) ||
      (e.siteId && e.siteId.toLowerCase().includes(q)) ||
      (e.actorUid && e.actorUid.toLowerCase().includes(q)) ||
      (e.source && e.source.toLowerCase().includes(q))
    );
  });

  return (
    <div id="admin-security-dashboard" className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <span className="text-[10px] font-mono text-amber-500 font-bold uppercase tracking-wider block leading-none mb-1">Civil Defense & Auditing</span>
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-slate-950 text-amber-400 rounded-lg border border-slate-800">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Security Audit & AI Intelligence</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Server-Authoritative Threat Monitoring, Anomaly Detection & AI Management Insights
          </p>
        </div>

        {/* Tab Selector Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            id="tab-security-monitor"
            onClick={() => setActiveTab('MONITOR')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-md transition-colors cursor-pointer ${
              activeTab === 'MONITOR'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            Security Monitor
          </button>
          <button
            id="tab-ai-insights"
            onClick={() => setActiveTab('AI_INSIGHTS')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-md transition-colors cursor-pointer ${
              activeTab === 'AI_INSIGHTS'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            AI Insights
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SECURITY EVENT MONITOR */}
      {/* ========================================================================= */}
      {activeTab === 'MONITOR' && (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Total Events</span>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {eventsData?.summary?.totalEvents ?? 0}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-red-200 shadow-xs bg-red-50/20">
              <span className="text-xs font-medium text-red-600">Critical Alerts</span>
              <p className="text-xl font-bold text-red-700 mt-1">
                {eventsData?.summary?.criticalCount ?? 0}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-orange-200 shadow-xs bg-orange-50/20">
              <span className="text-xs font-medium text-orange-600">High Severity</span>
              <p className="text-xl font-bold text-orange-700 mt-1">
                {eventsData?.summary?.highCount ?? 0}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-xs bg-amber-50/20">
              <span className="text-xs font-medium text-amber-600">Warnings</span>
              <p className="text-xl font-bold text-amber-700 mt-1">
                {eventsData?.summary?.warningCount ?? 0}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500">QR Anomalies</span>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {eventsData?.summary?.qrAnomalies ?? 0}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Auth Failures</span>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {eventsData?.summary?.authFailures ?? 0}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Unauthorized</span>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {eventsData?.summary?.unauthorizedRequests ?? 0}
              </p>
            </div>
          </div>

          {/* Active Suspicious Alerts Section */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-red-600" />
                <h2 className="text-base font-semibold text-slate-900">
                  Suspicious Activity Alerts (Last 24 Hours)
                </h2>
              </div>
              <span className="text-xs text-slate-500">Auto-evaluated against system thresholds</span>
            </div>

            {eventsData?.activeAlerts && eventsData.activeAlerts.length > 0 ? (
              <div className="space-y-3">
                {eventsData.activeAlerts.map((alert, idx) => (
                  <div
                    key={alert.alertId || idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-red-50/50 border border-red-200 rounded-lg gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-red-200 text-red-900">
                            {alert.pattern}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded border font-semibold ${getSeverityBadge(
                              alert.severity
                            )}`}
                          >
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-slate-800 mt-1 font-medium">{alert.description}</p>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1.5">
                          {alert.affectedWorkerId && <span>Worker: {alert.affectedWorkerId}</span>}
                          {alert.affectedSiteId && <span>Site: {alert.affectedSiteId}</span>}
                          <span>
                            Count: {alert.eventCount} in {alert.windowMinutes}m window
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 font-mono shrink-0">
                      {new Date(alert.triggeredAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>All security indicators normal. No suspicious threshold breaches triggered.</span>
              </div>
            )}
          </div>

          {/* Filter Bar & Controls */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search events by ID, worker, site, actor, or type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadSecurityEvents}
                  disabled={loadingEvents}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingEvents ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Granular Filters */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Severity</label>
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="w-full text-xs py-1.5 px-2 rounded border border-slate-200 bg-white"
                >
                  <option value="">All Severities</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="WARNING">WARNING</option>
                  <option value="INFO">INFO</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Event Type</label>
                <select
                  value={filterEventType}
                  onChange={(e) => setFilterEventType(e.target.value)}
                  className="w-full text-xs py-1.5 px-2 rounded border border-slate-200 bg-white"
                >
                  <option value="">All Event Types</option>
                  <option value="UNAUTHORIZED_ACCESS">UNAUTHORIZED_ACCESS</option>
                  <option value="FORGED_QR">FORGED_QR</option>
                  <option value="EXPIRED_QR">EXPIRED_QR</option>
                  <option value="WRONG_SITE_QR">WRONG_SITE_QR</option>
                  <option value="SUSPENDED_WORKER_ATTEMPT">SUSPENDED_WORKER_ATTEMPT</option>
                  <option value="DUPLICATE_ATTENDANCE">DUPLICATE_ATTENDANCE</option>
                  <option value="AUTH_FAILURE">AUTH_FAILURE</option>
                  <option value="AUTH_SUCCESS">AUTH_SUCCESS</option>
                  <option value="SUSPICIOUS_THRESHOLD_TRIGGERED">SUSPICIOUS_TRIGGER</option>
                  <option value="AI_INSIGHT_REQUESTED">AI_INSIGHT_REQUESTED</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full text-xs py-1.5 px-2 rounded border border-slate-200 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full text-xs py-1.5 px-2 rounded border border-slate-200 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Worker ID</label>
                <input
                  type="text"
                  placeholder="e.g. W-1001"
                  value={filterWorkerId}
                  onChange={(e) => setFilterWorkerId(e.target.value)}
                  className="w-full text-xs py-1.5 px-2 rounded border border-slate-200 bg-white"
                />
              </div>

              <div className="flex items-end gap-1">
                <button
                  onClick={loadSecurityEvents}
                  className="w-full text-xs py-1.5 px-3 bg-slate-900 text-white rounded hover:bg-slate-800 font-medium"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>

          {/* Security Events Log Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">
                Security Audit Log ({filteredEventsList.length} records)
              </h3>
              <span className="text-xs text-slate-500">Immutable server-authored event ledger</span>
            </div>

            {loadingEvents ? (
              <div className="p-12 text-center text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                <p className="text-sm">Loading security events...</p>
              </div>
            ) : filteredEventsList.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p className="text-sm">No security events found matching criteria.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Severity</th>
                      <th className="py-2.5 px-3">Event Type</th>
                      <th className="py-2.5 px-3">Result</th>
                      <th className="py-2.5 px-3">Actor / Role</th>
                      <th className="py-2.5 px-3">Worker / Site</th>
                      <th className="py-2.5 px-3">Source</th>
                      <th className="py-2.5 px-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {filteredEventsList.map((e) => (
                      <tr key={e.eventId} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-mono whitespace-nowrap text-slate-500">
                          {e.timestamp ? new Date(e.timestamp).toLocaleString() : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded border font-semibold text-[10px] ${getSeverityBadge(
                              e.severity
                            )}`}
                          >
                            {e.severity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-900">
                          {e.eventType}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              e.result === 'SUCCESS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {e.result}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-mono text-slate-700">
                            {e.actorUid?.length > 10 ? `${e.actorUid.slice(0, 8)}...` : e.actorUid}
                          </span>
                          <span className="ml-1 text-[10px] text-slate-400">({e.actorRole})</span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {e.workerId && <span className="font-semibold text-slate-800">{e.workerId}</span>}
                          {e.workerId && e.siteId && <span className="mx-1 text-slate-400">/</span>}
                          {e.siteId && <span className="text-slate-600">{e.siteId}</span>}
                          {!e.workerId && !e.siteId && <span className="text-slate-400">-</span>}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                          {e.source || 'SYSTEM'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">
                          {e.metadata?.reason ||
                            e.metadata?.description ||
                            (e.metadata ? JSON.stringify(e.metadata).slice(0, 60) : '-')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Documented Suspicious Thresholds Reference Card */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-700" />
              Documented Deterministic Suspicious Thresholds
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              The backend detection engine evaluates failure patterns deterministically against these
              auditable parameters without arbitrary heuristics:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(eventsData?.thresholds || [
                {
                  name: 'Repeated Forged / Invalid QR',
                  threshold: '≥ 3 attempts',
                  window: '10 minutes',
                  severity: 'CRITICAL',
                  description: 'Invalid HMAC signatures or malformed tokens'
                },
                {
                  name: 'Repeated Wrong-Site Scans',
                  threshold: '≥ 3 attempts',
                  window: '10 minutes',
                  severity: 'HIGH',
                  description: 'Worker scanning kiosk for unassigned site'
                },
                {
                  name: 'Unauthorized Admin Endpoint Access',
                  threshold: '≥ 3 attempts',
                  window: '10 minutes',
                  severity: 'CRITICAL',
                  description: 'Non-admin or unauthenticated access attempts'
                },
                {
                  name: 'Duplicate Attendance Spikes',
                  threshold: '≥ 3 attempts',
                  window: '10 minutes',
                  severity: 'WARNING',
                  description: 'Repeated check-ins for active or finished shifts'
                },
                {
                  name: 'Suspended Worker Attendance Attempts',
                  threshold: '≥ 2 attempts',
                  window: '10 minutes',
                  severity: 'CRITICAL',
                  description: 'Deactivated or suspended worker attempting check-in'
                }
              ]).map((rule, idx) => (
                <div
                  key={idx}
                  className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{rule.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${getSeverityBadge(
                        rule.severity
                      )}`}
                    >
                      {rule.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">
                    Threshold: <span className="text-slate-800 font-semibold">{rule.threshold}</span> ({rule.window})
                  </p>
                  <p className="text-[11px] text-slate-600">{rule.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: AI MANAGEMENT INSIGHTS */}
      {/* ========================================================================= */}
      {activeTab === 'AI_INSIGHTS' && (
        currentAdmin?.role !== 'ADMIN' ? (
          <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-xs my-6">
            <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">Administrator Role Required</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              AI Management Insights and automated operational threat analysis are strictly restricted to system Administrator accounts. Site Supervisors cannot access AI intelligence.
            </p>
          </div>
        ) : (
        <div className="space-y-6">
          {/* Human-In-The-Loop Disclaimer Banner */}
          <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-indigo-900">
                Assistive Analytics & Human Authority Directive
              </h3>
              <p className="text-xs text-indigo-800 leading-relaxed">
                AI insights are strictly assistive observations derived from factual application
                statistics. AI is prohibited from autonomously executing worker approvals,
                rejections, suspensions, shift modifications, leave grants, or salary updates. All
                operational decisions remain under the authoritative command of human administrators.
              </p>
            </div>
          </div>

          {/* Period Selector & Trigger Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Analysis Start Date
                  </label>
                  <input
                    type="date"
                    value={aiStartDate}
                    onChange={(e) => setAiStartDate(e.target.value)}
                    className="text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Analysis End Date
                  </label>
                  <input
                    type="date"
                    value={aiEndDate}
                    onChange={(e) => setAiEndDate(e.target.value)}
                    className="text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <button
                id="btn-generate-ai-insights"
                onClick={handleGenerateAiInsights}
                disabled={loadingAi}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition-colors shadow-xs disabled:opacity-50"
              >
                {loadingAi ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analyzing Operational Data...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate AI Insights</span>
                  </>
                )}
              </button>
            </div>

            {aiError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{aiError}</span>
              </div>
            )}
          </div>

          {/* Results Display */}
          {aiResult && (
            <div className="space-y-6">
              {/* Today's Workforce Brief Card */}
              {aiResult.workforceBrief ? (
                <div className="bg-gradient-to-r from-indigo-900 to-slate-900 rounded-xl p-5 text-white shadow-md border border-indigo-700/50">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-slate-950">
                          Today's Workforce Brief
                        </span>
                        <span className="text-xs text-indigo-200">
                          Live Construction Intelligence
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-white mt-1">
                        {aiResult.workforceBrief.todayHeadline}
                      </h3>
                      <p className="text-xs text-indigo-200/90 leading-relaxed max-w-2xl">
                        {aiResult.workforceBrief.summary}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="px-3.5 py-2 rounded-lg bg-white/10 border border-white/10 text-center">
                        <span className="text-[10px] text-indigo-200 block uppercase font-medium">On-Duty Shifts</span>
                        <span className="text-xl font-black text-amber-300">
                          {aiResult.workforceBrief.activeDeployments}
                        </span>
                      </div>
                      <div className="px-3.5 py-2 rounded-lg bg-white/10 border border-white/10 text-center">
                        <span className="text-[10px] text-indigo-200 block uppercase font-medium">Shift Completion</span>
                        <span className="text-xl font-black text-emerald-300">
                          {aiResult.workforceBrief.completionRate}%
                        </span>
                      </div>
                      <div className="px-3.5 py-2 rounded-lg bg-white/10 border border-white/10 text-center">
                        <span className="text-[10px] text-indigo-200 block uppercase font-medium">Staffing Alert</span>
                        <span className="text-xs font-bold text-amber-200 block mt-1">
                          {aiResult.workforceBrief.staffingStatus}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Ground-Truth Observed Data Facts */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                      Ground-Truth Observed Facts
                    </h3>
                    <p className="text-xs text-slate-500">
                      Factual database aggregation ({aiResult.period.startDate} to {aiResult.period.endDate})
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-slate-100 rounded font-mono text-slate-700">
                    Model: {aiResult.modelUsed || 'gemini-3.8-flash'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 text-center">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-medium text-slate-500 block">Workforce</span>
                    <span className="text-lg font-bold text-slate-900 mt-1 block">
                      {aiResult.observedData.workforce.total}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-semibold">
                      {aiResult.observedData.workforce.active} active
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-medium text-slate-500 block">Sites</span>
                    <span className="text-lg font-bold text-slate-900 mt-1 block">
                      {aiResult.observedData.sites.total}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-semibold">
                      {aiResult.observedData.sites.active} active
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-medium text-slate-500 block">Attendance</span>
                    <span className="text-lg font-bold text-slate-900 mt-1 block">
                      {aiResult.observedData.attendance.totalRecords}
                    </span>
                    <span className="text-[10px] text-blue-600 font-semibold">
                      {aiResult.observedData.attendance.completionRatePercent}% completed
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-medium text-slate-500 block">Overtime</span>
                    <span className="text-lg font-bold text-slate-900 mt-1 block">
                      {aiResult.observedData.overtime.approvedHours}h
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {aiResult.observedData.overtime.totalRequests} reqs
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-medium text-slate-500 block">Leave</span>
                    <span className="text-lg font-bold text-slate-900 mt-1 block">
                      {aiResult.observedData.leave.approvedDays}d
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {aiResult.observedData.leave.totalRequests} reqs
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-medium text-slate-500 block">Payroll</span>
                    <span className="text-lg font-bold text-slate-900 mt-1 block">
                      ₹{aiResult.observedData.payroll.totalNetSalary.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {aiResult.observedData.payroll.recordsCount} records
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-medium text-slate-500 block">Security</span>
                    <span className="text-lg font-bold text-slate-900 mt-1 block">
                      {aiResult.observedData.security.totalEvents}
                    </span>
                    <span className="text-[10px] text-red-600 font-semibold">
                      {aiResult.observedData.security.highOrCriticalAlerts} alerts
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Analytical Insights Section */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-base font-bold text-slate-900">
                    AI Managerial Observations
                  </h3>
                </div>

                {aiResult.insufficientData ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>
                      Insufficient data for this insight. No workforce or attendance records found for
                      the selected period.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiResult.aiInsights.map((insight, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-slate-800">{insight.topic}</h4>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${
                              insight.severity === 'CRITICAL'
                                ? 'bg-red-100 text-red-800 border-red-200'
                                : insight.severity === 'ATTENTION'
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-blue-100 text-blue-800 border-blue-200'
                            }`}
                          >
                            {insight.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{insight.observation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recommendations & Daily Action List Section */}
              {aiResult.recommendations && aiResult.recommendations.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Daily Action List for Site Admin (Assistive Tasks)
                    </h3>
                    <span className="text-xs text-slate-500">
                      {Object.values(completedActions).filter(Boolean).length} of {aiResult.recommendations.length} completed
                    </span>
                  </div>

                  <ul className="space-y-2.5">
                    {aiResult.recommendations.map((rec, idx) => {
                      const isDone = !!completedActions[idx];
                      return (
                        <li
                          key={idx}
                          onClick={() => setCompletedActions((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                          className={`flex items-start gap-3 text-xs p-3 rounded-lg border transition-colors cursor-pointer select-none ${
                            isDone
                              ? 'bg-emerald-50/60 border-emerald-200 text-slate-500 line-through'
                              : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => {}} // Handled by parent li onClick
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                          />
                          <span className="leading-relaxed flex-1">{rec}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Disclaimer footer */}
              <p className="text-center text-[11px] text-slate-400">
                {aiResult.disclaimer ||
                  'AI-generated advisory insight. All managerial decisions regarding workforce, compensation, and access remain the sole responsibility of human administrators.'}
              </p>
            </div>
          )}
        </div>
        )
      )}
    </div>
  );
};
