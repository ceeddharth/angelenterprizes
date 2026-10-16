package com.civilworkforce.attendance.data

import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.User
import com.civilworkforce.attendance.model.UserRole
import com.civilworkforce.attendance.model.UserStatus
import com.civilworkforce.attendance.util.FirebaseErrorParser
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

interface AuthRepository {
    suspend fun loginAdmin(email: String, password: String): Resource<User>
    suspend fun loginWorker(identifier: String, pinOrPassword: String): Resource<User>
    suspend fun sendPasswordReset(email: String): Resource<Unit>
    suspend fun getCurrentUser(): Resource<User?>
    suspend fun logout()
    fun isUserLoggedIn(): Boolean
}

class FirebaseAuthRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance()
) : AuthRepository {

    override suspend fun loginAdmin(email: String, password: String): Resource<User> {
        return try {
            val authResult = auth.signInWithEmailAndPassword(email.trim(), password).await()
            val uid = authResult.user?.uid ?: throw IllegalStateException("Authentication failed: Missing UID")

            // Strict Role Enforcement in Repository Layer
            val userDoc = firestore.collection(FirebaseConstants.COLLECTION_USERS)
                .document(uid)
                .get()
                .await()

            if (!userDoc.exists()) {
                auth.signOut()
                return Resource.Error("User record not found in workforce directory. Please contact operations.")
            }

            val user = userDoc.toObject(User::class.java)
                ?: return Resource.Error("Malformed user profile in database.")

            if (user.role != UserRole.ADMIN) {
                auth.signOut()
                return Resource.Error("Access Denied: This portal is reserved for site administrators only.")
            }

            if (user.status == UserStatus.SUSPENDED) {
                auth.signOut()
                return Resource.Error("Your administrator account is currently suspended. Please contact headquarters.")
            }

            Resource.Success(user)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun loginWorker(identifier: String, pinOrPassword: String): Resource<User> {
        return try {
            val cleanId = identifier.trim()
            var emailToUse: String? = null

            if (cleanId.contains("@")) {
                emailToUse = cleanId
            } else {
                // Check if worker provided Worker ID
                val workerQuery = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                    .whereEqualTo(FirebaseConstants.FIELD_WORKER_ID, cleanId)
                    .limit(1)
                    .get()
                    .await()

                if (!workerQuery.isEmpty) {
                    emailToUse = workerQuery.documents.first().getString("email")
                } else {
                    // Check if worker provided registered mobile number (try normalized national format first)
                    val normalizedPhone = ValidationUtils.normalizePhone(cleanId)
                    val phoneQuery = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                        .whereEqualTo(FirebaseConstants.FIELD_PHONE, normalizedPhone)
                        .limit(1)
                        .get()
                        .await()

                    if (!phoneQuery.isEmpty) {
                        emailToUse = phoneQuery.documents.first().getString("email")
                    } else {
                        // Fallback check with raw cleanId in case of legacy records
                        val rawPhoneQuery = firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                            .whereEqualTo(FirebaseConstants.FIELD_PHONE, cleanId)
                            .limit(1)
                            .get()
                            .await()

                        if (!rawPhoneQuery.isEmpty) {
                            emailToUse = rawPhoneQuery.documents.first().getString("email")
                        } else {
                            // Check /users collection for pending registrations by phone
                            val userPhoneQuery = firestore.collection(FirebaseConstants.COLLECTION_USERS)
                                .whereEqualTo(FirebaseConstants.FIELD_PHONE, normalizedPhone)
                                .limit(1)
                                .get()
                                .await()
                            if (!userPhoneQuery.isEmpty) {
                                emailToUse = userPhoneQuery.documents.first().getString("email")
                            }
                        }
                    }
                }
            }

            if (emailToUse.isNullOrBlank()) {
                return Resource.Error("No registered worker found with Worker ID or Phone: '$cleanId'. Please register first.")
            }

            val authResult = auth.signInWithEmailAndPassword(emailToUse, pinOrPassword).await()
            val uid = authResult.user?.uid ?: throw IllegalStateException("Worker login failed")

            val userDoc = firestore.collection(FirebaseConstants.COLLECTION_USERS)
                .document(uid)
                .get()
                .await()

            if (!userDoc.exists()) {
                auth.signOut()
                return Resource.Error("Worker user record missing. Please contact your site supervisor.")
            }

            val user = userDoc.toObject(User::class.java)
                ?: return Resource.Error("Unable to read worker profile.")

            if (user.status == UserStatus.PENDING) {
                auth.signOut()
                return Resource.Error("Your registration is still under review by site administration. Please wait for approval.")
            }

            if (user.status == UserStatus.SUSPENDED || user.status == UserStatus.REJECTED) {
                auth.signOut()
                return Resource.Error("This worker account has been ${user.status.name.lowercase()}. Please contact site HR.")
            }

            Resource.Success(user)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun sendPasswordReset(email: String): Resource<Unit> {
        return try {
            auth.sendPasswordResetEmail(email.trim()).await()
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun getCurrentUser(): Resource<User?> {
        return try {
            val firebaseUser = auth.currentUser ?: return Resource.Success(null)
            val doc = firestore.collection(FirebaseConstants.COLLECTION_USERS)
                .document(firebaseUser.uid)
                .get()
                .await()

            if (!doc.exists()) {
                Resource.Success(null)
            } else {
                Resource.Success(doc.toObject(User::class.java))
            }
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun logout() {
        auth.signOut()
    }

    override fun isUserLoggedIn(): Boolean = auth.currentUser != null
}
