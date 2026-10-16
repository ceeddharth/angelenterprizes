package com.civilworkforce.attendance.ui.navigation

sealed class Screen(val route: String) {
    object Splash : Screen("splash")
    object Welcome : Screen("welcome")
    object AdminLogin : Screen("admin_login")
    object WorkerLogin : Screen("worker_login")
    object WorkerRegistration : Screen("worker_registration")
    object AdminDashboard : Screen("admin_dashboard")
    object AdminWorkerManagement : Screen("admin_workers")
    object AdminWorkerDetail : Screen("admin_worker_detail/{workerId}") {
        fun createRoute(workerId: String) = "admin_worker_detail/$workerId"
    }
    object PendingRegistrations : Screen("admin_pending_registrations")
    object AdminSiteManagement : Screen("admin_sites")
    object AdminSiteForm : Screen("admin_site_form?siteId={siteId}") {
        fun createRoute(siteId: String? = null) = if (siteId != null) "admin_site_form?siteId=$siteId" else "admin_site_form"
    }
    object AdminBatchManagement : Screen("admin_batches")
    object WorkerDashboard : Screen("worker_dashboard")
    object WorkerProfile : Screen("worker_profile")
    object WorkerQrScanner : Screen("worker_qr_scanner")
    object AdminQrKiosk : Screen("admin_qr_kiosk")
    object AdminAiOperationsAssistant : Screen("admin_ai_operations")
}
