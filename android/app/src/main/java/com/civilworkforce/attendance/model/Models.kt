package com.civilworkforce.attendance.model

import com.google.firebase.Timestamp
import java.util.Date

/**
 * Role-Based Access Control enum for Civil Workforce system.
 */
enum class UserRole {
    ADMIN,
    WORKER
}

enum class UserStatus {
    PENDING,
    ACTIVE,
    SUSPENDED,
    REJECTED
}

typealias WorkerStatus = UserStatus

/**
 * Users collection document: /users/{uid}
 */
data class User(
    val uid: String = "",
    val role: UserRole = UserRole.WORKER,
    val name: String = "",
    val email: String = "",
    val phone: String = "",
    val status: UserStatus = UserStatus.PENDING,
    val createdAt: Timestamp = Timestamp.now(),
    val updatedAt: Timestamp = Timestamp.now()
)

/**
 * Supported construction trade roles.
 */
enum class JobRole(val displayName: String, val defaultDailyWage: Double = 600.0) {
    MASON("Mason", 850.0),
    HELPER("Helper", 500.0),
    CARPENTER("Carpenter", 900.0),
    ELECTRICIAN("Electrician", 950.0),
    PLUMBER("Plumber", 900.0),
    PAINTER("Painter", 800.0),
    WELDER("Welder", 950.0),
    OPERATOR("Operator", 1000.0),
    SUPERVISOR("Supervisor", 1200.0),
    OTHER("Other", 600.0);

    companion object {
        fun fromNameOrDisplay(value: String): JobRole {
            return values().firstOrNull {
                it.name.equals(value, ignoreCase = true) || it.displayName.equals(value, ignoreCase = true)
            } ?: HELPER
        }
    }
}

/**
 * Worker profile photo metadata referencing Firebase Storage location.
 * Storage path: /workerPhotos/{workerId}/{photoId}.jpg
 */
data class ProfilePhoto(
    val photoId: String = "",
    val workerId: String = "",
    val storagePath: String = "",
    val downloadUrl: String = "",
    val fileName: String = "",
    val contentType: String = "",
    val fileSize: Long = 0L,
    val uploadedBy: String = "",
    val uploadedAt: String = ""
)

/**
 * Workers collection document: /workers/{workerId}
 */
data class Worker(
    val workerId: String = "",
    val uid: String = "",
    val fullName: String = "",
    val phone: String = "",
    val email: String = "",
    val batchNumber: String = "",
    val jobRole: String = JobRole.HELPER.name,
    val siteId: String = "",
    val assignedSiteId: String = "",
    val dateOfBirth: String = "",
    val address: String = "",
    val emergencyContactName: String = "",
    val emergencyContactPhone: String = "",
    val joiningDate: String = "",
    val status: UserStatus = UserStatus.PENDING,
    val createdAt: Timestamp = Timestamp.now(),
    val updatedAt: Timestamp = Timestamp.now(),
    val profilePhoto: ProfilePhoto? = null,
    val dailyWage: Double = 0.0
)

enum class SiteStatus {
    ACTIVE,
    INACTIVE
}

enum class BatchStatus {
    ACTIVE,
    INACTIVE
}

/**
 * Batches collection document: /batches/{batchId}
 */
data class Batch(
    val batchId: String = "",
    val batchNumber: String = "",
    val name: String = "",
    val status: BatchStatus = BatchStatus.ACTIVE,
    val notes: String = "",
    val createdAt: Timestamp = Timestamp.now(),
    val updatedAt: Timestamp = Timestamp.now()
)

/**
 * Site photo metadata referencing Firebase Storage location.
 * Storage path: /sitePhotos/{siteId}/{photoId}.jpg
 * Subcollection: /sites/{siteId}/photos/{photoId}
 */
data class SitePhoto(
    val photoId: String = "",
    val siteId: String = "",
    val storagePath: String = "",
    val downloadUrl: String = "",
    val fileName: String = "",
    val contentType: String = "",
    val fileSize: Long = 0L,
    val uploadedBy: String = "",
    val uploadedAt: String = "",
    val displayOrder: Int = 1
)

/**
 * Sites collection document: /sites/{siteId}
 * Prepared with optional future-proof parameters (GPS, Geofence, QR).
 */
data class Site(
    val siteId: String = "",
    val siteName: String = "",
    val projectName: String = "",
    val address: String = "",
    val description: String = "",
    val status: SiteStatus = SiteStatus.ACTIVE,
    val createdAt: Timestamp = Timestamp.now(),
    val updatedAt: Timestamp = Timestamp.now(),
    // Future expansion hooks (Phase 2+)
    val latitude: Double? = null,
    val longitude: Double? = null,
    val geofenceRadiusMeters: Int? = null,
    val qrConfigurationId: String? = null,
    val photosCount: Int = 0
)

enum class RegistrationStatus {
    PENDING,
    APPROVED,
    REJECTED,
    SUSPENDED
}

data class SubmittedData(
    val fullName: String = "",
    val dateOfBirth: String = "",
    val phone: String = "",
    val email: String = "",
    val address: String = "",
    val emergencyContactName: String = "",
    val emergencyContactPhone: String = "",
    val workerId: String = "",
    val batchNumber: String = "",
    val jobRole: String = "",
    val siteId: String = "",
    val joiningDate: String = "",
    val dailyWage: Double = 0.0
)

