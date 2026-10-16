package com.civilworkforce.attendance.ui.screens.worker

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.civilworkforce.attendance.data.AttendanceRepository
import com.civilworkforce.attendance.data.AuthRepository
import com.civilworkforce.attendance.data.WorkerRepository
import com.civilworkforce.attendance.model.AttendanceRecord
import com.civilworkforce.attendance.model.AttendanceStatus
import com.civilworkforce.attendance.model.JobRole
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.Worker
import com.civilworkforce.attendance.model.WorkerStatus
import com.civilworkforce.attendance.ui.components.CivilTopAppBar
import com.civilworkforce.attendance.ui.components.ErrorDialog
import com.civilworkforce.attendance.ui.components.LoadingOverlay
import com.civilworkforce.attendance.ui.components.StatusBadge
import com.civilworkforce.attendance.ui.theme.*
import com.civilworkforce.attendance.util.CurrencyUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class WorkerDashboardUiState(
    val worker: Worker? = null,
    val todayAttendance: AttendanceRecord? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val comingSoonModule: String? = null,
    val showSalaryDetails: Boolean = false
)

class WorkerDashboardViewModel(
    private val workerRepository: WorkerRepository,
    private val authRepository: AuthRepository,
    private val attendanceRepository: AttendanceRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(WorkerDashboardUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadWorkerProfile()
    }

    fun loadWorkerProfile() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val userRes = authRepository.getCurrentUser()) {
                is Resource.Success -> {
                    val user = userRes.data
                    if (user != null) {
                        when (val workerRes = workerRepository.getWorkerByUid(user.uid)) {
                            is Resource.Success -> {
                                val worker = workerRes.data
                                var att: AttendanceRecord? = null
                                if (worker != null) {
                                    val attRes = attendanceRepository.getTodayAttendance(worker.workerId)
                                    if (attRes is Resource.Success) {
                                        att = attRes.data
                                    }
                                }
                                _uiState.value = _uiState.value.copy(
                                    worker = worker,
                                    todayAttendance = att,
                                    isLoading = false
                                )
                            }
                            is Resource.Error -> {
                                _uiState.value = _uiState.value.copy(
                                    isLoading = false,
                                    errorMessage = workerRes.message
                                )
                            }
                            Resource.Loading -> Unit
                        }
                    } else {
                        _uiState.value = _uiState.value.copy(isLoading = false)
                    }
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = userRes.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun showComingSoon(moduleName: String) {
        if (moduleName == "Salary") {
            _uiState.value = _uiState.value.copy(showSalaryDetails = true)
        } else {
            _uiState.value = _uiState.value.copy(comingSoonModule = moduleName)
        }
    }

    fun dismissComingSoon() {
        _uiState.value = _uiState.value.copy(comingSoonModule = null, showSalaryDetails = false)
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

data class FutureModuleItem(
    val title: String,
    val icon: ImageVector,
    val description: String
)

@Composable
fun WorkerDashboardScreen(
    viewModel: WorkerDashboardViewModel,
    onNavigateToProfile: () -> Unit,
    onNavigateToQrScanner: () -> Unit,
    onLogout: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val scrollState = rememberScrollState()

    val futureModules = listOf(
        FutureModuleItem("Salary", Icons.Default.Payments, "Wage Slips & Pay Rate Details"),
        FutureModuleItem("Leave", Icons.Default.EventBusy, "Request Site Leave & Casual Off"),
        FutureModuleItem("Overtime", Icons.Default.MoreTime, "Overtime Shift Request & Log"),
        FutureModuleItem("Documents", Icons.Default.Description, "Certifications & Safety Passes")
    )

    Scaffold(
        topBar = {
            CivilTopAppBar(
                title = "Worker Dashboard",
                actions = {
                    IconButton(onClick = viewModel::loadWorkerProfile) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
                    }
                    IconButton(onClick = onNavigateToProfile) {
                        Icon(Icons.Default.AccountCircle, contentDescription = "Profile", tint = Color.White)
                    }
                    IconButton(onClick = { viewModel.logout(onLogout) }) {
                        Icon(Icons.Default.Logout, contentDescription = "Logout", tint = Color.White)
                    }
                }
            )
        },
        containerColor = ConcreteBackground
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Identity Summary Card with INR Wage Display
                val worker = uiState.worker
                val wageAmount = if ((worker?.dailyWage ?: 0.0) > 0.0) worker!!.dailyWage else JobRole.fromNameOrDisplay(worker?.jobRole ?: "").defaultDailyWage

                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ConstructionSlate),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth().clickable(onClick = onNavigateToProfile)
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = worker?.fullName ?: "Active Worker",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            StatusBadge(worker?.status?.name ?: "ACTIVE")
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Worker ID", fontSize = 11.sp, color = Color.LightGray)
                                Text(worker?.workerId ?: "W-1042", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = SafetyAmberLight)
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Job Role", fontSize = 11.sp, color = Color.LightGray)
                                Text(worker?.jobRole ?: "Civil Worker", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Daily Wage", fontSize = 11.sp, color = Color.LightGray)
                                Text(CurrencyUtils.formatInr(wageAmount), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = StatusActiveGreen)
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))
                        HorizontalDivider(color = ConstructionSteel)
                        Spacer(modifier = Modifier.height(8.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.LocationOn, contentDescription = null, tint = SafetyAmber, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Assigned Site: ${worker?.siteId ?: "Main Construction Site"}",
                                fontSize = 13.sp,
                                color = Color.White,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                // Phase 2 Smart Attendance Live Card
                val isWorkerActive = worker?.status == WorkerStatus.ACTIVE
                val attendance = uiState.todayAttendance

                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.QrCodeScanner,
                                    contentDescription = null,
                                    tint = if (isWorkerActive) SafetyAmber else ConstructionSteel,
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Smart Attendance",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = ConstructionSlate
                                )
                            }

                            if (!isWorkerActive) {
                                StatusBadge("RESTRICTED")
                            } else if (attendance == null) {
                                StatusBadge("NOT CHECKED IN")
                            } else if (attendance.status == AttendanceStatus.CHECKED_IN) {
                                StatusBadge("CHECKED IN")
                            } else {
                                StatusBadge("COMPLETED")
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        if (!isWorkerActive) {
                            Text(
                                text = "Attendance scanning is restricted to approved ACTIVE civil workers. Current account status is ${worker?.status ?: "PENDING"}.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error
                            )
                        } else if (attendance == null) {
                            Text(
                                text = "You have not checked in for today's shift yet. Daily rate for today: ${CurrencyUtils.formatDailyWage(wageAmount)}.",
                                style = MaterialTheme.typography.bodySmall,
                                color = ConstructionSlate
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = onNavigateToQrScanner,
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = SafetyAmber, contentColor = ConstructionSlate)
                            ) {
                                Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Scan Site QR to Check In", fontWeight = FontWeight.Bold)
                            }
                        } else if (attendance.status == AttendanceStatus.CHECKED_IN) {
                            Text(
                                text = "Currently Checked In on site ${attendance.siteId}. Shift earnings active: ${CurrencyUtils.formatInr(wageAmount)}.",
                                style = MaterialTheme.typography.bodySmall,
                                color = ConstructionSlate
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = onNavigateToQrScanner,
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = ConstructionSlate, contentColor = Color.White)
                            ) {
                                Icon(Icons.Default.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Scan Site QR to Check Out", fontWeight = FontWeight.Bold)
                            }
                        } else {
                            Text(
                                text = "Shift completed for today (${attendance.date}). Earned ${CurrencyUtils.formatInr(wageAmount)} securely logged.",
                                style = MaterialTheme.typography.bodySmall,
                                color = StatusActiveGreen
                            )
                        }
                    }
                }

                Text(
                    text = "Workforce Modules",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = ConstructionSlate
                )

                // Scroll-safe 2x2 grid using structured Rows (eliminating nested scroll view conflicts)
                val chunkedModules = futureModules.chunked(2)
                chunkedModules.forEach { pair ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        pair.forEach { mod ->
                            Card(
                                shape = RoundedCornerShape(10.dp),
                                colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
                                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(115.dp)
                                    .clickable { viewModel.showComingSoon(mod.title) }
                            ) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(12.dp),
                                    verticalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            imageVector = mod.icon,
                                            contentDescription = null,
                                            tint = if (mod.title == "Salary") SafetyAmberDark else ConstructionSteel,
                                            modifier = Modifier.size(24.dp)
                                        )
                                        Surface(
                                            shape = RoundedCornerShape(4.dp),
                                            color = if (mod.title == "Salary") SafetyAmberLight else Color(0xFFF1F5F9)
                                        ) {
                                            Text(
                                                text = if (mod.title == "Salary") "Active" else "Phase 2+",
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (mod.title == "Salary") ConstructionSlate else ConstructionSteel,
                                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                                            )
                                        }
                                    }

                                    Column {
                                        Text(
                                            text = mod.title,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp,
                                            color = ConstructionSlate
                                        )
                                        Text(
                                            text = if (mod.title == "Salary") "Rate: ${CurrencyUtils.formatInr(wageAmount)}/d" else "Coming soon",
                                            fontSize = 11.sp,
                                            color = if (mod.title == "Salary") SafetyAmberDark else ConstructionSteel,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                        if (pair.size == 1) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))
            }

            LoadingOverlay(isLoading = uiState.isLoading)

            ErrorDialog(
                errorMessage = uiState.errorMessage,
                onDismiss = viewModel::dismissError
            )

            // Salary & Wage Slip Details Dialog in INR
            if (uiState.showSalaryDetails) {
                val worker = uiState.worker
                val wageAmount = if ((worker?.dailyWage ?: 0.0) > 0.0) worker!!.dailyWage else JobRole.fromNameOrDisplay(worker?.jobRole ?: "").defaultDailyWage

                AlertDialog(
                    onDismissRequest = viewModel::dismissComingSoon,
                    title = {
                        Text("Wage & Payroll Details", fontWeight = FontWeight.Bold, color = ConstructionSlate)
                    },
                    text = {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .verticalScroll(rememberScrollState()),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = "Official INR compensation structure verified by ANGEL ENTERPRISES HR.",
                                fontSize = 12.sp,
                                color = ConstructionSteel
                            )
                            HorizontalDivider(color = ConcreteBorder)

                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Trade / Role:", color = ConstructionSteel, fontSize = 13.sp)
                                Text(worker?.jobRole ?: "Civil Worker", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            }
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Daily Wage Rate:", color = ConstructionSteel, fontSize = 13.sp)
                                Text(CurrencyUtils.formatDailyWage(wageAmount), fontWeight = FontWeight.Bold, color = SafetyAmberDark, fontSize = 13.sp)
                            }
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Standard Shifts/Mo:", color = ConstructionSteel, fontSize = 13.sp)
                                Text("${CurrencyUtils.STANDARD_MONTHLY_WORK_DAYS} working days", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                            }
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Monthly Est. Pay:", color = ConstructionSteel, fontSize = 13.sp)
                                Text(CurrencyUtils.formatMonthlyEstimate(wageAmount), fontWeight = FontWeight.Bold, color = StatusActiveGreen, fontSize = 13.sp)
                            }
                            HorizontalDivider(color = ConcreteBorder)
                            Text(
                                text = "Attendance-verified shift wages are disbursed monthly via direct transfer or site cashier.",
                                fontSize = 11.sp,
                                color = ConstructionSteel
                            )
                        }
                    },
                    confirmButton = {
                        Button(
                            onClick = viewModel::dismissComingSoon,
                            colors = ButtonDefaults.buttonColors(containerColor = ConstructionSlate)
                        ) {
                            Text("Close", color = Color.White)
                        }
                    },
                    shape = RoundedCornerShape(12.dp),
                    containerColor = Color.White
                )
            }

            // General Coming Soon dialog
            uiState.comingSoonModule?.let { modName ->
                AlertDialog(
                    onDismissRequest = viewModel::dismissComingSoon,
                    title = { Text("$modName Module", fontWeight = FontWeight.Bold) },
                    text = {
                        Text(
                            text = "$modName functionality is scheduled for rollout with biometric hardware QR code scanning, GPS geofence validation, and automated payroll synchronization.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = ConstructionSteel
                        )
                    },
                    confirmButton = {
                        Button(
                            onClick = viewModel::dismissComingSoon,
                            colors = ButtonDefaults.buttonColors(containerColor = ConstructionSlate)
                        ) {
                            Text("OK", color = Color.White)
                        }
                    },
                    shape = RoundedCornerShape(12.dp),
                    containerColor = Color.White
                )
            }
        }
    }
}
