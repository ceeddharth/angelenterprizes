package com.civilworkforce.attendance.ui.screens.splash

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Engineering
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.civilworkforce.attendance.data.AuthRepository
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.UserRole
import com.civilworkforce.attendance.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

sealed class SplashNavigationEvent {
    object NavigateToWelcome : SplashNavigationEvent()
    object NavigateToAdminDashboard : SplashNavigationEvent()
    object NavigateToWorkerDashboard : SplashNavigationEvent()
}

class SplashViewModel(private val authRepository: AuthRepository) : ViewModel() {

    private val _navigationEvent = MutableSharedFlow<SplashNavigationEvent>()
    val navigationEvent = _navigationEvent.asSharedFlow()

    fun checkAuthState() {
        viewModelScope.launch {
            delay(1200) // Visual brand stabilization
            if (!authRepository.isUserLoggedIn()) {
                _navigationEvent.emit(SplashNavigationEvent.NavigateToWelcome)
                return@launch
            }

            when (val userResult = authRepository.getCurrentUser()) {
                is Resource.Success -> {
                    val user = userResult.data
                    if (user == null) {
                        authRepository.logout()
                        _navigationEvent.emit(SplashNavigationEvent.NavigateToWelcome)
                    } else if (user.role == UserRole.ADMIN) {
                        _navigationEvent.emit(SplashNavigationEvent.NavigateToAdminDashboard)
                    } else {
                        _navigationEvent.emit(SplashNavigationEvent.NavigateToWorkerDashboard)
                    }
                }
                is Resource.Error -> {
                    authRepository.logout()
                    _navigationEvent.emit(SplashNavigationEvent.NavigateToWelcome)
                }
                Resource.Loading -> Unit
            }
        }
    }
}

@Composable
fun SplashScreen(
    viewModel: SplashViewModel,
    onNavigateToWelcome: () -> Unit,
    onNavigateToAdminDashboard: () -> Unit,
    onNavigateToWorkerDashboard: () -> Unit
) {
    LaunchedEffect(Unit) {
        viewModel.navigationEvent.collect { event ->
            when (event) {
                SplashNavigationEvent.NavigateToWelcome -> onNavigateToWelcome()
                SplashNavigationEvent.NavigateToAdminDashboard -> onNavigateToAdminDashboard()
                SplashNavigationEvent.NavigateToWorkerDashboard -> onNavigateToWorkerDashboard()
            }
        }
    }

    LaunchedEffect(Unit) {
        viewModel.checkAuthState()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ConstructionSlate),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(24.dp)
        ) {
            Surface(
                modifier = Modifier.size(96.dp),
                shape = CircleShape,
                color = SafetyAmber
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.Engineering,
                        contentDescription = "Civil Workforce Logo",
                        tint = Color.White,
                        modifier = Modifier.size(56.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(28.dp))

            Text(
                text = "ANGEL ENTERPRISES",
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center,
                letterSpacing = 0.5.sp
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = "Civil Workforce Attendance System",
                fontSize = 18.sp,
                fontWeight = FontWeight.Medium,
                color = SafetyAmber,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(48.dp))

            CircularProgressIndicator(
                color = SafetyAmber,
                strokeWidth = 3.dp,
                modifier = Modifier.size(32.dp)
            )
        }
    }
}
