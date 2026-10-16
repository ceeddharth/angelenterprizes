package com.civilworkforce.attendance.data

import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.UserRole
import com.civilworkforce.attendance.model.UserStatus
import com.civilworkforce.attendance.model.Worker
import com.civilworkforce.attendance.util.CurrencyUtils
import com.civilworkforce.attendance.util.FirebaseErrorParser
import com.civilworkforce.attendance.util.ValidationUtils
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

/**
 * Payload for updating worker details securely by administrators.
 */
data class WorkerUpdatePayload(
    val fullName: String,
    val phone: String,
    val jobRole: String,
    val batchNumber: String,
    val siteId: String,
    val dailyWage: Double,
    val emergencyContactName: String = "",
    val emergencyContactPhone: String = "",
    val address: String = ""
)

interface WorkerRepository {
    suspend fun getWorkers(searchQuery: String? = null, statusFilter: UserStatus? = null): Resource<List<Worker>>
    suspend fun getWorkerByUid(uid: String): Resource<Worker?>
    suspend fun getWorkerById(workerId: String): Resource<Worker?>
    suspend fun updateWorkerStatus(workerId: String, newStatus: UserStatus): Resource<Unit>
    suspend fun updateWorkerDetails(workerId: String, payload: WorkerUpdatePayload): Resource<Unit>
    suspend fun registerWorkerDirectly(worker: Worker, initialPin: String): Resource<Worker>
}

