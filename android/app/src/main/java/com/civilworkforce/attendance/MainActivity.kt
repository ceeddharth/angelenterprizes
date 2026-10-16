package com.civilworkforce.attendance

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.civilworkforce.attendance.ui.navigation.Screen
import com.civilworkforce.attendance.ui.screens.admin.*
import com.civilworkforce.attendance.ui.screens.attendance.*
import com.civilworkforce.attendance.ui.screens.auth.*
import com.civilworkforce.attendance.ui.screens.registration.*
import com.civilworkforce.attendance.ui.screens.splash.*
import com.civilworkforce.attendance.ui.screens.welcome.WelcomeScreen
import com.civilworkforce.attendance.ui.screens.worker.*
import com.civilworkforce.attendance.ui.theme.CivilWorkforceTheme
import com.civilworkforce.attendance.ui.theme.ConcreteBackground
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import android.os.Build
import com.civilworkforce.attendance.service.CivilFirebaseMessagingService

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Request notification permission on Android 13+ (API 33+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }

        // Initialize / Sync FCM Device Token with Authenticated Worker UID
        CivilFirebaseMessagingService.syncDeviceTokenForWorker()

        val app = application as CivilWorkforceApp
        val container = app.container

        setContent {
            CivilWorkforceTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = ConcreteBackground
                ) {
                    val navController = rememberNavController()

                    NavHost(
                        navController = navController,
                        startDestination = Screen.Splash.route
                    ) {
                        // 1. Splash Screen
                        composable(Screen.Splash.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return SplashViewModel(container.authRepository) as T
                                    }
                                }
                            )[SplashViewModel::class.java]

                            SplashScreen(
                                viewModel = viewModel,
                                onNavigateToWelcome = {
                                    navController.navigate(Screen.Welcome.route) {
                                        popUpTo(Screen.Splash.route) { inclusive = true }
                                    }
                                },
                                onNavigateToAdminDashboard = {
                                    navController.navigate(Screen.AdminDashboard.route) {
                                        popUpTo(Screen.Splash.route) { inclusive = true }
                                    }
                                },
                                onNavigateToWorkerDashboard = {
                                    navController.navigate(Screen.WorkerDashboard.route) {
                                        popUpTo(Screen.Splash.route) { inclusive = true }
                                    }
                                }
                            )
                        }

                        // 2. Welcome Screen
                        composable(Screen.Welcome.route) {
                            WelcomeScreen(
                                onNavigateToAdminLogin = {
                                    navController.navigate(Screen.AdminLogin.route)
                                },
                                onNavigateToWorkerLogin = {
                                    navController.navigate(Screen.WorkerLogin.route)
                                }
                            )
                        }

                        // 3. Admin Login
                        composable(Screen.AdminLogin.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return AdminLoginViewModel(container.authRepository) as T
                                    }
                                }
                            )[AdminLoginViewModel::class.java]

                            AdminLoginScreen(
                                viewModel = viewModel,
                                onNavigateBack = { navController.popBackStack() },
                                onLoginSuccess = {
                                    navController.navigate(Screen.AdminDashboard.route) {
                                        popUpTo(Screen.Welcome.route) { inclusive = true }
                                    }
                                }
                            )
                        }

                        // 4. Worker Login
                        composable(Screen.WorkerLogin.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return WorkerLoginViewModel(container.authRepository) as T
                                    }
                                }
                            )[WorkerLoginViewModel::class.java]

                            WorkerLoginScreen(
                                viewModel = viewModel,
                                onNavigateBack = { navController.popBackStack() },
                                onNavigateToRegistration = {
                                    navController.navigate(Screen.WorkerRegistration.route)
                                },
                                onLoginSuccess = {
                                    navController.navigate(Screen.WorkerDashboard.route) {
                                        popUpTo(Screen.Welcome.route) { inclusive = true }
                                    }
                                }
                            )
                        }

                        // 5. Worker Registration Multi-Step
                        composable(Screen.WorkerRegistration.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return WorkerRegistrationViewModel(
                                            container.registrationRepository,
                                            container.siteRepository
                                        ) as T
                                    }
                                }
                            )[WorkerRegistrationViewModel::class.java]

                            WorkerRegistrationScreen(
                                viewModel = viewModel,
                                onNavigateBack = { navController.popBackStack() },
                                onRegistrationFinished = {
                                    navController.navigate(Screen.Welcome.route) {
                                        popUpTo(Screen.WorkerRegistration.route) { inclusive = true }
                                    }
                                }
                            )
                        }

                        // 6. Admin Dashboard
                        composable(Screen.AdminDashboard.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return AdminDashboardViewModel(
                                            container.dashboardRepository,
                                            container.authRepository
                                        ) as T
                                    }
                                }
                            )[AdminDashboardViewModel::class.java]

                            AdminDashboardScreen(
                                viewModel = viewModel,
                                onNavigateToWorkers = {
                                    navController.navigate(Screen.AdminWorkerManagement.route)
                                },
                                onNavigateToSites = {
                                    navController.navigate(Screen.AdminSiteManagement.route)
                                },
                                onNavigateToBatches = {
                                    navController.navigate(Screen.AdminBatchManagement.route)
                                },
                                onNavigateToRegistrations = {
                                    navController.navigate(Screen.PendingRegistrations.route)
                                },
                                onNavigateToSettings = {},
                                onNavigateToQrKiosk = {
                                    navController.navigate(Screen.AdminQrKiosk.route)
                                },
                                onNavigateToAiOperations = {
                                    navController.navigate(Screen.AdminAiOperationsAssistant.route)
                                },
                                onLogout = {
                                    navController.navigate(Screen.Welcome.route) {
                                        popUpTo(0) { inclusive = true }
                                    }
                                }
                            )
                        }

                        // 7. Admin Worker Management
                        composable(Screen.AdminWorkerManagement.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return AdminWorkerViewModel(container.workerRepository, container.authRepository) as T
                                    }
                                }
                            )[AdminWorkerViewModel::class.java]

                            AdminWorkerManagementScreen(
                                viewModel = viewModel,
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }

                        // 8. Admin Pending Registrations
                        composable(Screen.PendingRegistrations.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return RegistrationViewModel(container.registrationRepository) as T
                                    }
                                }
                            )[RegistrationViewModel::class.java]

                            PendingRegistrationsScreen(
                                viewModel = viewModel,
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }

                        // 9. Admin Site Management
                        composable(Screen.AdminSiteManagement.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return AdminSiteViewModel(
                                            container.siteRepository,
                                            container.storageRepository
                                        ) as T
                                    }
                                }
                            )[AdminSiteViewModel::class.java]

                            AdminSiteManagementScreen(
                                viewModel = viewModel,
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }

                        // 9B. Admin Batch Management
                        composable(Screen.AdminBatchManagement.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return AdminBatchViewModel(
                                            container.batchRepository
                                        ) as T
                                    }
                                }
                            )[AdminBatchViewModel::class.java]

                            AdminBatchManagementScreen(
                                viewModel = viewModel,
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }

                        // 10. Worker Dashboard
                        composable(Screen.WorkerDashboard.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return WorkerDashboardViewModel(
                                            container.workerRepository,
                                            container.authRepository,
                                            container.attendanceRepository
                                        ) as T
                                    }
                                }
                            )[WorkerDashboardViewModel::class.java]

                            WorkerDashboardScreen(
                                viewModel = viewModel,
                                onNavigateToProfile = {
                                    navController.navigate(Screen.WorkerProfile.route)
                                },
                                onNavigateToQrScanner = {
                                    navController.navigate(Screen.WorkerQrScanner.route)
                                },
                                onLogout = {
                                    navController.navigate(Screen.Welcome.route) {
                                        popUpTo(0) { inclusive = true }
                                    }
                                }
                            )
                        }

                        // 11. Worker Profile
                        composable(Screen.WorkerProfile.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return WorkerProfileViewModel(
                                            container.workerRepository,
                                            container.authRepository,
                                            container.storageRepository
                                        ) as T
                                    }
                                }
                            )[WorkerProfileViewModel::class.java]

                            WorkerProfileScreen(
                                viewModel = viewModel,
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }

                        // 12. Worker QR Scanner (CameraX + ML Kit)
                        composable(Screen.WorkerQrScanner.route) {
                            WorkerQrScannerScreen(
                                attendanceRepository = container.attendanceRepository,
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }

                        // 13. Admin Live QR Kiosk
                        composable(Screen.AdminQrKiosk.route) {
                            val sitesViewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return AdminSiteViewModel(
                                            container.siteRepository,
                                            container.storageRepository
                                        ) as T
                                    }
                                }
                            )[AdminSiteViewModel::class.java]
                            val sitesUiState by sitesViewModel.uiState.collectAsState()

                            AdminQrGeneratorScreen(
                                sites = sitesUiState.sites,
                                attendanceRepository = container.attendanceRepository,
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }

                        // 14. Phase 8 AI Operations Assistant (Managerial Intelligence)
                        composable(Screen.AdminAiOperationsAssistant.route) {
                            val viewModel = ViewModelProvider(
                                this@MainActivity,
                                object : ViewModelProvider.Factory {
                                    override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                        return AiOperationsViewModel(container.aiOperationsRepository) as T
                                    }
                                }
                            )[AiOperationsViewModel::class.java]

                            AiOperationsAssistantScreen(
                                viewModel = viewModel,
                                onNavigateBack = { navController.popBackStack() },
                                onNavigateToRoute = { route -> navController.navigate(route) }
                            )
                        }
                    }
                }
            }
        }
    }
}
