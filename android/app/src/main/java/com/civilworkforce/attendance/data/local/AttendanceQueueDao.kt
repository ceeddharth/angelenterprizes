package com.civilworkforce.attendance.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for the durable Room attendance queue.
 */
@Dao
interface AttendanceQueueDao {

    @Query("SELECT * FROM attendance_queue ORDER BY clientTimestamp DESC")
    fun getAllFlow(): Flow<List<QueuedAttendanceEntity>>

    @Query("SELECT * FROM attendance_queue ORDER BY clientTimestamp DESC")
    suspend fun getAll(): List<QueuedAttendanceEntity>

    @Query("SELECT * FROM attendance_queue WHERE status IN ('PENDING', 'FAILED_RETRYABLE') ORDER BY clientTimestamp ASC")
    suspend fun getPendingOrRetryable(): List<QueuedAttendanceEntity>

    @Query("SELECT * FROM attendance_queue WHERE operationId = :operationId LIMIT 1")
    suspend fun getByOperationId(operationId: String): QueuedAttendanceEntity?

    @Query("SELECT COUNT(*) FROM attendance_queue WHERE status IN ('PENDING', 'SYNCING', 'FAILED_RETRYABLE')")
    fun getPendingCountFlow(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: QueuedAttendanceEntity)

    @Update
    suspend fun update(item: QueuedAttendanceEntity)

    @Query("UPDATE attendance_queue SET status = :status WHERE operationId = :operationId")
    suspend fun updateStatus(operationId: String, status: String)

    @Query("UPDATE attendance_queue SET status = 'SYNCED', syncedAttendanceId = :attendanceId, errorMessage = NULL WHERE operationId = :operationId")
    suspend fun markSynced(operationId: String, attendanceId: String)

    @Query("UPDATE attendance_queue SET status = :status, retryCount = retryCount + 1, lastAttemptTimestamp = :timestamp, errorMessage = :errorMsg WHERE operationId = :operationId")
    suspend fun markFailed(operationId: String, status: String, timestamp: Long, errorMsg: String)

    @Query("DELETE FROM attendance_queue WHERE operationId = :operationId")
    suspend fun delete(operationId: String)

    @Query("DELETE FROM attendance_queue WHERE status = 'SYNCED'")
    suspend fun clearSynced()

    @Query("DELETE FROM attendance_queue")
    suspend fun clearAll()
}
