import { QueuedAttendance, QueueStatus } from '../types';
import { FirebaseService } from './firebaseService';
import { auth } from '../lib/firebase';

const QUEUE_STORAGE_KEY = 'civil_workforce_attendance_queue_v1';
const OFFLINE_MODE_STORAGE_KEY = 'civil_workforce_simulated_offline';

type QueueListener = (queue: QueuedAttendance[]) => void;
type ConnectionListener = (isOnline: boolean) => void;

class AttendanceQueueService {
  private queue: QueuedAttendance[] = [];
  private queueListeners: Set<QueueListener> = new Set();
  private connectionListeners: Set<ConnectionListener> = new Set();
  private isSyncing = false;
  private syncTimer: NodeJS.Timeout | null = null;
  private simulatedOffline = false;

  constructor() {
    this.loadQueueFromStorage();
    this.loadSimulatedOfflineState();
    this.setupNetworkListeners();
    // Attempt sync on boot if online
    if (this.isNetworkAvailable()) {
      setTimeout(() => this.processQueue(), 1500);
    }
  }

  private loadQueueFromStorage() {
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (raw) {
        this.queue = JSON.parse(raw);
        // Reset any interrupted "SYNCING" items back to "PENDING" on restart
        let modified = false;
        this.queue.forEach(item => {
          if (item.queueStatus === 'SYNCING') {
            item.queueStatus = 'PENDING';
            modified = true;
          }
        });
        if (modified) this.persistQueue();
      }
    } catch (e) {
      console.warn('[QueueService] Failed to load queue from storage:', e);
      this.queue = [];
    }
  }

  private persistQueue() {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
      this.notifyQueueListeners();
    } catch (e) {
      console.error('[QueueService] Failed to persist queue:', e);
    }
  }

  private loadSimulatedOfflineState() {
    try {
      this.simulatedOffline = localStorage.getItem(OFFLINE_MODE_STORAGE_KEY) === 'true';
    } catch (e) {
      this.simulatedOffline = false;
    }
  }

  public setSimulatedOffline(offline: boolean) {
    this.simulatedOffline = offline;
    try {
      localStorage.setItem(OFFLINE_MODE_STORAGE_KEY, offline ? 'true' : 'false');
    } catch (e) {}
    this.notifyConnectionListeners();
    if (!offline) {
      // Returned online -> immediately trigger queue processing
      this.processQueue();
    }
  }

  public isOfflineSimulated(): boolean {
    return this.simulatedOffline;
  }

  public async triggerSync(): Promise<void> {
    await this.processQueue();
  }

  public retryOperation(operationId: string) {
    return this.retryItem(operationId);
  }

  public isNetworkAvailable(): boolean {
    if (this.simulatedOffline) return false;
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[QueueService] Device network returned ONLINE');
        this.notifyConnectionListeners();
        if (!this.simulatedOffline) {
          this.processQueue();
        }
      });

      window.addEventListener('offline', () => {
        console.log('[QueueService] Device network switched OFFLINE');
        this.notifyConnectionListeners();
      });
    }
  }

  public subscribeQueue(listener: QueueListener): () => void {
    this.queueListeners.add(listener);
    listener([...this.queue]);
    return () => this.queueListeners.delete(listener);
  }

  public subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.isNetworkAvailable());
    return () => this.connectionListeners.delete(listener);
  }

  private notifyQueueListeners() {
    const copy = [...this.queue];
    this.queueListeners.forEach(l => l(copy));
  }

  private notifyConnectionListeners() {
    const online = this.isNetworkAvailable();
    this.connectionListeners.forEach(l => l(online));
  }

  public getQueue(): QueuedAttendance[] {
    return [...this.queue];
  }

  /**
   * Generates a collision-resistant unique operation ID for idempotency.
   */
  public generateOperationId(workerId: string): string {
    const ts = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `OP_${workerId.replace(/[^a-zA-Z0-9]/g, '')}_${ts}_${random}`;
  }

  /**
   * Enqueues an attendance operation locally in durable storage.
   * NEVER claims the attendance was recorded by the server.
   */
  public enqueue(params: {
    workerId: string;
    workerUid: string;
    workerName?: string;
    siteId: string;
    qrToken: string;
    qrSessionId: string;
    action: 'CHECK_IN' | 'CHECK_OUT' | 'AUTO';
  }): QueuedAttendance {
    const operationId = this.generateOperationId(params.workerId);
    const item: QueuedAttendance = {
      operationId,
      workerId: params.workerId,
      workerUid: params.workerUid,
      workerName: params.workerName,
      siteId: params.siteId,
      qrToken: params.qrToken,
      qrSessionId: params.qrSessionId,
      action: params.action,
      clientTimestamp: Date.now(),
      queueStatus: 'PENDING',
      retryCount: 0,
      lastAttemptTimestamp: null,
      errorMessage: null,
      syncedAttendanceId: null,
      syncedActionType: null
    };

    this.queue.unshift(item); // Newer items at front of UI, processed FIFO
    this.persistQueue();

    // If online, kick off sync immediately
    if (this.isNetworkAvailable()) {
      this.processQueue();
    }

    return item;
  }

  /**
   * Process pending/retryable queue items sequentially (FIFO)
   */
  public async processQueue(): Promise<void> {
    if (this.isSyncing || !this.isNetworkAvailable()) {
      return;
    }

    const pendingItems = this.queue.filter(
      item => item.queueStatus === 'PENDING' || item.queueStatus === 'FAILED_RETRYABLE'
    );

    if (pendingItems.length === 0) {
      return;
    }

    this.isSyncing = true;

    try {
      // Sort oldest first for correct chronological ordering
      const ordered = [...pendingItems].sort((a, b) => a.clientTimestamp - b.clientTimestamp);

      for (const item of ordered) {
        if (!this.isNetworkAvailable()) {
          console.log('[QueueService] Sync aborted: Connection went offline');
          break;
        }

        await this.syncSingleItem(item);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Synchronize an individual queued attendance operation with the trusted backend.
   */
  private async syncSingleItem(item: QueuedAttendance): Promise<void> {
    // 1. Mark status as SYNCING
    item.queueStatus = 'SYNCING';
    item.lastAttemptTimestamp = Date.now();
    this.persistQueue();

    const currentUser = auth.currentUser;
    if (!currentUser) {
      item.queueStatus = 'FAILED_RETRYABLE';
      item.errorMessage = 'Authentication required. Please sign in to synchronize queue.';
      this.persistQueue();
      return;
    }

    try {
      const idToken = await currentUser.getIdToken(false);
      const baseUrl = FirebaseService.getApiBaseUrl();

      const response = await fetch(`${baseUrl}/api/attendance/record`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          siteId: item.siteId,
          qrToken: item.qrToken,
          qrSessionId: item.qrSessionId,
          action: item.action,
          operationId: item.operationId
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        // SUCCESS: Mark as SYNCED
        item.queueStatus = 'SYNCED';
        item.syncedAttendanceId = data.attendanceId;
        item.syncedActionType = data.type as 'CHECK_IN' | 'CHECK_OUT';
        item.errorMessage = null;
        console.log(`[QueueService] Operation ${item.operationId} synced successfully: ${data.attendanceId}`);
      } else {
        const errorText = data.error || `Server responded with HTTP ${response.status}`;
        const isClientError = response.status >= 400 && response.status < 500;

        if (isClientError) {
          // Permanent failure (e.g. Expired QR, wrong site, duplicate shift, suspended account)
          // Do NOT retry indefinitely
          item.queueStatus = 'FAILED_PERMANENT';
          item.errorMessage = errorText;
          console.warn(`[QueueService] Operation ${item.operationId} permanent failure:`, errorText);
        } else {
          // Retryable server or gateway error (5xx, timeout)
          item.queueStatus = 'FAILED_RETRYABLE';
          item.retryCount += 1;
          item.errorMessage = errorText;
          console.warn(`[QueueService] Operation ${item.operationId} retryable failure (${item.retryCount}):`, errorText);
          this.scheduleBackoffRetry(item.retryCount);
        }
      }
    } catch (networkErr: any) {
      // Network fetch failure / offline during request
      item.queueStatus = 'FAILED_RETRYABLE';
      item.retryCount += 1;
      item.errorMessage = networkErr.message || 'Network connection lost during sync.';
      console.warn(`[QueueService] Network error syncing ${item.operationId}:`, networkErr.message);
      this.scheduleBackoffRetry(item.retryCount);
    }

    this.persistQueue();
  }

  /**
   * Schedule next retry with controlled exponential backoff:
   * 1s -> 2s -> 4s -> 8s -> 16s -> 30s max + jitter
   */
  private scheduleBackoffRetry(retryCount: number) {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    const delayMs = Math.min(30000, 1000 * Math.pow(2, Math.min(retryCount, 5))) + Math.floor(Math.random() * 500);
    console.log(`[QueueService] Scheduling retry in ${Math.round(delayMs / 1000)}s`);
    this.syncTimer = setTimeout(() => {
      if (this.isNetworkAvailable()) {
        this.processQueue();
      }
    }, delayMs);
  }

  /**
   * Manually retry a specific failed or pending item
   */
  public retryItem(operationId: string) {
    const item = this.queue.find(q => q.operationId === operationId);
    if (item && (item.queueStatus === 'FAILED_RETRYABLE' || item.queueStatus === 'FAILED_PERMANENT' || item.queueStatus === 'PENDING')) {
      item.queueStatus = 'PENDING';
      item.errorMessage = null;
      this.persistQueue();
      if (this.isNetworkAvailable()) {
        this.processQueue();
      }
    }
  }

  /**
   * Clear synced items to clean up local storage
   */
  public clearSynced() {
    this.queue = this.queue.filter(q => q.queueStatus !== 'SYNCED');
    this.persistQueue();
  }

  /**
   * Clear all items (for testing/reset)
   */
  public clearAll() {
    this.queue = [];
    this.persistQueue();
  }
}

export const attendanceQueueService = new AttendanceQueueService();
