export type UserRole = 'ADMIN' | 'WORKER';
export type UserStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'REJECTED';
export type RegistrationStatus = 'PENDING' | 'ACTIVE' | 'APPROVED' | 'REJECTED';
export type SiteStatus = 'ACTIVE' | 'INACTIVE';

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  workerId?: string;
  fullName?: string;
  createdAt: string;
  updatedAt?: string;
}

export type AdminAccount = AppUser;

export interface WorkerRecord {
  workerId: string;
  uid: string;
  fullName: string;
  phone: string;
  email: string;
  batchNumber: string;
  jobRole: string;
  siteId: string;
  dateOfBirth: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  joiningDate: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'REJECTED';
  createdAt: string;
  updatedAt?: string;
  profilePhoto?: WorkerProfilePhoto;
}

export interface SitePhotoMetadata {
  photoId: string;
  siteId: string;
  storagePath: string;
  downloadUrl: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  displayOrder?: number;
}

export interface WorkerProfilePhoto {
  photoId: string;
  workerId: string;
  storagePath: string;
  downloadUrl: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ConstructionSite {
  siteId: string;
  siteName: string;
  projectName: string;
  address: string;
  description: string;
  status: SiteStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface BatchRecord {
  batchId: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt?: string;
  createdByName?: string;
}

export interface WorkerRegistrationSubmission {
  fullName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  workerId?: string; // Automatically assigned upon Admin approval
  batchNumber: string; // Controlled Admin Batch ID (e.g. B-01)
  jobRole: string;
  siteId: string;
  joiningDate: string;
}

export interface WorkerRegistrationRecord {
  registrationId: string;
  workerId?: string;
  assignedWorkerId?: string;
  submittedData: WorkerRegistrationSubmission;
  status: RegistrationStatus;
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface DashboardStats {
  totalWorkers: number;
  activeWorkers: number;
  pendingRegistrations: number;
  totalSites: number;
}

export type AttendanceStatus = 'CHECKED_IN' | 'COMPLETED';

export interface ActiveQrSession {
  siteId: string;
  sessionId: string;
  token: string;
  createdAt: any;
  expiresAt: any;
  timeSlot?: number;
  generatedBy: string;
  updatedAt?: any;
}

export interface AttendanceRecord {
  attendanceId: string;
  workerId: string;
  workerUid: string;
  workerName: string;
  siteId: string;
  date: string;
  checkInTime: any;
  checkOutTime: any | null;
  status: AttendanceStatus;
  qrSessionId: string;
  qrTokenHash: string;
  createdAt: any;
  updatedAt: any;
  // Future architectural placeholders
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  syncStatus?: 'SYNCED' | 'PENDING_UPLOAD';
}

export interface QrTokenResponse {
  siteId: string;
  sessionId: string;
  token: string;
  expiresAt: number;
  secondsRemaining: number;
}

export interface ApplicationStatusInfo {
  workerId: string;
  workerName: string;
  submittedAt: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
  statusExplanation: string;
  rejectionReason?: string;
}

export interface DeviceTokenRecord {
  token: string;
  uid: string;
  platform: 'android' | 'web';
  workerId?: string;
  createdAt: string;
  updatedAt: string;
}

export type QueueStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT';

export interface QueuedAttendance {
  operationId: string;
  workerId: string;
  workerUid: string;
  workerName?: string;
  siteId: string;
  qrToken: string;
  qrSessionId: string;
  action: 'CHECK_IN' | 'CHECK_OUT' | 'AUTO';
  clientTimestamp: number;
  queueStatus: QueueStatus;
  retryCount: number;
  lastAttemptTimestamp?: number | null;
  errorMessage?: string | null;
  syncedAttendanceId?: string | null;
  syncedActionType?: 'CHECK_IN' | 'CHECK_OUT' | null;
}

export interface WorkforceDistribution {
  totalWorkers: number;
  bySite: Record<string, { siteName: string; count: number; activeCount: number; suspendedCount: number }>;
  byBatch: Record<string, { batchName: string; count: number; activeCount: number; suspendedCount: number }>;
  byRole: Record<string, number>;
  byStatus: { ACTIVE: number; SUSPENDED: number; PENDING: number };
}

// --- PHASE 5: LEAVE, OVERTIME & SALARY TYPES ---

export type LeaveType = 'CASUAL' | 'SICK' | 'EMERGENCY' | 'PAID' | 'UNPAID';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveRequest {
  leaveId: string;
  workerId: string;
  workerUid: string;
  workerName: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewerNotes?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export type OvertimeStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface OvertimeRecord {
  overtimeId: string;
  workerId: string;
  workerUid: string;
  workerName: string;
  siteId: string;
  date: string;
  hours: number;
  hourlyRate: number;
  multiplier?: number;
  calculatedAmount?: number;
  reason: string;
  attendanceId?: string | null;
  status: OvertimeStatus;
  submittedBy: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewerNotes?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type SalaryStatus = 'DRAFT' | 'PROCESSED' | 'PAID';

export interface SalaryDeductionBreakdown {
  taxOrPf?: number;
  advance?: number;
  unpaidLeave?: number;
  other?: number;
}

export interface SalaryRecord {
  salaryId: string;
  workerId: string;
  workerUid: string;
  workerName: string;
  jobRole: string;
  payPeriod: string; // e.g. "2026-09"
  startDate: string;
  endDate: string;
  dailyRate: number;
  daysAttended: number;
  baseEarnings: number;
  approvedOvertimeHours: number;
  overtimeHourlyRate: number;
  overtimeEarnings: number;
  allowances: number;
  deductions: number;
  deductionBreakdown?: SalaryDeductionBreakdown;
  netSalary: number;
  status: SalaryStatus;
  calculatedAt: string;
  processedAt?: string | null;
  paidAt?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

// --- PHASE 6: MANAGEMENT & REPORTING TYPES ---

export type ReportType = 'attendance' | 'workforce' | 'leave' | 'overtime' | 'salary';

export interface ReportOverviewStats {
  workers: {
    total: number;
    active: number;
    suspended: number;
    pendingRegistrations: number;
  };
  sites: {
    total: number;
    active: number;
    inactive: number;
  };
  batches: {
    total: number;
    active: number;
  };
  workforceBySite: Array<{
    siteId: string;
    siteName: string;
    isSiteActive: boolean;
    workerCount: number;
    activeCount: number;
  }>;
  workforceByBatch: Array<{
    batchId: string;
    batchName: string;
    workerCount: number;
    activeCount: number;
  }>;
  workforceByTrade: Array<{
    trade: string;
    workerCount: number;
    activeCount: number;
  }>;
  attendance: {
    totalRecords: number;
    checkedInToday: number;
    completedToday: number;
  };
  leave: {
    totalRequests: number;
    pending: number;
    approved: number;
    rejected: number;
    totalApprovedLeaveDays: number;
  };
  overtime: {
    totalRequests: number;
    pending: number;
    approved: number;
    totalRequestedHours: number;
    totalApprovedHours: number;
  };
  salary: {
    totalCalculatedPayroll: number;
    totalProcessedPayroll: number;
    totalPaidPayroll: number;
    totalOvertimeEarnings: number;
    totalAllowances: number;
    totalDeductions: number;
    totalNetSalary: number;
    recordCount: number;
  };
  generatedAt: string;
  generatedBy: string;
}

export interface AttendanceReportItem {
  attendanceId: string;
  workerId: string;
  workerName: string;
  siteId: string;
  siteName: string;
  batchNumber: string;
  jobRole: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: AttendanceStatus;
  syncStatus: string;
}

export interface AttendanceReportResponse {
  summary: {
    totalRecords: number;
    checkedInCount: number;
    completedCount: number;
    bySite: Record<string, number>;
    byDate: Record<string, number>;
    byWorker: Record<string, number>;
  };
  records: AttendanceReportItem[];
  filtersApplied: Record<string, any>;
  generatedAt: string;
  generatedBy: string;
}

export interface WorkforceReportItem {
  workerId: string;
  fullName: string;
  phone: string;
  email: string;
  siteId: string;
  siteName: string;
  isSiteActive: boolean;
  batchNumber: string;
  batchName: string;
  jobRole: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  joiningDate: string;
}

export interface WorkforceReportResponse {
  summary: {
    totalWorkers: number;
    activeWorkers: number;
    suspendedWorkers: number;
    pendingRegistrations: number;
    bySite: Record<string, { siteName: string; isSiteActive: boolean; count: number; activeCount: number }>;
    byBatch: Record<string, { batchName: string; count: number; activeCount: number }>;
    byTrade: Record<string, { count: number; activeCount: number }>;
    byStatus: { ACTIVE: number; SUSPENDED: number; PENDING: number };
  };
  workers: WorkforceReportItem[];
  filtersApplied: Record<string, any>;
  generatedAt: string;
  generatedBy: string;
}

export interface LeaveReportItem {
  leaveId: string;
  workerId: string;
  workerName: string;
  siteId: string;
  siteName: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: LeaveStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  submittedAt: string;
}

export interface LeaveReportResponse {
  summary: {
    totalRequests: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    cancelledCount: number;
    totalLeaveDays: number;
    byType: Record<string, number>;
    bySite: Record<string, number>;
  };
  records: LeaveReportItem[];
  filtersApplied: Record<string, any>;
  generatedAt: string;
  generatedBy: string;
}

export interface OvertimeReportItem {
  overtimeId: string;
  workerId: string;
  workerName: string;
  siteId: string;
  siteName: string;
  batchNumber: string;
  date: string;
  hours: number;
  approvedHours: number;
  hourlyRate: number;
  calculatedAmount?: number;
  status: OvertimeStatus;
  reason: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface OvertimeReportResponse {
  summary: {
    totalRequests: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    totalRequestedHours: number;
    totalApprovedHours: number;
    bySite: Record<string, { requestedHours: number; approvedHours: number }>;
    byWorker: Record<string, { requestedHours: number; approvedHours: number }>;
    byPeriod: Record<string, { requestedHours: number; approvedHours: number }>;
  };
  records: OvertimeReportItem[];
  filtersApplied: Record<string, any>;
  generatedAt: string;
  generatedBy: string;
}

export interface SalaryReportItem {
  salaryId: string;
  workerId: string;
  workerName: string;
  jobRole: string;
  payPeriod: string;
  dailyRate: number;
  daysAttended: number;
  baseEarnings: number;
  approvedOvertimeHours: number;
  overtimeEarnings: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: SalaryStatus;
  calculatedAt: string;
  processedAt?: string | null;
  paidAt?: string | null;
}

export interface SalaryReportResponse {
  summary: {
    totalRecords: number;
    totalCalculatedPayroll: number;
    totalProcessedPayroll: number;
    totalPaidPayroll: number;
    totalOvertimeEarnings: number;
    totalAllowances: number;
    totalDeductions: number;
    totalNetSalary: number;
  };
  records: SalaryReportItem[];
  filtersApplied: Record<string, any>;
  generatedAt: string;
  generatedBy: string;
}

export interface ReportAuditLog {
  logId: string;
  reportType: ReportType;
  filtersUsed: Record<string, any>;
  recordCount: number;
  generatedBy: string;
  generatedByRole: string;
  timestamp: string;
}

// =================================================================
// PHASE 7: ADVANCED SECURITY & AI INSIGHTS TYPES
// =================================================================

export type SecuritySeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

export type SecurityEventType =
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'UNAUTHORIZED_ACCESS'
  | 'INVALID_QR'
  | 'EXPIRED_QR'
  | 'FORGED_QR'
  | 'WRONG_SITE_QR'
  | 'DUPLICATE_ATTENDANCE'
  | 'SUSPENDED_WORKER_ATTEMPT'
  | 'SUSPICIOUS_THRESHOLD_TRIGGERED'
  | 'WORKER_STATUS_CHANGE'
  | 'SITE_STATUS_CHANGE'
  | 'REPORT_GENERATED'
  | 'SALARY_ACTION'
  | 'AI_INSIGHT_REQUESTED';

export interface SecurityEventRecord {
  eventId: string;
  eventType: SecurityEventType;
  actorUid: string;
  actorRole: 'ADMIN' | 'WORKER' | 'ANONYMOUS';
  workerId?: string;
  siteId?: string;
  timestamp: string;
  result: 'SUCCESS' | 'FAILURE';
  severity: SecuritySeverity;
  source: string;
  metadata?: Record<string, any>;
}

export interface SuspiciousAlert {
  alertId: string;
  pattern: string;
  severity: SecuritySeverity;
  description: string;
  affectedWorkerId?: string;
  affectedSiteId?: string;
  eventCount: number;
  windowMinutes: number;
  triggeredAt: string;
}

export interface SecurityDashboardData {
  summary: {
    totalEvents: number;
    criticalCount: number;
    highCount: number;
    warningCount: number;
    infoCount: number;
    authFailures: number;
    qrAnomalies: number;
    unauthorizedRequests: number;
  };
  recentEvents: SecurityEventRecord[];
  activeAlerts: SuspiciousAlert[];
  thresholds: Array<{
    name: string;
    threshold: string;
    window: string;
    severity: SecuritySeverity;
    description: string;
  }>;
}

export interface ObservedDataFacts {
  workforce: {
    total: number;
    active: number;
    suspended: number;
  };
  sites: {
    total: number;
    active: number;
    inactive: number;
  };
  attendance: {
    totalRecords: number;
    checkedInCount: number;
    completedCount: number;
    completionRatePercent: number;
  };
  overtime: {
    totalRequests: number;
    approvedHours: number;
  };
  leave: {
    totalRequests: number;
    approvedDays: number;
  };
  payroll: {
    totalNetSalary: number;
    recordsCount: number;
  };
  security: {
    totalEvents: number;
    highOrCriticalAlerts: number;
    qrFailures: number;
  };
}

export interface AiWorkforceBrief {
  todayHeadline: string;
  totalActiveWorkers: number;
  presentToday?: number | null;
  absentToday?: number | null;
  attendanceDataAvailable?: boolean;
  unassignedWorkers: number;
  activeSites: number;
  inactiveSites: number;
  pendingRegistrations: number;
  pendingLeaveRequests: number;
  pendingOvertimeClaims: number;
  todayAttendanceRecords: number;
  activeDeployments: number;
  completionRate: number;
  staffingStatus: string;
  summary: string;
}

export interface SiteDeactivationImpact {
  siteId: string;
  siteName: string;
  currentStatus: 'ACTIVE' | 'INACTIVE';
  workersAssigned: number;
  activeWorkersToday: number;
  todayAttendanceRecords: number;
  pendingLeaveRequests: number;
  pendingOvertimeClaims: number;
  workersRequiringReassignment: number;
  affectedWorkers: Array<{
    workerId: string;
    fullName: string;
    trade: string;
    batchNumber?: string;
  }>;
  operationalImpact: string[];
  aiObservation?: string;
}

export interface AiSiteRiskAlert {
  id: string;
  siteId?: string;
  siteName?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  mitigation: string;
}

export interface AiDailyActionItem {
  id: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  action: string;
  category: 'OVERTIME' | 'LEAVE' | 'WORKERS' | 'SITES' | 'ATTENDANCE' | 'REGISTRATION' | 'SECURITY';
  linkScreen?: string;
}

export interface AiAttendancePatternAnalysis {
  completionRatePercent: number;
  openShiftsCount: number;
  completedCount: number;
  absenteeismCount: number;
  analysis: string;
  flags: string[];
}

export interface AiWorkforcePlanningInsights {
  tradeDistribution: Record<string, number>;
  understaffedSites: string[];
  unassignedWorkers: number;
  siteBalancingRecommendations: string[];
}

export interface AiOvertimePayrollInsights {
  pendingOvertimeCount: number;
  approvedOvertimeHours: number;
  estimatedOvertimeCost: number;
  payrollSlipsCount: number;
  totalPayrollLiability: number;
  analysis: string;
  payrollReadiness: 'READY' | 'ATTENTION_NEEDED' | 'BLOCKED';
}

export interface AiReportSummary {
  executiveSummary: string;
  keyTakeaways: string[];
  operationalHealthScore: number;
  complianceHealth: string;
}

export type AdminActionType =
  | 'TOGGLE_BATCH_STATUS'
  | 'APPROVE_WORKER_REGISTRATION'
  | 'REJECT_WORKER_REGISTRATION'
  | 'TOGGLE_SITE_STATUS'
  | 'TOGGLE_WORKER_STATUS';

export interface ProposedAdminAction {
  actionType: AdminActionType;
  targetId: string;
  targetName: string;
  parameters: Record<string, any>;
  summary: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresConfirmation: boolean;
}

export interface AdminActionExecutionResult {
  success: boolean;
  verified: boolean;
  actionType: AdminActionType;
  targetId: string;
  message: string;
  timestamp: string;
  updatedData?: any;
}

export interface CommandProposal {
  commandType: string;
  targetId: string;
  targetName: string;
  summary: string;
  warning?: string;
  actionId: string;
}

export interface AskOperationsAiResponse {
  success: boolean;
  question: string;
  answer: string;
  isCommand?: boolean;
  commandProposal?: CommandProposal;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  sourceFacts?: string[];
  suggestedFollowUps?: string[];
  proposedAction?: ProposedAdminAction;
  generatedAt: string;
  modelUsed: string;
  disclaimer?: string;
  error?: string;
}

export interface AiManagementInsightsResponse {
  success: boolean;
  period: {
    startDate: string;
    endDate: string;
  };
  observedData: ObservedDataFacts;
  aiInsights: Array<{
    topic: string;
    observation: string;
    severity?: 'NORMAL' | 'ATTENTION' | 'CRITICAL';
  }>;
  recommendations: string[];
  dailyActionList?: string[];
  dailyActions?: AiDailyActionItem[];
  workforceBrief?: AiWorkforceBrief;
  siteRiskAlerts?: AiSiteRiskAlert[];
  attendancePattern?: AiAttendancePatternAnalysis;
  workforcePlanning?: AiWorkforcePlanningInsights;
  overtimePayroll?: AiOvertimePayrollInsights;
  reportSummary?: AiReportSummary;
  insufficientData?: boolean;
  generatedAt: string;
  modelUsed: string;
  disclaimer: string;
  error?: string;
}



