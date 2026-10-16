package com.civilworkforce.attendance.data

import com.civilworkforce.attendance.model.ProfilePhoto
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.SitePhoto
import com.civilworkforce.attendance.model.UserRole
import com.civilworkforce.attendance.util.FirebaseErrorParser
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageMetadata
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

interface StorageRepository {
    suspend fun uploadWorkerProfilePhoto(
        workerId: String,
        imageBytes: ByteArray,
        mimeType: String = "image/jpeg",
        fileName: String = "profile.jpg"
    ): Resource<ProfilePhoto>

    suspend fun deleteWorkerProfilePhoto(workerId: String): Resource<Unit>

    suspend fun getWorkerProfilePhoto(workerId: String): Resource<ProfilePhoto?>

    suspend fun uploadSitePhoto(
        siteId: String,
        imageBytes: ByteArray,
        mimeType: String = "image/jpeg",
        fileName: String = "site_photo.jpg"
    ): Resource<SitePhoto>

    fun getSitePhotosFlow(siteId: String): Flow<Resource<List<SitePhoto>>>

    suspend fun getSitePhotos(siteId: String): Resource<List<SitePhoto>>

    suspend fun deleteSitePhoto(siteId: String, photoId: String): Resource<Unit>
}

class FirebaseStorageRepository(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val storage: FirebaseStorage = FirebaseStorage.getInstance(),
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
) : StorageRepository {

    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = java.util.TimeZone.getTimeZone("UTC")
    }

    /**
     * Role and ownership validation helper.
     * Prevents cross-worker photo access, guaranteeing HTTP 403 authorization semantics.
     */
    private suspend fun verifyWorkerAccess(workerId: String): Pair<Boolean, Boolean> {
        val currentUser = auth.currentUser ?: return Pair(false, false)
        val uid = currentUser.uid

        // 1. Check if caller is Admin
        val userDoc = firestore.collection(FirebaseConstants.COLLECTION_USERS).document(uid).get().await()
        val isAdmin = userDoc.exists() && userDoc.getString(FirebaseConstants.FIELD_ROLE) == UserRole.ADMIN.name

        // 2. Check if caller owns workerId
        val workerDoc = firestore.collection(FirebaseConstants.COLLECTION_WORKERS).document(workerId).get().await()
        val isOwner = workerDoc.exists() && (
            workerDoc.getString(FirebaseConstants.FIELD_UID) == uid ||
            workerDoc.getString("userId") == uid
        )

        return Pair(isAdmin, isOwner)
    }

    private suspend fun verifyAdmin(): Boolean {
        val currentUser = auth.currentUser ?: return false
        val userDoc = firestore.collection(FirebaseConstants.COLLECTION_USERS).document(currentUser.uid).get().await()
        return userDoc.exists() && userDoc.getString(FirebaseConstants.FIELD_ROLE) == UserRole.ADMIN.name
    }

    override suspend fun uploadWorkerProfilePhoto(
        workerId: String,
        imageBytes: ByteArray,
        mimeType: String,
        fileName: String
    ): Resource<ProfilePhoto> {
        return try {
            val (isAdmin, isOwner) = verifyWorkerAccess(workerId)
            if (!isAdmin && !isOwner) {
                return Resource.Error("Unauthorized (403): Workers can view and manage only their own profile photo.")
            }

            if (imageBytes.size > 5 * 1024 * 1024) {
                return Resource.Error("File rejected: Photo size exceeds 5MB limit.")
            }

            val ext = when (mimeType) {
                "image/png" -> "png"
                "image/webp" -> "webp"
                else -> "jpg"
            }
            val photoId = "worker_photo_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(8)}"
            val storagePath = "${FirebaseConstants.STORAGE_PATH_WORKER_PHOTOS}/$workerId/$photoId.$ext"
            val storageRef = storage.reference.child(storagePath)

            val metadata = StorageMetadata.Builder()
                .setContentType(mimeType)
                .setCustomMetadata("workerId", workerId)
                .setCustomMetadata("uploadedBy", auth.currentUser?.uid ?: "")
                .build()

            // 1. Upload bytes to Firebase Storage
            storageRef.putBytes(imageBytes, metadata).await()
            val downloadUrl = storageRef.downloadUrl.await().toString()

            val photo = ProfilePhoto(
                photoId = photoId,
                workerId = workerId,
                storagePath = storagePath,
                downloadUrl = downloadUrl,
                fileName = fileName,
                contentType = mimeType,
                fileSize = imageBytes.size.toLong(),
                uploadedBy = auth.currentUser?.email ?: auth.currentUser?.uid ?: "",
                uploadedAt = isoFormat.format(Date())
            )

            // 2. Update worker document in Firestore with metadata reference
            firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                .document(workerId)
                .update(
                    mapOf(
                        "profilePhoto" to photo,
                        FirebaseConstants.FIELD_UPDATED_AT to Timestamp.now()
                    )
                ).await()

            Resource.Success(photo)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun deleteWorkerProfilePhoto(workerId: String): Resource<Unit> {
        return try {
            val (isAdmin, isOwner) = verifyWorkerAccess(workerId)
            if (!isAdmin && !isOwner) {
                return Resource.Error("Unauthorized (403): Access denied.")
            }

            val workerDoc = firestore.collection(FirebaseConstants.COLLECTION_WORKERS).document(workerId).get().await()
            val photoMap = workerDoc.get("profilePhoto") as? Map<*, *>
            val storagePath = photoMap?.get("storagePath") as? String

            if (!storagePath.isNullOrBlank()) {
                try {
                    storage.reference.child(storagePath).delete().await()
                } catch (_: Exception) {
                    // Ignore if already removed from storage
                }
            }

            firestore.collection(FirebaseConstants.COLLECTION_WORKERS)
                .document(workerId)
                .update(
                    mapOf(
                        "profilePhoto" to FieldValue.delete(),
                        FirebaseConstants.FIELD_UPDATED_AT to Timestamp.now()
                    )
                ).await()

            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun getWorkerProfilePhoto(workerId: String): Resource<ProfilePhoto?> {
        return try {
            val (isAdmin, isOwner) = verifyWorkerAccess(workerId)
            if (!isAdmin && !isOwner) {
                return Resource.Error("Forbidden (403): Access denied. Workers cannot view other workers' photos.")
            }

            val workerDoc = firestore.collection(FirebaseConstants.COLLECTION_WORKERS).document(workerId).get().await()
            val photo = workerDoc.toObject(com.civilworkforce.attendance.model.Worker::class.java)?.profilePhoto
            Resource.Success(photo)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun uploadSitePhoto(
        siteId: String,
        imageBytes: ByteArray,
        mimeType: String,
        fileName: String
    ): Resource<SitePhoto> {
        return try {
            if (!verifyAdmin()) {
                return Resource.Error("Unauthorized (403): Only administrators can manage construction site photos.")
            }

            if (imageBytes.size > 5 * 1024 * 1024) {
                return Resource.Error("File rejected: Site photo exceeds 5MB limit.")
            }

            // Enforce 1–5 photos per site constraint
            val photosSnap = firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .document(siteId)
                .collection(FirebaseConstants.SUBCOLLECTION_PHOTOS)
                .get()
                .await()

            if (photosSnap.size() >= 5) {
                return Resource.Error("Limit reached: A construction site can have at most 5 photos.")
            }

            val ext = when (mimeType) {
                "image/png" -> "png"
                "image/webp" -> "webp"
                else -> "jpg"
            }
            val photoId = "site_photo_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(8)}"
            val storagePath = "${FirebaseConstants.STORAGE_PATH_SITE_PHOTOS}/$siteId/$photoId.$ext"
            val storageRef = storage.reference.child(storagePath)

            val metadata = StorageMetadata.Builder()
                .setContentType(mimeType)
                .setCustomMetadata("siteId", siteId)
                .setCustomMetadata("uploadedBy", auth.currentUser?.uid ?: "")
                .build()

            // 1. Upload to Firebase Storage
            storageRef.putBytes(imageBytes, metadata).await()
            val downloadUrl = storageRef.downloadUrl.await().toString()

            val sitePhoto = SitePhoto(
                photoId = photoId,
                siteId = siteId,
                storagePath = storagePath,
                downloadUrl = downloadUrl,
                fileName = fileName,
                contentType = mimeType,
                fileSize = imageBytes.size.toLong(),
                uploadedBy = auth.currentUser?.email ?: auth.currentUser?.uid ?: "",
                uploadedAt = isoFormat.format(Date()),
                displayOrder = photosSnap.size() + 1
            )

            // 2. Write metadata to subcollection /sites/{siteId}/photos/{photoId}
            firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .document(siteId)
                .collection(FirebaseConstants.SUBCOLLECTION_PHOTOS)
                .document(photoId)
                .set(sitePhoto)
                .await()

            firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .document(siteId)
                .update("photosCount", FieldValue.increment(1))
                .await()

            Resource.Success(sitePhoto)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override fun getSitePhotosFlow(siteId: String): Flow<Resource<List<SitePhoto>>> = callbackFlow {
        val listener = firestore.collection(FirebaseConstants.COLLECTION_SITES)
            .document(siteId)
            .collection(FirebaseConstants.SUBCOLLECTION_PHOTOS)
            .orderBy(FirebaseConstants.FIELD_DISPLAY_ORDER)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    trySend(Resource.Error(FirebaseErrorParser.parse(error), error))
                    return@addSnapshotListener
                }
                val photos = snapshot?.toObjects(SitePhoto::class.java) ?: emptyList()
                trySend(Resource.Success(photos))
            }
        awaitClose { listener.remove() }
    }

    override suspend fun getSitePhotos(siteId: String): Resource<List<SitePhoto>> {
        return try {
            val snapshot = firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .document(siteId)
                .collection(FirebaseConstants.SUBCOLLECTION_PHOTOS)
                .orderBy(FirebaseConstants.FIELD_DISPLAY_ORDER)
                .get()
                .await()
            val photos = snapshot.toObjects(SitePhoto::class.java)
            Resource.Success(photos)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun deleteSitePhoto(siteId: String, photoId: String): Resource<Unit> {
        return try {
            if (!verifyAdmin()) {
                return Resource.Error("Unauthorized (403): Only administrators can delete site photos.")
            }

            val photoDoc = firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .document(siteId)
                .collection(FirebaseConstants.SUBCOLLECTION_PHOTOS)
                .document(photoId)
                .get()
                .await()

            val storagePath = photoDoc.getString("storagePath")
            if (!storagePath.isNullOrBlank()) {
                try {
                    storage.reference.child(storagePath).delete().await()
                } catch (_: Exception) {
                }
            }

            firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .document(siteId)
                .collection(FirebaseConstants.SUBCOLLECTION_PHOTOS)
                .document(photoId)
                .delete()
                .await()

            firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .document(siteId)
                .update("photosCount", FieldValue.increment(-1))
                .await()

            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }
}