/**
 * WorkerRegistrations collection document: /workerRegistrations/{registrationId}
 */
data class WorkerRegistration(
    val registrationId: String = "",
    val workerId: String = "",
    val submittedData: SubmittedData = SubmittedData(),
    val status: RegistrationStatus = RegistrationStatus.PENDING,
    val submittedAt: Timestamp = Timestamp.now(),
    val reviewedAt: Timestamp? = null,
    val reviewedBy: String? = null
)

/**
 * Real-time Admin Dashboard statistics aggregation model.
 */
data class DashboardStats(
    val totalWorkers: Int = 0,
    val activeWorkers: Int = 0,
    val pendingRegistrations: Int = 0,
    val totalSites: Int = 0
)

/**
 * Real backend activity audit trail entry.
 */
data class RecentActivity(
    val id: String = "",
    val title: String = "",
    val description: String = "",
    val timestamp: Timestamp = Timestamp.now(),
    val type: String = "INFO" // REGISTRATION, SITE, WORKER_STATUS
)

/**
 * Standard UI State wrapper for MVVM operations.
 */
sealed class Resource<out T> {
    data class Success<out T>(val data: T) : Resource<T>()
    data class Error(val message: String, val cause: Throwable? = null) : Resource<Nothing>()
    object Loading : Resource<Nothing>()
}

/**
 * Phase 2 Smart Attendance Models
 */
enum class AttendanceStatus {
    CHECKED_IN,
    COMPLETED
}

/**
 * Active QR Session document: /activeQrSessions/{siteId}
 * Written by trusted server via Firebase Admin credentials
 */
data class ActiveQrSession(
    val siteId: String = "",
    val sessionId: String = "",
    val token: String = "",
    val createdAt: Timestamp? = null,
    val expiresAt: Timestamp? = null,
    val timeSlot: Long = 0L,
    val generatedBy: String = "SERVER"
)

/**
 * Attendance record document: /attendance/{workerId}_{date}
 */
data class AttendanceRecord(
    val attendanceId: String = "",
    val workerId: String = "",
    val workerUid: String = "",
    val workerName: String = "",
    val siteId: String = "",
    val date: String = "",
    val checkInTime: Timestamp? = null,
    val checkOutTime: Timestamp? = null,
    val status: AttendanceStatus = AttendanceStatus.CHECKED_IN,
    val qrSessionId: String = "",
    val qrTokenHash: String = "",
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null,
    // Architectural placeholders for Phase 3 (GPS) & Phase 4 (Offline)
    val checkInLatitude: Double? = null,
    val checkInLongitude: Double? = null,
    val checkOutLatitude: Double? = null,
    val checkOutLongitude: Double? = null,
    val syncStatus: String = "SYNCED"
)

/**
 * Scanned QR Payload structure
 */
data class QrPayload(
    val siteId: String = "",
    val sessionId: String = "",
    val token: String = ""
)

/**
 * Phase 3 Durable Offline Queue Models
 */
enum class QueueStatus {
    PENDING,
    SYNCING,
    SYNCED,
    FAILED_RETRYABLE,
    FAILED_PERMANENT
}

data class QueuedAttendanceRecord(
    val operationId: String = "",
    val workerId: String = "",
    val workerUid: String = "",
    val workerName: String = "",
    val siteId: String = "",
    val qrToken: String = "",
    val qrSessionId: String = "",
    val action: String = "AUTO",
    val clientTimestamp: Long = System.currentTimeMillis(),
    val status: QueueStatus = QueueStatus.PENDING,
    val retryCount: Int = 0,
    val lastAttemptTimestamp: Long? = null,
    val errorMessage: String? = null,
    val syncedAttendanceId: String? = null
)

/**
 * Phase 8 AI Operations Assistant Models (Strictly Read-Only)
 */
data class AiWorkforceBrief(
    val todayHeadline: String = "",
    val totalWorkers: Int = 0,
    val totalActiveWorkers: Int = 0,
    val presentToday: Int? = null,
    val absentToday: Int? = null,
    val attendanceDataAvailable: Boolean = true,
    val unassignedWorkers: Int = 0,
    val activeSites: Int = 0,
    val totalSites: Int = 0,
    val pendingRegistrations: Int = 0,
    val staffingStatus: String = "Balanced Coverage",
    val summary: String = ""
)

data class AiSiteRiskAlert(
    val id: String = "",
    val severity: String = "NORMAL", // LOW, MEDIUM, HIGH, CRITICAL
    val title: String = "",
    val description: String = "",
    val mitigation: String = ""
)

data class AiDailyActionItem(
    val id: String = "",
    val priority: String = "MEDIUM", // HIGH, MEDIUM, LOW
    val action: String = "",
    val category: String = "WORKERS",
    val linkScreen: String? = null
)

data class AiOperationsInsights(
    val brief: AiWorkforceBrief = AiWorkforceBrief(),
    val alerts: List<AiSiteRiskAlert> = emptyList(),
    val actions: List<AiDailyActionItem> = emptyList(),
    val modelUsed: String = "Rules-based Operational Engine",
    val isInsufficientData: Boolean = false,
    val generatedAt: String = ""
)

