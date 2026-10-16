package com.civilworkforce.attendance.data

import com.civilworkforce.attendance.model.DashboardStats
import com.civilworkforce.attendance.model.RecentActivity
import com.civilworkforce.attendance.model.RegistrationStatus
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.UserStatus
import com.civilworkforce.attendance.util.FirebaseErrorParser
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.tasks.await

interface DashboardRepository {
    suspend fun getDashboardStats(): Resource<DashboardStats>
    suspend fun getRecentActivities(): Resource<List<RecentActivity>>
}

class FirebaseDashboardRepository(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance()
) : DashboardRepository {

    override suspend fun getDashboardStats(): Resource<DashboardStats> {
        return try {
            // Real count queries from Firestore
            val workersSnapshot = firestore.collection(FirebaseConstants.COLLECTION_WORKERS).get().await()
            val totalWorkers = workersSnapshot.size()
            val activeWorkers = workersSnapshot.documents.count {
                it.getString(FirebaseConstants.FIELD_STATUS) == UserStatus.ACTIVE.name
            }

            val pendingRegsSnapshot = firestore.collection(FirebaseConstants.COLLECTION_REGISTRATIONS)
                .whereEqualTo(FirebaseConstants.FIELD_STATUS, RegistrationStatus.PENDING.name)
                .get()
                .await()
            val pendingRegistrations = pendingRegsSnapshot.size()

            val sitesSnapshot = firestore.collection(FirebaseConstants.COLLECTION_SITES).get().await()
            val totalSites = sitesSnapshot.size()

            Resource.Success(
                DashboardStats(
                    totalWorkers = totalWorkers,
                    activeWorkers = activeWorkers,
                    pendingRegistrations = pendingRegistrations,
                    totalSites = totalSites
                )
            )
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun getRecentActivities(): Resource<List<RecentActivity>> {
        return try {
            val activities = mutableListOf<RecentActivity>()

            // 1. Fetch recent worker registrations
            val regSnapshot = firestore.collection(FirebaseConstants.COLLECTION_REGISTRATIONS)
                .orderBy(FirebaseConstants.FIELD_SUBMITTED_AT, Query.Direction.DESCENDING)
                .limit(5)
                .get()
                .await()

            for (doc in regSnapshot.documents) {
                val workerId = doc.getString("workerId") ?: "Worker"
                val status = doc.getString("status") ?: "PENDING"
                val timestamp = doc.getTimestamp("submittedAt") ?: com.google.firebase.Timestamp.now()
                activities.add(
                    RecentActivity(
                        id = doc.id,
                        title = "Registration Submitted ($workerId)",
                        description = "Status: $status. Awaiting admin review.",
                        timestamp = timestamp,
                        type = "REGISTRATION"
                    )
                )
            }

            // 2. Fetch recently added sites
            val sitesSnapshot = firestore.collection(FirebaseConstants.COLLECTION_SITES)
                .orderBy(FirebaseConstants.FIELD_CREATED_AT, Query.Direction.DESCENDING)
                .limit(3)
                .get()
                .await()

            for (doc in sitesSnapshot.documents) {
                val siteName = doc.getString("siteName") ?: "Site"
                val projectName = doc.getString("projectName") ?: ""
                val timestamp = doc.getTimestamp("createdAt") ?: com.google.firebase.Timestamp.now()
                activities.add(
                    RecentActivity(
                        id = doc.id,
                        title = "Site Created: $siteName",
                        description = "Project: $projectName",
                        timestamp = timestamp,
                        type = "SITE"
                    )
                )
            }

            // Sort merged real activity by timestamp descending
            activities.sortByDescending { it.timestamp }

            Resource.Success(activities.take(6))
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }
}
