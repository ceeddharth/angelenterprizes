package com.civilworkforce.attendance.data

import com.civilworkforce.attendance.model.ActiveQrSession
import com.civilworkforce.attendance.model.AttendanceRecord
import com.civilworkforce.attendance.model.AttendanceStatus
import com.civilworkforce.attendance.model.QrPayload
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.Worker
import com.civilworkforce.attendance.model.WorkerStatus
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class AttendanceRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val queueManager: AttendanceQueueManager? = null
) {

    /**
     * Executes atomic Check-In or Check-Out via the trusted server endpoint POST /api/attendance/record.
     * Enforces Firebase Auth Bearer token verification, active civil worker status, site assignment,
     * rotating HMAC validation, server-side IST date protection, and duplicate check-in prevention.
     */
    suspend fun recordAttendance(
        qrPayload: QrPayload,
        serverBaseUrl: String = FirebaseConstants.DEFAULT_BACKEND_URL,
        action: String = "AUTO",
        operationId: String? = null
    ): Resource<Pair<String, AttendanceRecord>> = withContext(Dispatchers.IO) {
        val currentUser = auth.currentUser
            ?: return@withContext Resource.Error("Authentication required to record attendance.")

        try {
            // 1. Acquire current Firebase Auth ID Token for Bearer authentication
            val tokenResult = currentUser.getIdToken(false).await()
            val idToken = tokenResult.token
                ?: return@withContext Resource.Error("Failed to acquire Firebase ID token.")

            // 2. Client-side pre-validation: verify active worker profile & assigned site
            val workerQuery = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                .whereEqualTo(FirebaseConstants.FIELD_UID, currentUser.uid)
                .limit(1)
                .get()
                .await()

            if (workerQuery.isEmpty) {
                return@withContext Resource.Error("No registered civil worker profile found for this account.")
            }

            val workerDoc = workerQuery.documents.first()
            val worker = workerDoc.toObject(Worker::class.java)
                ?: return@withContext Resource.Error("Failed to parse worker profile.")

            if (worker.status != WorkerStatus.ACTIVE) {
                return@withContext Resource.Error("Attendance blocked: Worker account status is ${worker.status}. Only ACTIVE workers can record attendance.")
            }

            val effectiveSiteId = if (worker.siteId.isNotBlank()) worker.siteId else worker.assignedSiteId
            if (effectiveSiteId.isNotBlank() && effectiveSiteId != qrPayload.siteId) {
                return@withContext Resource.Error("Site mismatch: You are assigned to site $effectiveSiteId, but scanned QR code is for site ${qrPayload.siteId}.")
            }

            // 3. Call trusted server endpoint POST /api/attendance/record
            val cleanBaseUrl = serverBaseUrl.trimEnd('/')
            val endpoint = "$cleanBaseUrl/api/attendance/record"
            val url = URL(endpoint)

            val requestBodyJson = JSONObject().apply {
                put("siteId", qrPayload.siteId)
                put("qrToken", qrPayload.token)
                put("qrSessionId", qrPayload.sessionId.ifBlank { "QRSESS_${qrPayload.siteId}" })
                put("action", action)
                if (!operationId.isNullOrBlank()) {
                    put("operationId", operationId)
                }
            }

            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Authorization", "Bearer $idToken")
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                doOutput = true
                connectTimeout = 15000
                readTimeout = 15000
            }

            // Write JSON request body
            connection.outputStream.use { os ->
                val input = requestBodyJson.toString().toByteArray(Charsets.UTF_8)
                os.write(input, 0, input.size)
            }

            val responseCode = connection.responseCode
            val responseStream = if (responseCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            }

            val responseText = responseStream?.let { stream ->
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
            } ?: ""

            val json = if (responseText.isNotBlank()) JSONObject(responseText) else JSONObject()

            if (responseCode !in 200..299 || !json.optBoolean("success", false)) {
                val errorMsg = json.optString("error", "Server error ($responseCode) recording attendance.")
                return@withContext Resource.Error(errorMsg)
            }

            val recordType = json.optString("type", "CHECK_IN")
            val attendanceId = json.optString("attendanceId", "${worker.workerId}_${json.optString("date")}")
            val dateStr = json.optString("date")

            val record = AttendanceRecord(
                attendanceId = attendanceId,
                workerId = worker.workerId,
                workerUid = currentUser.uid,
                workerName = worker.fullName,
                siteId = qrPayload.siteId,
                date = dateStr,
                status = if (recordType == "CHECK_OUT" || json.optString("status") == "COMPLETED") {
                    AttendanceStatus.COMPLETED
                } else {
                    AttendanceStatus.CHECKED_IN
                },
                qrSessionId = qrPayload.sessionId,
                qrTokenHash = qrPayload.token,
                createdAt = Timestamp.now(),
                updatedAt = Timestamp.now()
            )

            Resource.Success(recordType to record)
        } catch (e: Exception) {
            val friendlyMsg = when {
                e.message?.contains("failed to connect", ignoreCase = true) == true ||
                e.message?.contains("Connection refused", ignoreCase = true) == true ->
                    "Unable to connect to attendance verification server ($serverBaseUrl). Please verify connection."
                e.message?.contains("already completed", ignoreCase = true) == true ->
                    e.message ?: "Attendance already completed."
                else -> e.message ?: "An unexpected error occurred during attendance recording."
            }
            Resource.Error(friendlyMsg, e)
        }
    }

    /**
     * Phase 3: Records attendance online or securely queues it locally when network is unavailable.
     * Guarantees durable storage and prevents false success messages when offline.
     */
    suspend fun recordOrQueueAttendance(
        qrPayload: QrPayload,
        serverBaseUrl: String = FirebaseConstants.DEFAULT_BACKEND_URL,
        action: String = "AUTO"
    ): Resource<Pair<String, AttendanceRecord>> = withContext(Dispatchers.IO) {
        val currentUser = auth.currentUser
            ?: return@withContext Resource.Error("Authentication required to record attendance.")

        // Verify active worker & site match first
        val workerQuery = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
            .whereEqualTo(FirebaseConstants.FIELD_UID, currentUser.uid)
            .limit(1)
            .get()
            .await()

        if (workerQuery.isEmpty) {
            return@withContext Resource.Error("No registered civil worker profile found for this account.")
        }

        val workerDoc = workerQuery.documents.first()
        val worker = workerDoc.toObject(Worker::class.java)
            ?: return@withContext Resource.Error("Failed to parse worker profile.")

        if (worker.status != WorkerStatus.ACTIVE) {
            return@withContext Resource.Error("Attendance blocked: Worker account status is ${worker.status}. Only ACTIVE workers can record attendance.")
        }

        val effectiveSiteId = if (worker.siteId.isNotBlank()) worker.siteId else worker.assignedSiteId
        if (effectiveSiteId.isNotBlank() && effectiveSiteId != qrPayload.siteId) {
            return@withContext Resource.Error("Site mismatch: You are assigned to site $effectiveSiteId, but scanned QR code is for site ${qrPayload.siteId}.")
        }

        val isOnline = queueManager?.isNetworkAvailable() ?: true

        // If offline: save locally in queue
        if (!isOnline && queueManager != null) {
            val queuedRecord = queueManager.enqueue(
                workerId = worker.workerId,
                workerUid = currentUser.uid,
                workerName = worker.fullName,
                siteId = qrPayload.siteId,
                qrToken = qrPayload.token,
                qrSessionId = qrPayload.sessionId.ifBlank { "QRSESS_${qrPayload.siteId}" },
                action = action
            )

            val localPlaceholder = AttendanceRecord(
                attendanceId = "LOCAL_${queuedRecord.operationId}",
                workerId = worker.workerId,
                workerUid = currentUser.uid,
                workerName = worker.fullName,
                siteId = qrPayload.siteId,
                date = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Kolkata") }.format(Date()),
                status = AttendanceStatus.CHECKED_IN,
                qrSessionId = qrPayload.sessionId,
                qrTokenHash = qrPayload.token,
                syncStatus = "QUEUED_OFFLINE"
            )

            return@withContext Resource.Success(Pair("QUEUED", localPlaceholder))
        }

        // If online: attempt direct submission with generated operationId
        val opId = queueManager?.generateOperationId(worker.workerId)
        val result = recordAttendance(qrPayload, serverBaseUrl, action, opId)

        // If direct submission fails due to transport/network exception, fall back to durable queue
        if (result is Resource.Error && queueManager != null && (result.message.contains("Connect") || result.message.contains("timeout") || result.message.contains("Network"))) {
            val queuedRecord = queueManager.enqueue(
                workerId = worker.workerId,
                workerUid = currentUser.uid,
                workerName = worker.fullName,
                siteId = qrPayload.siteId,
                qrToken = qrPayload.token,
                qrSessionId = qrPayload.sessionId.ifBlank { "QRSESS_${qrPayload.siteId}" },
                action = action
            )

            val localPlaceholder = AttendanceRecord(
                attendanceId = "LOCAL_${queuedRecord.operationId}",
                workerId = worker.workerId,
                workerUid = currentUser.uid,
                workerName = worker.fullName,
                siteId = qrPayload.siteId,
                date = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Kolkata") }.format(Date()),
                status = AttendanceStatus.CHECKED_IN,
                qrSessionId = qrPayload.sessionId,
                qrTokenHash = qrPayload.token,
                syncStatus = "QUEUED_OFFLINE"
            )

            return@withContext Resource.Success(Pair("QUEUED", localPlaceholder))
        }

        result
    }

    /**
     * Retrieve today's attendance record for the given worker using India Standard Time (IST)
     */
    suspend fun getTodayAttendance(workerId: String): Resource<AttendanceRecord?> = withContext(Dispatchers.IO) {
        try {
            val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("Asia/Kolkata")
            }
            val dateStr = dateFormat.format(Date())
            val docId = "${workerId}_$dateStr"

            val doc = firestore.collection(FirebaseConstants.COLLECTION_ATTENDANCE)
                .document(docId)
                .get()
                .await()

            if (!doc.exists()) {
                return@withContext Resource.Success(null)
            }

            val statusStr = doc.getString("status") ?: AttendanceStatus.CHECKED_IN.name
            val record = AttendanceRecord(
                attendanceId = doc.getString("attendanceId") ?: docId,
                workerId = doc.getString("workerId") ?: "",
                workerUid = doc.getString("workerUid") ?: "",
                workerName = doc.getString("workerName") ?: "",
                siteId = doc.getString("siteId") ?: "",
                date = doc.getString("date") ?: dateStr,
                checkInTime = doc.getTimestamp("checkInTime"),
                checkOutTime = doc.getTimestamp("checkOutTime"),
                status = if (statusStr == AttendanceStatus.COMPLETED.name) AttendanceStatus.COMPLETED else AttendanceStatus.CHECKED_IN,
                qrSessionId = doc.getString("qrSessionId") ?: "",
                qrTokenHash = doc.getString("qrTokenHash") ?: "",
                createdAt = doc.getTimestamp("createdAt"),
                updatedAt = doc.getTimestamp("updatedAt")
            )

            Resource.Success(record)
        } catch (e: Exception) {
            Resource.Error("Failed to fetch today's attendance: ${e.message}", e)
        }
    }

    /**
     * Admin/Supervisor: Fetch rotating active QR token from trusted server
     */
    suspend fun fetchActiveQrSessionFromServer(
        baseUrl: String = FirebaseConstants.DEFAULT_BACKEND_URL,
        siteId: String
    ): Resource<ActiveQrSession> = withContext(Dispatchers.IO) {
        val currentUser = auth.currentUser
            ?: return@withContext Resource.Error("Admin authentication required to generate site QR.")

        try {
            val tokenResult = currentUser.getIdToken(false).await()
            val idToken = tokenResult.token
                ?: return@withContext Resource.Error("Failed to acquire Firebase ID token.")

            val cleanBaseUrl = baseUrl.trimEnd('/')
            val endpoint = "$cleanBaseUrl/api/attendance/active-qr?siteId=$siteId"
            val url = URL(endpoint)
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer $idToken")
                setRequestProperty("Accept", "application/json")
                connectTimeout = 10000
                readTimeout = 10000
            }

            val responseCode = connection.responseCode
            if (responseCode == HttpURLConnection.HTTP_OK) {
                val reader = BufferedReader(InputStreamReader(connection.inputStream))
                val response = reader.use { it.readText() }
                val json = JSONObject(response)

                val session = ActiveQrSession(
                    siteId = json.getString("siteId"),
                    sessionId = json.getString("sessionId"),
                    token = json.getString("token"),
                    expiresAt = Timestamp(json.getLong("expiresAt") / 1000, 0),
                    generatedBy = "SERVER"
                )
                Resource.Success(session)
            } else {
                val errorStream = connection.errorStream
                val errorMsg = if (errorStream != null) {
                    BufferedReader(InputStreamReader(errorStream)).use { it.readText() }
                } else {
                    "HTTP $responseCode"
                }
                Resource.Error("Server error ($responseCode): $errorMsg")
            }
        } catch (e: Exception) {
            Resource.Error("Failed to connect to trusted attendance server: ${e.message}", e)
        }
    }
}
