package com.civilworkforce.attendance.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.civilworkforce.attendance.model.QueueStatus
import com.civilworkforce.attendance.model.QueuedAttendanceRecord

/**
 * Durable Room database entity for local attendance operations.
 * Survives process death, device reboots, and extended offline periods.
 */
@Entity(tableName = "attendance_queue")
data class QueuedAttendanceEntity(
    @PrimaryKey
    val operationId: String,
    val workerId: String,
    val workerUid: String,
    val workerName: String,
    val siteId: String,
    val qrToken: String,
    val qrSessionId: String,
    val action: String,
    val clientTimestamp: Long,
    val status: String, // PENDING, SYNCING, SYNCED, FAILED_RETRYABLE, FAILED_PERMANENT
    val retryCount: Int,
    val lastAttemptTimestamp: Long?,
    val errorMessage: String?,
    val syncedAttendanceId: String?
) {
    fun toRecord(): QueuedAttendanceRecord = QueuedAttendanceRecord(
        operationId = operationId,
        workerId = workerId,
        workerUid = workerUid,
        workerName = workerName,
        siteId = siteId,
        qrToken = qrToken,
        qrSessionId = qrSessionId,
        action = action,
        clientTimestamp = clientTimestamp,
        status = try { QueueStatus.valueOf(status) } catch (e: Exception) { QueueStatus.PENDING },
        retryCount = retryCount,
        lastAttemptTimestamp = lastAttemptTimestamp,
        errorMessage = errorMessage,
        syncedAttendanceId = syncedAttendanceId
    )

    companion object {
        fun fromRecord(record: QueuedAttendanceRecord): QueuedAttendanceEntity = QueuedAttendanceEntity(
            operationId = record.operationId,
            workerId = record.workerId,
            workerUid = record.workerUid,
            workerName = record.workerName,
            siteId = record.siteId,
            qrToken = record.qrToken,
            qrSessionId = record.qrSessionId,
            action = record.action,
            clientTimestamp = record.clientTimestamp,
            status = record.status.name,
            retryCount = record.retryCount,
            lastAttemptTimestamp = record.lastAttemptTimestamp,
            errorMessage = record.errorMessage,
            syncedAttendanceId = record.syncedAttendanceId
        )
    }
}
