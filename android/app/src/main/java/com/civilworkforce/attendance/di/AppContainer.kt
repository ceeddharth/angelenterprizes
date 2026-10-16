package com.civilworkforce.attendance.di

import android.content.Context
import com.civilworkforce.attendance.data.AttendanceQueueManager
import com.civilworkforce.attendance.data.AttendanceRepository
import com.civilworkforce.attendance.data.AuthRepository
import com.civilworkforce.attendance.data.DashboardRepository
import com.civilworkforce.attendance.data.FirebaseAuthRepository
import com.civilworkforce.attendance.data.FirebaseDashboardRepository
import com.civilworkforce.attendance.data.FirebaseRegistrationRepository
import com.civilworkforce.attendance.data.FirebaseSiteRepository
import com.civilworkforce.attendance.data.FirebaseStorageRepository
import com.civilworkforce.attendance.data.FirebaseWorkerRepository
import com.civilworkforce.attendance.data.RegistrationRepository
import com.civilworkforce.attendance.data.SiteRepository
import com.civilworkforce.attendance.data.StorageRepository
import com.civilworkforce.attendance.data.WorkerRepository
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage

/**
 * Dependency container for manual DI, architected for 1:1 migration to Hilt.
 */
interface AppContainer {
    val authRepository: AuthRepository
    val workerRepository: WorkerRepository
    val siteRepository: SiteRepository
    val registrationRepository: RegistrationRepository
    val dashboardRepository: DashboardRepository
    val storageRepository: StorageRepository
    val attendanceQueueManager: AttendanceQueueManager
    val attendanceRepository: AttendanceRepository
    val batchRepository: com.civilworkforce.attendance.data.BatchRepository
    val aiOperationsRepository: com.civilworkforce.attendance.data.AiOperationsRepository
}

class DefaultAppContainer(private val context: Context) : AppContainer {
    private val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }
    private val firestore: FirebaseFirestore by lazy { FirebaseFirestore.getInstance() }
    private val storage: FirebaseStorage by lazy { FirebaseStorage.getInstance() }

    override val attendanceQueueManager: AttendanceQueueManager by lazy {
        AttendanceQueueManager(context, auth)
    }

    override val authRepository: AuthRepository by lazy {
        FirebaseAuthRepository(auth, firestore)
    }

    override val workerRepository: WorkerRepository by lazy {
        FirebaseWorkerRepository(firestore, auth)
    }

    override val siteRepository: SiteRepository by lazy {
        FirebaseSiteRepository(firestore)
    }

    override val batchRepository: com.civilworkforce.attendance.data.BatchRepository by lazy {
        com.civilworkforce.attendance.data.FirebaseBatchRepository(firestore)
    }

    override val registrationRepository: RegistrationRepository by lazy {
        FirebaseRegistrationRepository(firestore, auth)
    }

    override val dashboardRepository: DashboardRepository by lazy {
        FirebaseDashboardRepository(firestore)
    }

    override val storageRepository: StorageRepository by lazy {
        FirebaseStorageRepository(firestore, storage, auth)
    }

    override val attendanceRepository: AttendanceRepository by lazy {
        AttendanceRepository(auth, firestore, attendanceQueueManager)
    }

    override val aiOperationsRepository: com.civilworkforce.attendance.data.AiOperationsRepository by lazy {
        com.civilworkforce.attendance.data.FirebaseAiOperationsRepository(firestore, auth)
    }
}
