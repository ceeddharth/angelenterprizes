package com.civilworkforce.attendance.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import com.civilworkforce.attendance.data.local.AppDatabase
import com.civilworkforce.attendance.data.local.QueuedAttendanceEntity
import com.civilworkforce.attendance.model.QueueStatus
import com.civilworkforce.attendance.model.QueuedAttendanceRecord
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

/**
 * Durable Queue Manager for Phase 3 Offline & Sync.
 * Backed by Room SQLite database, surviving process death and device restarts.
 * Handles exponential backoff retries and server-side idempotency using unique operation IDs.
 */
class AttendanceQueueManager(
    private val context: Context,
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
) {
    private val tag = "AttendanceQueueManager"
    private val database = AppDatabase.getInstance(context)
    private val dao = database.attendanceQueueDao()
    private val scope = CoroutineScope(Dispatchers.IO + Job())

    private var isSyncing = false
    private var syncJob: Job? = null

    val queueFlow: Flow<List<QueuedAttendanceRecord>> = dao.getAllFlow().map { entities ->
        entities.map { it.toRecord() }
    }

    val pendingCountFlow: Flow<Int> = dao.getPendingCountFlow()

    /**
     * Checks actual network connectivity.
     */
    fun isNetworkAvailable(): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
               capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    /**
     * Generates a unique collision-resistant operation ID for server idempotency.
     */
    fun generateOperationId(workerId: String): String {
        val ts = System.currentTimeMillis()
        val randomSuffix = UUID.randomUUID().toString().take(8)
        return "OP_${workerId.replace(Regex("[^a-zA-Z0-9]"), "")}_${ts}_$randomSuffix"
    }

    /**
     * Enqueues an attendance operation locally in Room.
     * Guaranteed to persist across process death.
     */
    suspend fun enqueue(
        workerId: String,
        workerUid: String,
        workerName: String,
        siteId: String,
        qrToken: String,
        qrSessionId: String,
        action: String = "AUTO"
    ): QueuedAttendanceRecord = withContext(Dispatchers.IO) {
        val operationId = generateOperationId(workerId)
        val record = QueuedAttendanceRecord(
            operationId = operationId,
            workerId = workerId,
            workerUid = workerUid,
            workerName = workerName,
            siteId = siteId,
            qrToken = qrToken,
            qrSessionId = qrSessionId,
            action = action,
            clientTimestamp = System.currentTimeMillis(),
            status = QueueStatus.PENDING,
            retryCount = 0
        )

        dao.insert(QueuedAttendanceEntity.fromRecord(record))
        Log.d(tag, "Enqueued attendance operation locally: $operationId")

        // Trigger immediate sync attempt if network is available
        if (isNetworkAvailable()) {
            triggerSync()
        }

        record
    }

    /**
     * Triggers synchronization of all pending or retryable operations.
     */
    fun triggerSync(serverBaseUrl: String = FirebaseConstants.DEFAULT_BACKEND_URL) {
        if (isSyncing || !isNetworkAvailable()) return

        syncJob?.cancel()
        syncJob = scope.launch {
            processPendingQueue(serverBaseUrl)
        }
    }

    private suspend fun processPendingQueue(serverBaseUrl: String) = withContext(Dispatchers.IO) {
        if (isSyncing) return@withContext
        isSyncing = true

        try {
            val pendingEntities = dao.getPendingOrRetryable()
            if (pendingEntities.isEmpty()) {
                return@withContext
            }

            val currentUser = auth.currentUser
            if (currentUser == null) {
                Log.w(tag, "Sync postponed: User not authenticated in Firebase Auth.")
                return@withContext
            }

            for (entity in pendingEntities) {
                if (!isNetworkAvailable()) {
                    Log.d(tag, "Network disconnected mid-sync, halting queue run.")
                    break
                }

                syncSingleEntity(entity, serverBaseUrl)
            }
        } finally {
            isSyncing = false
        }
    }

    private suspend fun syncSingleEntity(
        entity: QueuedAttendanceEntity,
        serverBaseUrl: String
    ) {
        val operationId = entity.operationId
        dao.updateStatus(operationId, QueueStatus.SYNCING.name)

        try {
            val currentUser = auth.currentUser
                ?: throw IllegalStateException("Firebase user session expired")

            val tokenResult = currentUser.getIdToken(false).await()
            val idToken = tokenResult.token
                ?: throw IllegalStateException("Failed to acquire fresh Firebase ID Token")

            val cleanBaseUrl = serverBaseUrl.trimEnd('/')
            val endpoint = "$cleanBaseUrl/api/attendance/record"
            val url = URL(endpoint)

            val requestBodyJson = JSONObject().apply {
                put("siteId", entity.siteId)
                put("qrToken", entity.qrToken)
                put("qrSessionId", entity.qrSessionId)
                put("action", entity.action)
                put("operationId", entity.operationId) // Server idempotency key
            }

            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Authorization", "Bearer $idToken")
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                doOutput = true
                connectTimeout = 12000
                readTimeout = 12000
            }

            connection.outputStream.use { os ->
                val input = requestBodyJson.toString().toByteArray(Charsets.UTF_8)
                os.write(input, 0, input.size)
            }

            val responseCode = connection.responseCode
            val responseStream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
            val responseText = responseStream?.let { stream ->
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
            } ?: ""

            val json = if (responseText.isNotBlank()) JSONObject(responseText) else JSONObject()
            val isSuccess = responseCode in 200..299 && json.optBoolean("success", false)

            if (isSuccess) {
                val attendanceId = json.optString("attendanceId", "")
                dao.markSynced(operationId, attendanceId)
                Log.i(tag, "Successfully synced operation $operationId -> $attendanceId")
            } else {
                val errorMsg = json.optString("error", "Server returned HTTP $responseCode")
                val isClientError = responseCode in 400..499

                if (isClientError) {
                    // Permanent rejection (expired QR, unauthorized site, account suspended)
                    dao.markFailed(
                        operationId = operationId,
                        status = QueueStatus.FAILED_PERMANENT.name,
                        timestamp = System.currentTimeMillis(),
                        errorMsg = errorMsg
                    )
                    Log.w(tag, "Permanent sync failure for $operationId: $errorMsg")
                } else {
                    // Retryable server error (500, 502, 503, 504)
                    val nextRetry = entity.retryCount + 1
                    dao.markFailed(
                        operationId = operationId,
                        status = QueueStatus.FAILED_RETRYABLE.name,
                        timestamp = System.currentTimeMillis(),
                        errorMsg = errorMsg
                    )
                    Log.w(tag, "Retryable failure ($nextRetry) for $operationId: $errorMsg")
                    scheduleExponentialBackoff(nextRetry, serverBaseUrl)
                }
            }
        } catch (e: Exception) {
            // Network transport or connectivity failure
            val nextRetry = entity.retryCount + 1
            dao.markFailed(
                operationId = operationId,
                status = QueueStatus.FAILED_RETRYABLE.name,
                timestamp = System.currentTimeMillis(),
                errorMsg = e.message ?: "Connection error"
            )
            Log.w(tag, "Network exception during sync for $operationId: ${e.message}")
            scheduleExponentialBackoff(nextRetry, serverBaseUrl)
        }
    }

    /**
     * Schedules exponential backoff:
     * 1s -> 2s -> 4s -> 8s -> 16s -> 30s max + randomized jitter
     */
    private fun scheduleExponentialBackoff(retryCount: Int, serverBaseUrl: String) {
        val baseDelay = min(30000L, 1000L * (2.0.pow(min(retryCount, 5))).toLong())
        val jitter = Random.nextLong(100L, 800L)
        val delayTime = baseDelay + jitter

        Log.d(tag, "Scheduling exponential backoff retry in ${delayTime}ms")
        scope.launch {
            delay(delayTime)
            if (isNetworkAvailable()) {
                triggerSync(serverBaseUrl)
            }
        }
    }

    /**
     * Manually retries a failed operation.
     */
    suspend fun retryOperation(operationId: String, serverBaseUrl: String = FirebaseConstants.DEFAULT_BACKEND_URL) {
        withContext(Dispatchers.IO) {
            val entity = dao.getByOperationId(operationId)
            if (entity != null) {
                dao.updateStatus(operationId, QueueStatus.PENDING.name)
                triggerSync(serverBaseUrl)
            }
        }
    }

    /**
     * Clears all synced records from local database.
     */
    suspend fun clearSynced() = withContext(Dispatchers.IO) {
        dao.clearSynced()
    }

    /**
     * Clears entire database (for reset/testing).
     */
    suspend fun clearAll() = withContext(Dispatchers.IO) {
        dao.clearAll()
    }
}
