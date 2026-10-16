package com.civilworkforce.attendance.ui.screens.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.civilworkforce.attendance.data.AuthRepository
import com.civilworkforce.attendance.data.DashboardRepository
import com.civilworkforce.attendance.model.DashboardStats
import com.civilworkforce.attendance.model.RecentActivity
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.ui.components.CivilTopAppBar
import com.civilworkforce.attendance.ui.components.EmptyStateView
import com.civilworkforce.attendance.ui.components.ErrorDialog
import com.civilworkforce.attendance.ui.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AdminDashboardUiState(
    val stats: DashboardStats = DashboardStats(),
    val recentActivities: List<RecentActivity> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class AdminDashboardViewModel(
    private val dashboardRepository: DashboardRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AdminDashboardUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadDashboard()
    }

    fun loadDashboard() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            val statsRes = dashboardRepository.getDashboardStats()
            val activitiesRes = dashboardRepository.getRecentActivities()

            if (statsRes is Resource.Success && activitiesRes is Resource.Success) {
                _uiState.value = AdminDashboardUiState(
                    stats = statsRes.data,
                    recentActivities = activitiesRes.data,
                    isLoading = false
                )
            } else {
                val err = (statsRes as? Resource.Error)?.message ?: (activitiesRes as? Resource.Error)?.message
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = err ?: "Failed to refresh dashboard stats"
                )
            }
        }
    }

    fun logout(onLoggedOut: () -> Unit) {
        viewModelScope.launch {
            authRepository.logout()
            onLoggedOut()
        }
    }

    fun dismissError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}

@Composable
fun AdminDashboardScreen(
    viewModel: AdminDashboardViewModel,
    onNavigateToWorkers: () -> Unit,
    onNavigateToSites: () -> Unit,
    onNavigateToBatches: () -> Unit = {},
    onNavigateToRegistrations: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToQrKiosk: () -> Unit,
    onNavigateToAiOperations: () -> Unit = {},
    onLogout: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            CivilTopAppBar(
                title = "Supervisor Console",
                actions = {
                    IconButton(onClick = viewModel::loadDashboard) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
                    }
                    IconButton(onClick = { viewModel.logout(onLogout) }) {
                        Icon(Icons.Default.Logout, contentDescription = "Logout", tint = Color.White)
                    }
                }
            )
        },
        containerColor = ConcreteBackground
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Stats Grid Section
            item {
                Text(
                    text = "Workforce Overview",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = ConstructionSlate
                )
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    StatCard(
                        title = "Total Workers",
                        value = uiState.stats.totalWorkers.toString(),
                        icon = Icons.Default.Groups,
                        modifier = Modifier.weight(1f),
                        onClick = onNavigateToWorkers
                    )
                    StatCard(
                        title = "Active Workers",
                        value = uiState.stats.activeWorkers.toString(),
                        icon = Icons.Default.CheckCircle,
                        accentColor = StatusActiveGreen,
                        modifier = Modifier.weight(1f),
                        onClick = onNavigateToWorkers
                    )
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    StatCard(
                        title = "Pending Reg.",
                        value = uiState.stats.pendingRegistrations.toString(),
                        icon = Icons.Default.PendingActions,
                        accentColor = SafetyAmber,
                        modifier = Modifier.weight(1f),
                        onClick = onNavigateToRegistrations
                    )
                    StatCard(
                        title = "Total Sites",
                        value = uiState.stats.totalSites.toString(),
                        icon = Icons.Default.LocationCity,
                        modifier = Modifier.weight(1f),
                        onClick = onNavigateToSites
                    )
                }
            }

            // Phase 8 AI Operations Assistant Banner Card
            item {
                Card(
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = ConstructionDark),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onNavigateToAiOperations() }
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = SafetyAmber.copy(alpha = 0.2f),
                                border = androidx.compose.foundation.BorderStroke(1.dp, SafetyAmber)
                            ) {
                                Icon(
                                    Icons.Default.AutoAwesome,
                                    contentDescription = "AI Operations",
                                    tint = SafetyAmber,
                                    modifier = Modifier.padding(8.dp).size(20.dp)
                                )
                            }
                            Column {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Text(
                                        text = "AI OPERATIONS ASSISTANT",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Color.White
                                    )
                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = SafetyAmber
                                    ) {
                                        Text(
                                            text = "PHASE 8",
                                            fontSize = 8.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = ConstructionDark,
                                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = "Read-only managerial intelligence grounded in Firestore",
                                    fontSize = 10.sp,
                                    color = Color.LightGray
                                )
                            }
                        }
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = "Open AI Assistant",
                            tint = SafetyAmber
                        )
                    }
                }
            }

            // Quick Actions Section
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Operations Management",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = ConstructionSlate
                )
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    QuickActionButton(
                        label = "Workers",
                        icon = Icons.Default.People,
                        modifier = Modifier.weight(1f),
                        onClick = onNavigateToWorkers
                    )
                    QuickActionButton(
                        label = "Sites",
                        icon = Icons.Default.Business,
                        modifier = Modifier.weight(1f),
                        onClick = onNavigateToSites
                    )
                    QuickActionButton(
                        label = "Batches",
                        icon = Icons.Default.Groups,
                        modifier = Modifier.weight(1f),
                        onClick = onNavigateToBatches
                    )
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    QuickActionButton(
                        label = "Approvals",
                        icon = Icons.Default.HowToReg,
                        modifier = Modifier.weight(1f),
                        onClick = onNavigateToRegistrations
                    )
                    QuickActionButton(
                        label = "QR Kiosk",
                        icon = Icons.Default.QrCode2,
                        modifier = Modifier.weight(1f),
                        onClick = onNavigateToQrKiosk
                    )
                }
            }

            // Real Recent Activity Section
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Recent Activity Audit",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = ConstructionSlate
                )
            }

            if (uiState.recentActivities.isEmpty()) {
                item {
                    EmptyStateView(
                        message = "No data available yet",
                        icon = Icons.Default.History
                    )
                }
            } else {
                items(uiState.recentActivities) { act ->
                    Card(
                        shape = RoundedCornerShape(8.dp),
                        colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = if (act.type == "REGISTRATION") SafetyAmberLight else Color(0xFFE0F2FE),
                                modifier = Modifier.size(40.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = if (act.type == "REGISTRATION") Icons.Default.PersonAdd else Icons.Default.Domain,
                                        contentDescription = null,
                                        tint = ConstructionSlate,
                                        modifier = Modifier.size(22.dp)
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = act.title,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = ConstructionSlate
                                )
                                Text(
                                    text = act.description,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = ConstructionSteel
                                )
                            }
                        }
                    }
                }
            }
        }

        ErrorDialog(
            errorMessage = uiState.errorMessage,
            onDismiss = viewModel::dismissError
        )
    }
}

@Composable
fun StatCard(
    title: String,
    value: String,
    icon: ImageVector,
    accentColor: Color = ConstructionSlate,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.5.dp),
        modifier = modifier.clickable(onClick = onClick)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodySmall,
                    color = ConstructionSteel
                )
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(20.dp)
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = value,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = ConstructionSlate
            )
        }
    }
}

@Composable
fun QuickActionButton(
    label: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(containerColor = ConstructionSlate),
        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 6.dp),
        modifier = modifier.height(64.dp)
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = label,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
