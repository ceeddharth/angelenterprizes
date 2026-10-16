package com.civilworkforce.attendance.data

object FirebaseConstants {
    const val COLLECTION_USERS = "users"
    const val COLLECTION_WORKERS = "workers"
    const val COLLECTION_SITES = "sites"
    const val COLLECTION_BATCHES = "batches"
    const val COLLECTION_REGISTRATIONS = "workerRegistrations"
    const val COLLECTION_ATTENDANCE = "attendance"
    const val COLLECTION_ACTIVE_QR_SESSIONS = "activeQrSessions"
    const val SUBCOLLECTION_PHOTOS = "photos"

    // Storage Paths
    const val STORAGE_PATH_WORKER_PHOTOS = "workerPhotos"
    const val STORAGE_PATH_SITE_PHOTOS = "sitePhotos"

    // Field names for queries
    const val FIELD_ROLE = "role"
    const val FIELD_STATUS = "status"
    const val FIELD_EMAIL = "email"
    const val FIELD_PHONE = "phone"
    const val FIELD_WORKER_ID = "workerId"
    const val FIELD_UID = "uid"
    const val FIELD_SITE_ID = "siteId"
    const val FIELD_DATE = "date"
    const val FIELD_SUBMITTED_AT = "submittedAt"
    const val FIELD_CREATED_AT = "createdAt"
    const val FIELD_UPDATED_AT = "updatedAt"
    const val FIELD_CHECK_IN_TIME = "checkInTime"
    const val FIELD_CHECK_OUT_TIME = "checkOutTime"
    const val FIELD_DISPLAY_ORDER = "displayOrder"

    // Trusted Attendance Backend API URL (Deployed Cloud Run Endpoint)
    const val DEFAULT_BACKEND_URL = "https://ais-dev-ajplfqdqybnoz6xjzrpkpz-636899386416.asia-southeast1.run.app"
}
