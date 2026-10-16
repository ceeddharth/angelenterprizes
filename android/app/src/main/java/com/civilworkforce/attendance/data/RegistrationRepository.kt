package com.civilworkforce.attendance.data

import com.civilworkforce.attendance.model.JobRole
import com.civilworkforce.attendance.model.RegistrationStatus
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.SubmittedData
import com.civilworkforce.attendance.model.User
import com.civilworkforce.attendance.model.UserRole
import com.civilworkforce.attendance.model.UserStatus
import com.civilworkforce.attendance.model.Worker
import com.civilworkforce.attendance.model.WorkerRegistration
import com.civilworkforce.attendance.util.FirebaseErrorParser
import com.civilworkforce.attendance.util.ValidationUtils
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

interface RegistrationRepository {
    suspend fun submitWorkerRegistration(data: SubmittedData, passwordPin: String): Resource<String>
    suspend fun getPendingRegistrations(): Resource<List<WorkerRegistration>>
    suspend fun approveRegistration(registrationId: String, adminUid: String): Resource<Unit>
    suspend fun rejectRegistration(registrationId: String, adminUid: String): Resource<Unit>
    suspend fun suspendRegistration(registrationId: String, adminUid: String): Resource<Unit>
}

class FirebaseRegistrationRepository(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
) : RegistrationRepository {

    override suspend fun submitWorkerRegistration(data: SubmittedData, passwordPin: String): Resource<String> {
        return try {
            // 0. Strict Phone and Email Validation prior to Firebase Auth or Firestore operations
            val phoneValidation = ValidationUtils.validatePhone(data.phone)
            if (!phoneValidation.isValid) {
                return Resource.Error(phoneValidation.errorMessage ?: "Invalid mobile phone number.")
            }
            val normalizedPhone = phoneValidation.normalizedNumber

            var normalizedEmergencyPhone = data.emergencyContactPhone.trim()
            if (normalizedEmergencyPhone.isNotBlank()) {
                val emergencyValidation = ValidationUtils.validatePhone(normalizedEmergencyPhone)
                if (!emergencyValidation.isValid) {
                    return Resource.Error("Emergency Contact: ${emergencyValidation.errorMessage ?: "Invalid mobile number."}")
                }
                normalizedEmergencyPhone = emergencyValidation.normalizedNumber
            }

            if (!ValidationUtils.isValidEmail(data.email)) {
                return Resource.Error("Please enter a valid email address (maximum 254 characters).")
            }

            if (passwordPin.length < 6) {
                return Resource.Error("Password / PIN must be at least 6 characters.")
            }

            val cleanWorkerId = data.workerId.trim()
            val cleanEmail = data.email.trim()

            // Optional pre-checks: executed only if caller has read permissions
            if (cleanWorkerId.isNotBlank()) {
                try {
                    val workerIdCheck = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                        .whereEqualTo(FirebaseConstants.FIELD_WORKER_ID, cleanWorkerId)
                        .limit(1)
                        .get()
                        .await()

                    if (!workerIdCheck.isEmpty) {
                        return Resource.Error("Worker ID '$cleanWorkerId' is already registered in the system. Please verify or contact administration.")
                    }
                } catch (_: Exception) {
                    // Pre-check skipped if Firestore security rules restrict unauthenticated reads;
                    // uniqueness is verified during Admin approval.
                }

                try {
                    val pendingWorkerIdCheck = firestore.collection(FirebaseConstants.COLLECTION_REGISTRATIONS)
                        .whereEqualTo("workerId", cleanWorkerId)
                        .whereEqualTo(FirebaseConstants.FIELD_STATUS, RegistrationStatus.PENDING.name)
                        .limit(1)
                        .get()
                        .await()

                    if (!pendingWorkerIdCheck.isEmpty) {
                        return Resource.Error("An active registration for Worker ID '$cleanWorkerId' is already awaiting administrator review.")
                    }
                } catch (_: Exception) {
                    // Pre-check skipped if unauthenticated read is restricted
                }
            }

            try {
                val phoneCheck = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                    .whereEqualTo(FirebaseConstants.FIELD_PHONE, normalizedPhone)
                    .limit(1)
                    .get()
                    .await()

                if (!phoneCheck.isEmpty) {
                    return Resource.Error("Mobile number '${ValidationUtils.formatPhoneDisplay(normalizedPhone)}' is already registered with another worker profile.")
                }
            } catch (_: Exception) {
                // Pre-check skipped if unauthenticated read is restricted
            }

            // 1. Firebase Authentication: Create or retrieve authenticated credentials
            var isNewAuthUser = false
            val uid: String

            try {
                val authResult = auth.createUserWithEmailAndPassword(cleanEmail, passwordPin).await()
                val user = authResult.user ?: throw IllegalStateException("Firebase Auth UID generation failed")
                uid = user.uid
                isNewAuthUser = true
            } catch (collision: FirebaseAuthUserCollisionException) {
                // Account already exists in Firebase Auth (e.g. earlier interrupted registration attempt).
                // Authenticate with the provided credentials.
                val signInResult = try {
                    auth.signInWithEmailAndPassword(cleanEmail, passwordPin).await()
                } catch (authEx: Exception) {
                    return Resource.Error(
                        "An account with this email is already registered with a different security PIN/password. Please verify your credentials or use another email.",
                        authEx
                    )
                }
                val user = signInResult.user ?: throw IllegalStateException("Firebase Auth sign-in failed")
                uid = user.uid

                // Check if an ACTIVE worker profile already exists for this authenticated UID
                try {
                    val userDoc = firestore.collection(FirebaseConstants.COLLECTION_USERS).document(uid).get().await()
                    if (userDoc.exists()) {
                        val status = userDoc.getString(FirebaseConstants.FIELD_STATUS)
                        if (status == UserStatus.ACTIVE.name) {
                            auth.signOut()
                            return Resource.Error("An active worker account with this email already exists. Please log in directly.")
                        }
                    }
                } catch (_: Exception) {
                    // Ignore read error
                }

                // Check if a PENDING registration is already active for this email
                try {
                    val pendingRegQuery = firestore.collection(FirebaseConstants.COLLECTION_REGISTRATIONS)
                        .whereEqualTo("submittedData.email", cleanEmail)
                        .whereEqualTo(FirebaseConstants.FIELD_STATUS, RegistrationStatus.PENDING.name)
                        .limit(1)
                        .get()
                        .await()

                    if (!pendingRegQuery.isEmpty) {
                        auth.signOut()
                        return Resource.Error("A registration for this account is already submitted and awaiting administrator review.")
                    }
                } catch (_: Exception) {
                    // Ignore read error
                }
            }

            // Compute default wage for the trade if not explicitly set
            val defaultWage = JobRole.fromNameOrDisplay(data.jobRole).defaultDailyWage
            val initialWage = if (data.dailyWage > 0.0) data.dailyWage else defaultWage

            val normalizedSubmittedData = data.copy(
                phone = normalizedPhone,
                emergencyContactPhone = normalizedEmergencyPhone,
                workerId = cleanWorkerId,
                email = cleanEmail,
                dailyWage = initialWage
            )

            // 2. Perform Firestore writes WHILE AUTHENTICATED
            // Note: auth.signOut() is deliberately deferred until AFTER all Firestore writes succeed.
            val regRef = firestore.collection(FirebaseConstants.COLLECTION_REGISTRATIONS).document()
            try {
                // Save worker user record in /users/{uid} with status = PENDING
                val userRecord = User(
                    uid = uid,
                    role = UserRole.WORKER,
                    name = data.fullName.trim(),
                    email = cleanEmail,
                    phone = normalizedPhone,
                    status = UserStatus.PENDING,
                    createdAt = Timestamp.now(),
                    updatedAt = Timestamp.now()
                )
                firestore.collection(FirebaseConstants.COLLECTION_USERS)
                    .document(uid)
                    .set(userRecord)
                    .await()

                // Save registration document in /workerRegistrations/{regId} with status = PENDING
                val registration = WorkerRegistration(
                    registrationId = regRef.id,
                    workerId = cleanWorkerId,
                    submittedData = normalizedSubmittedData,
                    status = RegistrationStatus.PENDING,
                    submittedAt = Timestamp.now()
                )
                regRef.set(registration).await()

                // 3. Sign out ONLY after successful Firestore persistence
                // This ensures security rules are satisfied during write, while preventing
                // automatic worker session access until approved by an administrator.
                auth.signOut()

                Resource.Success(regRef.id)
            } catch (writeException: Exception) {
                // If a new Auth account was created during this attempt but Firestore write failed,
                // attempt to delete the incomplete Auth account so the user can cleanly retry without collisions.
                if (isNewAuthUser) {
                    try {
                        auth.currentUser?.delete()?.await()
                    } catch (_: Exception) {
                        // Best-effort cleanup
                    }
                }
                auth.signOut()
                Resource.Error(FirebaseErrorParser.parse(writeException), writeException)
            }
        } catch (e: Exception) {
            try {
                auth.signOut()
            } catch (_: Exception) {
            }
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun getPendingRegistrations(): Resource<List<WorkerRegistration>> {
        return try {
            val snapshot = firestore.collection(FirebaseConstants.COLLECTION_REGISTRATIONS)
                .whereEqualTo(FirebaseConstants.FIELD_STATUS, RegistrationStatus.PENDING.name)
                .get()
                .await()

            val list = snapshot.documents.mapNotNull { doc ->
                try {
                    doc.toObject(WorkerRegistration::class.java)
                } catch (_: Exception) {
                    try {
                        val statusStr = doc.getString("status") ?: RegistrationStatus.PENDING.name
                        val regStatus = try {
                            RegistrationStatus.valueOf(statusStr)
                        } catch (_: Exception) {
                            RegistrationStatus.PENDING
                        }
                        val regId = doc.getString("registrationId") ?: doc.id
                        val wId = doc.getString("workerId") ?: ""
                        val subMap = doc.get("submittedData") as? Map<*, *>
                        val subData = if (subMap != null) {
                            SubmittedData(
                                fullName = subMap["fullName"] as? String ?: "",
                                dateOfBirth = subMap["dateOfBirth"] as? String ?: "",
                                phone = subMap["phone"] as? String ?: "",
                                email = subMap["email"] as? String ?: "",
                                address = subMap["address"] as? String ?: "",
                                emergencyContactName = subMap["emergencyContactName"] as? String ?: "",
                                emergencyContactPhone = subMap["emergencyContactPhone"] as? String ?: "",
                                workerId = subMap["workerId"] as? String ?: "",
                                batchNumber = subMap["batchNumber"] as? String ?: "",
                                jobRole = subMap["jobRole"] as? String ?: "",
                                siteId = subMap["siteId"] as? String ?: "",
                                joiningDate = subMap["joiningDate"] as? String ?: "",
                                dailyWage = (subMap["dailyWage"] as? Number)?.toDouble() ?: 0.0
                            )
                        } else {
                            SubmittedData()
                        }
                        val ts = doc.getTimestamp("submittedAt") ?: Timestamp.now()
                        WorkerRegistration(
                            registrationId = regId,
                            workerId = wId,
                            submittedData = subData,
                            status = regStatus,
                            submittedAt = ts
                        )
                    } catch (_: Exception) {
                        null
                    }
                }
            }.sortedBy { it.submittedAt }

            Resource.Success(list)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun approveRegistration(registrationId: String, adminUid: String): Resource<Unit> {
        return try {
            val currentAdmin = auth.currentUser
                ?: return Resource.Error("Unauthorized: Administrator must be authenticated.")
            val actualAdminUid = if (adminUid.isNotBlank()) adminUid else currentAdmin.uid

            val regRef = firestore.collection(FirebaseConstants.COLLECTION_REGISTRATIONS).document(registrationId)
            val regDoc = regRef.get().await()
            if (!regDoc.exists()) {
                return Resource.Error("Registration record not found.")
            }

            val reg = try {
                regDoc.toObject(WorkerRegistration::class.java)
            } catch (_: Exception) {
                null
            } ?: run {
                val statusStr = regDoc.getString("status") ?: RegistrationStatus.PENDING.name
                val regStatus = try {
                    RegistrationStatus.valueOf(statusStr)
                } catch (_: Exception) {
                    RegistrationStatus.PENDING
                }
                val regId = regDoc.getString("registrationId") ?: regDoc.id
                val wId = regDoc.getString("workerId") ?: ""
                val subMap = regDoc.get("submittedData") as? Map<*, *>
                val subData = if (subMap != null) {
                    SubmittedData(
                        fullName = subMap["fullName"] as? String ?: "",
                        dateOfBirth = subMap["dateOfBirth"] as? String ?: "",
                        phone = subMap["phone"] as? String ?: "",
                        email = subMap["email"] as? String ?: "",
                        address = subMap["address"] as? String ?: "",
                        emergencyContactName = subMap["emergencyContactName"] as? String ?: "",
                        emergencyContactPhone = subMap["emergencyContactPhone"] as? String ?: "",
                        workerId = subMap["workerId"] as? String ?: "",
                        batchNumber = subMap["batchNumber"] as? String ?: "",
                        jobRole = subMap["jobRole"] as? String ?: "",
                        siteId = subMap["siteId"] as? String ?: "",
                        joiningDate = subMap["joiningDate"] as? String ?: "",
                        dailyWage = (subMap["dailyWage"] as? Number)?.toDouble() ?: 0.0
                    )
                } else {
                    SubmittedData()
                }
                WorkerRegistration(
                    registrationId = regId,
                    workerId = wId,
                    submittedData = subData,
                    status = regStatus
                )
            }

            val sub = reg.submittedData

            // Find matching user by email
            val userQuery = firestore.collection(FirebaseConstants.COLLECTION_USERS)
                .whereEqualTo(FirebaseConstants.FIELD_EMAIL, sub.email.trim())
                .limit(1)
                .get()
                .await()

            val uid = if (!userQuery.isEmpty) {
                userQuery.documents.first().id
            } else ""

            val batch = firestore.batch()

            // Update registration document
            batch.update(regRef, mapOf(
                FirebaseConstants.FIELD_STATUS to RegistrationStatus.APPROVED.name,
                "reviewedAt" to Timestamp.now(),
                "reviewedBy" to actualAdminUid
            ))

            // Update user document if exists
            if (uid.isNotBlank()) {
                val userRef = firestore.collection(FirebaseConstants.COLLECTION_USERS).document(uid)
                batch.update(userRef, mapOf(
                    FirebaseConstants.FIELD_STATUS to UserStatus.ACTIVE.name,
                    FirebaseConstants.FIELD_UPDATED_AT to Timestamp.now()
                ))
            }

            // Create worker document in /workers/{workerId}
            val effectiveWorkerId = if (reg.workerId.isNotBlank()) {
                reg.workerId
            } else if (sub.workerId.isNotBlank()) {
                sub.workerId
            } else {
                "W-${(1000..9999).random()}"
            }
            val workerRef = firestore.collection(FirebaseConstants.COLLECTION_WORKERS).document(effectiveWorkerId)
            val defaultWage = JobRole.fromNameOrDisplay(sub.jobRole).defaultDailyWage
            val finalWage = if (sub.dailyWage > 0.0) sub.dailyWage else defaultWage

            val newWorker = Worker(
                workerId = effectiveWorkerId,
                uid = uid,
                fullName = sub.fullName,
                phone = sub.phone,
                email = sub.email,
                batchNumber = sub.batchNumber,
                jobRole = sub.jobRole,
                siteId = sub.siteId,
                dateOfBirth = sub.dateOfBirth,
                address = sub.address,
                emergencyContactName = sub.emergencyContactName,
                emergencyContactPhone = sub.emergencyContactPhone,
                joiningDate = sub.joiningDate,
                status = UserStatus.ACTIVE,
                createdAt = Timestamp.now(),
                updatedAt = Timestamp.now(),
                dailyWage = finalWage
            )
            batch.set(workerRef, newWorker)

            batch.commit().await()
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun rejectRegistration(registrationId: String, adminUid: String): Resource<Unit> {
        return try {
            val currentAdmin = auth.currentUser
                ?: return Resource.Error("Unauthorized: Administrator must be authenticated.")
            val actualAdminUid = if (adminUid.isNotBlank()) adminUid else currentAdmin.uid

            val regRef = firestore.collection(FirebaseConstants.COLLECTION_REGISTRATIONS).document(registrationId)
            val regDoc = regRef.get().await()
            if (!regDoc.exists()) return Resource.Error("Registration not found.")

            val reg = try {
                regDoc.toObject(WorkerRegistration::class.java)
            } catch (_: Exception) {
                null
            }

            val batch = firestore.batch()
            batch.update(regRef, mapOf(
                FirebaseConstants.FIELD_STATUS to RegistrationStatus.REJECTED.name,
                "reviewedAt" to Timestamp.now(),
                "reviewedBy" to actualAdminUid
            ))

            if (reg != null) {
                val userQuery = firestore.collection(FirebaseConstants.COLLECTION_USERS)
                    .whereEqualTo(FirebaseConstants.FIELD_EMAIL, reg.submittedData.email.trim())
                    .limit(1)
                    .get()
                    .await()

                if (!userQuery.isEmpty) {
                    val userRef = firestore.collection(FirebaseConstants.COLLECTION_USERS).document(userQuery.documents.first().id)
                    batch.update(userRef, mapOf(
                        FirebaseConstants.FIELD_STATUS to UserStatus.REJECTED.name,
                        FirebaseConstants.FIELD_UPDATED_AT to Timestamp.now()
                    ))
                }
            }

            batch.commit().await()
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun suspendRegistration(registrationId: String, adminUid: String): Resource<Unit> {
        return try {
            val currentAdmin = auth.currentUser
                ?: return Resource.Error("Unauthorized: Administrator must be authenticated.")
            val actualAdminUid = if (adminUid.isNotBlank()) adminUid else currentAdmin.uid

            firestore.collection(FirebaseConstants.COLLECTION_REGISTRATIONS)
                .document(registrationId)
                .update(mapOf(
                    FirebaseConstants.FIELD_STATUS to RegistrationStatus.SUSPENDED.name,
                    "reviewedAt" to Timestamp.now(),
                    "reviewedBy" to actualAdminUid
                )).await()
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }
}
