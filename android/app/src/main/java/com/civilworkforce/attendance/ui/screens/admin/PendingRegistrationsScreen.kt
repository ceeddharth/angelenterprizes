package com.civilworkforce.attendance.ui.screens.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.civilworkforce.attendance.data.RegistrationRepository
import com.civilworkforce.attendance.model.JobRole
import com.civilworkforce.attendance.model.RegistrationStatus
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.WorkerRegistration
import com.civilworkforce.attendance.ui.components.CivilTopAppBar
import com.civilworkforce.attendance.ui.components.EmptyStateView
import com.civilworkforce.attendance.ui.components.ErrorDialog
import com.civilworkforce.attendance.ui.components.LoadingOverlay
import com.civilworkforce.attendance.ui.components.StatusBadge
import com.civilworkforce.attendance.ui.theme.*
import com.civilworkforce.attendance.util.CurrencyUtils
import com.civilworkforce.attendance.util.ValidationUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PendingRegistrationsUiState(
    val registrations: List<WorkerRegistration> = emptyList(),
    val selectedRegistration: WorkerRegistration? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class RegistrationViewModel(
    private val registrationRepository: RegistrationRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PendingRegistrationsUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadPendingRegistrations()
    }

    fun loadPendingRegistrations() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val res = registrationRepository.getPendingRegistrations()) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(registrations = res.data, isLoading = false)
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = res.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun selectRegistration(reg: WorkerRegistration?) {
        _uiState.value = _uiState.value.copy(selectedRegistration = reg)
    }

    fun approve(regId: String) {
        val adminUid = FirebaseAuth.getInstance().currentUser?.uid
        if (adminUid.isNullOrBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Administrator session expired. Please sign in again.")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            when (val res = registrationRepository.approveRegistration(regId, adminUid)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(selectedRegistration = null)
                    loadPendingRegistrations()
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = res.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun reject(regId: String) {
        val adminUid = FirebaseAuth.getInstance().currentUser?.uid
        if (adminUid.isNullOrBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Administrator session expired. Please sign in again.")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            when (val res = registrationRepository.rejectRegistration(regId, adminUid)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(selectedRegistration = null)
                    loadPendingRegistrations()
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = res.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun suspendRegistration(regId: String) {
        val adminUid = FirebaseAuth.getInstance().currentUser?.uid
        if (adminUid.isNullOrBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Administrator session expired. Please sign in again.")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            when (val res = registrationRepository.suspendRegistration(regId, adminUid)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(selectedRegistration = null)
                    loadPendingRegistrations()
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = res.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun dismissError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}

@Composable
fun PendingRegistrationsScreen(
    viewModel: RegistrationViewModel,
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            CivilTopAppBar(
                title = "Pending Registrations",
                canNavigateBack = true,
                onNavigateBack = onNavigateBack,
                actions = {
                    IconButton(onClick = viewModel::loadPendingRegistrations) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
                    }
                }
            )
        },
        containerColor = ConcreteBackground
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            if (uiState.registrations.isEmpty() && !uiState.isLoading) {
                EmptyStateView(
                    message = "No pending worker registrations to review",
                    icon = Icons.Default.CheckCircleOutline
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(uiState.registrations) { reg ->
                        RegistrationCardItem(
                            registration = reg,
                            onClick = { viewModel.selectRegistration(reg) }
                        )
                    }
                }
            }

            LoadingOverlay(isLoading = uiState.isLoading)

            ErrorDialog(
                errorMessage = uiState.errorMessage,
                onDismiss = viewModel::dismissError
            )

            // Review Modal with Overflow-proof scroll and layout
            uiState.selectedRegistration?.let { reg ->
                val data = reg.submittedData
                val scrollState = rememberScrollState()
                val wageAmount = if (data.dailyWage > 0) data.dailyWage else JobRole.fromNameOrDisplay(data.jobRole).defaultDailyWage

                AlertDialog(
                    onDismissRequest = { viewModel.selectRegistration(null) },
                    title = {
                        Text(
                            text = "Review Registration: ${data.fullName}",
                            fontWeight = FontWeight.Bold,
                            color = ConstructionSlate,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    },
                    text = {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .verticalScroll(scrollState),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Proposed ID: ${reg.workerId}", fontWeight = FontWeight.SemiBold)
                                StatusBadge(reg.status.name)
                            }
                            HorizontalDivider(color = ConcreteBorder)

                            RegDetailRow("Trade / Role", data.jobRole)
                            RegDetailRow("Proposed Daily Wage", CurrencyUtils.formatDailyWage(wageAmount))
                            RegDetailRow("Estimated Monthly", CurrencyUtils.formatMonthlyEstimate(wageAmount))
                            RegDetailRow("Batch Number", data.batchNumber.ifBlank { "—" })
                            RegDetailRow("Target Site", data.siteId.ifBlank { "Main Site" })
                            RegDetailRow("Mobile Phone", ValidationUtils.formatPhoneDisplay(data.phone))
                            RegDetailRow("Email", data.email.ifBlank { "—" })
                            RegDetailRow("Permanent Address", data.address.ifBlank { "—" })
                            RegDetailRow("Emergency Contact", "${data.emergencyContactName} (${ValidationUtils.formatPhoneDisplay(data.emergencyContactPhone)})")

                            Spacer(modifier = Modifier.height(10.dp))

                            // Approval Action Buttons placed safely inside dialog body to eliminate bottom bar overflow
                            Button(
                                onClick = { viewModel.approve(reg.registrationId) },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = StatusActiveGreen)
                            ) {
                                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Approve & Activate Worker", color = Color.White, fontWeight = FontWeight.Bold)
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                OutlinedButton(
                                    onClick = { viewModel.reject(reg.registrationId) },
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = StatusRejectedRed)
                                ) {
                                    Text("Reject")
                                }
                                OutlinedButton(
                                    onClick = { viewModel.suspendRegistration(reg.registrationId) },
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = SafetyAmberDark)
                                ) {
                                    Text("Suspend")
                                }
                            }
                        }
                    },
                    confirmButton = {},
                    dismissButton = {
                        TextButton(
                            onClick = { viewModel.selectRegistration(null) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Close", color = ConstructionSteel)
                        }
                    },
                    shape = RoundedCornerShape(12.dp),
                    containerColor = Color.White
                )
            }
        }
    }
}

@Composable
fun RegistrationCardItem(registration: WorkerRegistration, onClick: () -> Unit) {
    val data = registration.submittedData
    val wageAmount = if (data.dailyWage > 0) data.dailyWage else JobRole.fromNameOrDisplay(data.jobRole).defaultDailyWage

    Card(
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = data.fullName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = ConstructionSlate,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "ID: ${registration.workerId} • ${data.jobRole} • Batch ${data.batchNumber}",
                    style = MaterialTheme.typography.bodySmall,
                    color = ConstructionSteel,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "Wage: ${CurrencyUtils.formatDailyWage(wageAmount)}",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SafetyAmberDark
                )
            }
            Box(modifier = Modifier.padding(start = 8.dp)) {
                StatusBadge(registration.status.name)
            }
        }
    }
}

@Composable
private fun RegDetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            color = ConstructionSteel,
            modifier = Modifier.weight(0.42f)
        )
        Text(
            text = value,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = ConstructionSlate,
            modifier = Modifier.weight(0.58f)
        )
    }
}
