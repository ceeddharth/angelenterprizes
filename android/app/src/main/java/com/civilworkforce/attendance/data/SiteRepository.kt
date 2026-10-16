package com.civilworkforce.attendance.data

import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.Site
import com.civilworkforce.attendance.model.SiteStatus
import com.civilworkforce.attendance.util.FirebaseErrorParser
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

interface SiteRepository {
    suspend fun getAllSites(): Resource<List<Site>>
    suspend fun getActiveSites(): Resource<List<Site>>
    suspend fun getSiteById(siteId: String): Resource<Site?>
    suspend fun createSite(site: Site): Resource<Unit>
    suspend fun updateSite(site: Site): Resource<Unit>
    suspend fun toggleSiteStatus(siteId: String, currentStatus: SiteStatus): Resource<Unit>
}

class FirebaseSiteRepository(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance()
) : SiteRepository {

    override suspend fun getAllSites(): Resource<List<Site>> {
        return try {
            val snapshot = firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .orderBy(FirebaseConstants.FIELD_CREATED_AT)
                .get()
                .await()

            val list = snapshot.documents.mapNotNull { doc ->
                doc.toObject(Site::class.java)?.copy(siteId = doc.id)
            }
            Resource.Success(list)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun getActiveSites(): Resource<List<Site>> {
        return try {
            val snapshot = firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .whereEqualTo(FirebaseConstants.FIELD_STATUS, SiteStatus.ACTIVE.name)
                .get()
                .await()

            val list = snapshot.documents.mapNotNull { doc ->
                doc.toObject(Site::class.java)?.copy(siteId = doc.id)
            }
            Resource.Success(list)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun getSiteById(siteId: String): Resource<Site?> {
        return try {
            val doc = firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .document(siteId)
                .get()
                .await()

            if (doc.exists()) {
                val site = doc.toObject(Site::class.java)?.copy(siteId = doc.id)
                Resource.Success(site)
            } else {
                Resource.Success(null)
            }
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun createSite(site: Site): Resource<Unit> {
        return try {
            val siteRef = if (site.siteId.isNotBlank()) {
                firestore.collection(FirebaseConstants.COLLECTION_SITES).document(site.siteId)
            } else {
                firestore.collection(FirebaseConstants.COLLECTION_SITES).document()
            }

            val finalSite = site.copy(
                siteId = siteRef.id,
                createdAt = Timestamp.now(),
                updatedAt = Timestamp.now()
            )

            siteRef.set(finalSite).await()
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun updateSite(site: Site): Resource<Unit> {
        return try {
            if (site.siteId.isBlank()) return Resource.Error("Site ID cannot be empty for updates.")

            val siteRef = firestore.collection(FirebaseConstants.COLLECTION_SITES).document(site.siteId)
            val updated = site.copy(updatedAt = Timestamp.now())

            siteRef.set(updated).await()
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun toggleSiteStatus(siteId: String, currentStatus: SiteStatus): Resource<Unit> {
        return try {
            val newStatus = if (currentStatus == SiteStatus.ACTIVE) SiteStatus.INACTIVE else SiteStatus.ACTIVE
            firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .document(siteId)
                .update(
                    mapOf(
                        FirebaseConstants.FIELD_STATUS to newStatus.name,
                        FirebaseConstants.FIELD_UPDATED_AT to Timestamp.now()
                    )
                ).await()
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }
}