class FirebaseWorkerRepository(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
) : WorkerRepository {

    override suspend fun getWorkers(searchQuery: String?, statusFilter: UserStatus?): Resource<List<Worker>> {
        return try {
            val query = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                .orderBy(FirebaseConstants.FIELD_CREATED_AT)

            val snapshot = query.get().await()
            val list = snapshot.toObjects(Worker::class.java)

            val filtered = list.filter { worker ->
                val matchesStatus = statusFilter == null || worker.status == statusFilter
                val matchesSearch = searchQuery.isNullOrBlank() ||
                        worker.fullName.contains(searchQuery, ignoreCase = true) ||
                        worker.workerId.contains(searchQuery, ignoreCase = true) ||
                        worker.phone.contains(searchQuery, ignoreCase = true) ||
                        worker.jobRole.contains(searchQuery, ignoreCase = true)

                matchesStatus && matchesSearch
            }

            Resource.Success(filtered)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun getWorkerByUid(uid: String): Resource<Worker?> {
        return try {
            val query = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                .whereEqualTo(FirebaseConstants.FIELD_UID, uid)
                .limit(1)
                .get()
                .await()

            if (query.isEmpty) {
                Resource.Success(null)
            } else {
                Resource.Success(query.documents.first().toObject(Worker::class.java))
            }
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun getWorkerById(workerId: String): Resource<Worker?> {
        return try {
            val doc = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                .document(workerId)
                .get()
                .await()

            if (doc.exists()) {
                Resource.Success(doc.toObject(Worker::class.java))
            } else {
                Resource.Success(null)
            }
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun updateWorkerStatus(workerId: String, newStatus: UserStatus): Resource<Unit> {
        return try {
            val batch = firestore.batch()
            val workerRef = firestore.collection(FirebaseConstants.COLLECTION_WORKERS).document(workerId)
            val workerDoc = workerRef.get().await()

            if (!workerDoc.exists()) {
                return Resource.Error("Worker record '$workerId' does not exist.")
            }

            val uid = workerDoc.getString(FirebaseConstants.FIELD_UID)

            batch.update(workerRef, mapOf(
                FirebaseConstants.FIELD_STATUS to newStatus.name,
                FirebaseConstants.FIELD_UPDATED_AT to Timestamp.now()
            ))

            if (!uid.isNullOrBlank()) {
                val userRef = firestore.collection(FirebaseConstants.COLLECTION_USERS).document(uid)
                batch.update(userRef, mapOf(
                    FirebaseConstants.FIELD_STATUS to newStatus.name,
                    FirebaseConstants.FIELD_UPDATED_AT to Timestamp.now()
                ))
            }

            batch.commit().await()
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun updateWorkerDetails(workerId: String, payload: WorkerUpdatePayload): Resource<Unit> {
        return try {
            // 1. Validate Phone
            val phoneResult = ValidationUtils.validatePhone(payload.phone)
            if (!phoneResult.isValid) {
                return Resource.Error(phoneResult.errorMessage ?: "Invalid mobile phone number.")
            }
            val normalizedPhone = phoneResult.normalizedNumber

            // 2. Validate Emergency Phone if provided
            var normalizedEmergency = payload.emergencyContactPhone.trim()
            if (normalizedEmergency.isNotBlank()) {
                val emergencyRes = ValidationUtils.validatePhone(normalizedEmergency)
                if (!emergencyRes.isValid) {
                    return Resource.Error("Emergency Phone: ${emergencyRes.errorMessage ?: "Invalid mobile number."}")
                }
                normalizedEmergency = emergencyRes.normalizedNumber
            }

            // 3. Validate Wage
            if (!CurrencyUtils.isValidWageRate(payload.dailyWage)) {
                return Resource.Error("Daily wage must be between ₹200 and ₹10,000 per day.")
            }

            // 4. Validate Name
            if (payload.fullName.trim().length < 2) {
                return Resource.Error("Worker legal name must be at least 2 characters.")
            }

            val workerRef = firestore.collection(FirebaseConstants.COLLECTION_WORKERS).document(workerId)
            val workerDoc = workerRef.get().await()
            if (!workerDoc.exists()) {
                return Resource.Error("Worker '$workerId' does not exist.")
            }

            // 5. Check duplicate phone against other workers
            val phoneQuery = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                .whereEqualTo(FirebaseConstants.FIELD_PHONE, normalizedPhone)
                .get()
                .await()

            val existingConflict = phoneQuery.documents.firstOrNull { it.id != workerId }
            if (existingConflict != null) {
                return Resource.Error("Mobile number '${ValidationUtils.formatPhoneDisplay(normalizedPhone)}' is already assigned to Worker ID '${existingConflict.id}'.")
            }

            val uid = workerDoc.getString(FirebaseConstants.FIELD_UID)
            val batch = firestore.batch()

            val workerUpdates = mutableMapOf<String, Any>(
                "fullName" to payload.fullName.trim(),
                "phone" to normalizedPhone,
                "jobRole" to payload.jobRole.trim(),
                "batchNumber" to payload.batchNumber.trim(),
                "siteId" to payload.siteId.trim(),
                "dailyWage" to payload.dailyWage,
                "address" to payload.address.trim(),
                "emergencyContactName" to payload.emergencyContactName.trim(),
                "emergencyContactPhone" to normalizedEmergency,
                FirebaseConstants.FIELD_UPDATED_AT to Timestamp.now()
            )

            batch.update(workerRef, workerUpdates)

            // Keep user collection synchronized
            if (!uid.isNullOrBlank()) {
                val userRef = firestore.collection(FirebaseConstants.COLLECTION_USERS).document(uid)
                batch.update(userRef, mapOf(
                    "name" to payload.fullName.trim(),
                    "phone" to normalizedPhone,
                    FirebaseConstants.FIELD_UPDATED_AT to Timestamp.now()
                ))
            }

            batch.commit().await()
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun registerWorkerDirectly(worker: Worker, initialPin: String): Resource<Worker> {
        return try {
            // Validate Phone
            val phoneResult = ValidationUtils.validatePhone(worker.phone)
            if (!phoneResult.isValid) {
                return Resource.Error(phoneResult.errorMessage ?: "Invalid mobile phone number.")
            }
            val normalizedPhone = phoneResult.normalizedNumber

            val cleanWorkerId = worker.workerId.trim()
            if (!ValidationUtils.isValidWorkerId(cleanWorkerId)) {
                return Resource.Error("Worker ID must be at least 3 characters.")
            }

            val cleanEmail = worker.email.trim().lowercase()
            if (!ValidationUtils.isValidEmail(cleanEmail)) {
                return Resource.Error("Valid email address is required for worker login credentials.")
            }

            // Check duplicate worker ID
            val idDoc = firestore.collection(FirebaseConstants.COLLECTION_WORKERS).document(cleanWorkerId).get().await()
            if (idDoc.exists()) {
                return Resource.Error("Worker ID '$cleanWorkerId' is already in use.")
            }

            // Check duplicate phone
            val phoneQuery = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                .whereEqualTo(FirebaseConstants.FIELD_PHONE, normalizedPhone)
                .limit(1)
                .get()
                .await()
            if (!phoneQuery.isEmpty) {
                return Resource.Error("Mobile number '${ValidationUtils.formatPhoneDisplay(normalizedPhone)}' is already assigned to another worker.")
            }

            // Create Firebase Auth user
            val authResult = auth.createUserWithEmailAndPassword(cleanEmail, initialPin).await()
            val uid = authResult.user?.uid ?: throw IllegalStateException("Auth UID generation failed")

            val finalWage = if (worker.dailyWage > 0.0) worker.dailyWage else 600.0

            val newWorker = worker.copy(
                workerId = cleanWorkerId,
                uid = uid,
                email = cleanEmail,
                phone = normalizedPhone,
                status = UserStatus.ACTIVE,
                dailyWage = finalWage,
                createdAt = Timestamp.now(),
                updatedAt = Timestamp.now()
            )

            val batch = firestore.batch()
            val workerRef = firestore.collection(FirebaseConstants.COLLECTION_WORKERS).document(cleanWorkerId)
            batch.set(workerRef, newWorker)

            val userRef = firestore.collection(FirebaseConstants.COLLECTION_USERS).document(uid)
            val userMap = mapOf(
                "uid" to uid,
                "role" to UserRole.WORKER.name,
                "name" to worker.fullName.trim(),
                "email" to cleanEmail,
                "phone" to normalizedPhone,
                "status" to UserStatus.ACTIVE.name,
                "createdAt" to Timestamp.now(),
                "updatedAt" to Timestamp.now()
            )
            batch.set(userRef, userMap)

            batch.commit().await()
            Resource.Success(newWorker)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }
}
