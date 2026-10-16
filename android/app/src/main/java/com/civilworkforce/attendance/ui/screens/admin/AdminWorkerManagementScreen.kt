package com.civilworkforce.attendance.ui.screens.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.civilworkforce.attendance.data.AuthRepository
import com.civilworkforce.attendance.data.WorkerRepository
import com.civilworkforce.attendance.data.WorkerUpdatePayload
import com.civilworkforce.attendance.model.JobRole
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.UserStatus
import com.civilworkforce.attendance.model.Worker
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

data class WorkerManagementUiState(
    val workers: List<Worker> = emptyList(),
    val searchQuery: String = "",
    val selectedStatusFilter: UserStatus? = null,
    val selectedWorker: Worker? = null,
    val editingWorker: Worker? = null,
    val isAddingWorker: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null
)

class AdminWorkerViewModel(
    private val workerRepository: WorkerRepository,
    private val authRepository: AuthRepository? = null
) : ViewModel() {

    private val _uiState = MutableStateFlow(WorkerManagementUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadWorkers()
    }

    fun loadWorkers() {
        val s = _uiState.value
        viewModelScope.launch {
            _uiState.value = s.copy(isLoading = true, errorMessage = null)
            when (val res = workerRepository.getWorkers(s.searchQuery, s.selectedStatusFilter)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(workers = res.data, isLoading = false)
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = res.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun onSearchChange(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        loadWorkers()
    }

    fun onStatusFilterSelect(status: UserStatus?) {
        _uiState.value = _uiState.value.copy(selectedStatusFilter = status)
        loadWorkers()
    }

    fun selectWorker(worker: Worker?) {
        _uiState.value = _uiState.value.copy(selectedWorker = worker)
    }

    fun startEditWorker(worker: Worker) {
        _uiState.value = _uiState.value.copy(selectedWorker = null, editingWorker = worker)
    }

    fun cancelEditWorker() {
        _uiState.value = _uiState.value.copy(editingWorker = null)
    }

    fun startAddWorker() {
        _uiState.value = _uiState.value.copy(isAddingWorker = true)
    }

    fun cancelAddWorker() {
        _uiState.value = _uiState.value.copy(isAddingWorker = false)
    }

    fun toggleWorkerStatus(worker: Worker) {
        val newStatus = if (worker.status == UserStatus.ACTIVE) UserStatus.SUSPENDED else UserStatus.ACTIVE
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            when (val res = workerRepository.updateWorkerStatus(worker.workerId, newStatus)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(
                        selectedWorker = null,
                        successMessage = "Worker ${worker.workerId} status updated to ${newStatus.name}"
                    )
                    loadWorkers()
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = res.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun saveWorkerDetails(workerId: String, payload: WorkerUpdatePayload) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val res = workerRepository.updateWorkerDetails(workerId, payload)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(
                        editingWorker = null,
                        successMessage = "Worker $workerId updated successfully."
                    )
                    loadWorkers()
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = res.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun createWorkerDirectly(worker: Worker, pin: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val res = workerRepository.registerWorkerDirectly(worker, pin)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(
                        isAddingWorker = false,
                        successMessage = "Worker ${res.data.workerId} (${res.data.fullName}) provisioned successfully."
                    )
                    loadWorkers()
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

    fun dismissSuccess() {
        _uiState.value = _uiState.value.copy(successMessage = null)
    }
}

@Composable
fun AdminWorkerManagementScreen(
    viewModel: AdminWorkerViewModel,
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            CivilTopAppBar(
                title = "Workforce Directory",
                canNavigateBack = true,
                onNavigateBack = onNavigateBack,
                actions = {
                    IconButton(onClick = viewModel::loadWorkers) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
                    }
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = viewModel::startAddWorker,
                containerColor = SafetyAmber,
                contentColor = ConstructionSlate,
                icon = { Icon(Icons.Default.PersonAdd, contentDescription = null) },
                text = { Text("Add Worker", fontWeight = FontWeight.Bold) }
            )
        },
        containerColor = ConcreteBackground
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Search Field
                OutlinedTextField(
                    value = uiState.searchQuery,
                    onValueChange = viewModel::onSearchChange,
                    placeholder = { Text("Search by name, ID, role, or phone...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = ConstructionSteel) },
                    trailingIcon = {
                        if (uiState.searchQuery.isNotEmpty()) {
                            IconButton(onClick = { viewModel.onSearchChange("") }) {
                                Icon(Icons.Default.Close, contentDescription = "Clear", tint = ConstructionSteel)
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                // Status Filter Chips
                LazyRow(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    item {
                        FilterChip(
                            selected = uiState.selectedStatusFilter == null,
                            onClick = { viewModel.onStatusFilterSelect(null) },
                            label = { Text("ALL") }
                        )
                    }
                    items(UserStatus.values()) { st ->
                        FilterChip(
                            selected = uiState.selectedStatusFilter == st,
                            onClick = { viewModel.onStatusFilterSelect(st) },
                            label = { Text(st.name) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Worker List
                if (uiState.workers.isEmpty() && !uiState.isLoading) {
                    EmptyStateView(
                        message = "No workers found matching criteria",
                        icon = Icons.Default.PersonOff
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp),
                        contentPadding = PaddingValues(bottom = 80.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(uiState.workers) { worker ->
                            WorkerCardItem(
                                worker = worker,
                                onClick = { viewModel.selectWorker(worker) }
                            )
                        }
                    }
                }
            }

            LoadingOverlay(isLoading = uiState.isLoading)

            ErrorDialog(
                errorMessage = uiState.errorMessage,
                onDismiss = viewModel::dismissError
            )

            // Success feedback dialog
            uiState.successMessage?.let { msg ->
                AlertDialog(
                    onDismissRequest = viewModel::dismissSuccess,
                    title = { Text("Workforce Management", fontWeight = FontWeight.Bold, color = StatusActiveGreen) },
                    text = { Text(msg, color = ConstructionSlate) },
                    confirmButton = {
                        Button(
                            onClick = viewModel::dismissSuccess,
                            colors = ButtonDefaults.buttonColors(containerColor = SafetyAmber)
                        ) {
                            Text("OK", color = Color.White)
                        }
                    },
                    shape = RoundedCornerShape(12.dp),
                    containerColor = Color.White
                )
            }

            // 1. Worker Detail Sheet
            uiState.selectedWorker?.let { worker ->
                WorkerDetailDialog(
                    worker = worker,
                    onDismiss = { viewModel.selectWorker(null) },
                    onEditClick = { viewModel.startEditWorker(worker) },
                    onToggleStatus = { viewModel.toggleWorkerStatus(worker) }
                )
            }

            // 2. Edit Worker Modal
            uiState.editingWorker?.let { worker ->
                EditWorkerDialog(
                    worker = worker,
                    onDismiss = viewModel::cancelEditWorker,
                    onSave = { payload -> viewModel.saveWorkerDetails(worker.workerId, payload) }
                )
            }

            // 3. Add Worker Direct Modal
            if (uiState.isAddingWorker) {
                AddWorkerDialog(
                    onDismiss = viewModel::cancelAddWorker,
                    onCreate = viewModel::createWorkerDirectly
                )
            }
        }
    }
}

@Composable
fun WorkerCardItem(worker: Worker, onClick: () -> Unit) {
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
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                val photoUrl = worker.profilePhoto?.downloadUrl
                Surface(
                    shape = CircleShape,
                    color = SafetyAmber,
                    modifier = Modifier.size(44.dp)
                ) {
                    if (!photoUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = photoUrl,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize().clip(CircleShape)
                        )
                    } else {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Engineering, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                        }
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = worker.fullName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = ConstructionSlate,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "${worker.workerId} • ${worker.jobRole} • Batch ${worker.batchNumber}",
                        style = MaterialTheme.typography.bodySmall,
                        color = ConstructionSteel,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    val wageAmount = if (worker.dailyWage > 0) worker.dailyWage else JobRole.fromNameOrDisplay(worker.jobRole).defaultDailyWage
                    Text(
                        text = CurrencyUtils.formatDailyWage(wageAmount),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SafetyAmberDark
                    )
                }
            }

            Box(modifier = Modifier.padding(start = 8.dp)) {
                StatusBadge(worker.status.name)
            }
        }
    }
}

@Composable
fun WorkerDetailDialog(
    worker: Worker,
    onDismiss: () -> Unit,
    onEditClick: () -> Unit,
    onToggleStatus: () -> Unit
) {
    val scrollState = rememberScrollState()
    val wageAmount = if (worker.dailyWage > 0) worker.dailyWage else JobRole.fromNameOrDisplay(worker.jobRole).defaultDailyWage

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = worker.fullName,
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
                    Column {
                        Text("Worker ID: ${worker.workerId}", fontWeight = FontWeight.SemiBold)
                        Text(
                            text = ValidationUtils.formatPhoneDisplay(worker.phone),
                            fontSize = 12.sp,
                            color = ConstructionSteel
                        )
                    }
                    StatusBadge(worker.status.name)
                }

                HorizontalDivider(color = ConcreteBorder)

                DetailRow("Trade / Role", worker.jobRole)
                DetailRow("Daily Wage Rate", CurrencyUtils.formatDailyWage(wageAmount))
                DetailRow("Monthly Est. (26d)", CurrencyUtils.formatMonthlyEstimate(wageAmount))
                DetailRow("Assigned Site", worker.siteId.ifBlank { "Main Site" })
                DetailRow("Batch Number", worker.batchNumber.ifBlank { "—" })
                DetailRow("Email", worker.email.ifBlank { "—" })
                DetailRow("Joining Date", worker.joiningDate.ifBlank { "—" })
                DetailRow("Emergency Contact", "${worker.emergencyContactName} (${ValidationUtils.formatPhoneDisplay(worker.emergencyContactPhone)})")
                if (worker.address.isNotBlank()) {
                    DetailRow("Address", worker.address)
                }
            }
        },
        confirmButton = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onEditClick,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = SafetyAmberDark)
                ) {
                    Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Edit Profile")
                }

                Button(
                    onClick = onToggleStatus,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (worker.status == UserStatus.ACTIVE) StatusSuspendedRed else StatusActiveGreen
                    )
                ) {
                    Text(if (worker.status == UserStatus.ACTIVE) "Suspend" else "Activate", color = Color.White)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                Text("Close", color = ConstructionSteel)
            }
        },
        shape = RoundedCornerShape(12.dp),
        containerColor = Color.White
    )
}

@Composable
fun EditWorkerDialog(
    worker: Worker,
    onDismiss: () -> Unit,
    onSave: (WorkerUpdatePayload) -> Unit
) {
    var name by remember { mutableStateOf(worker.fullName) }
    var phone by remember { mutableStateOf(worker.phone) }
    var phoneError by remember { mutableStateOf<String?>(null) }
    var jobRole by remember { mutableStateOf(worker.jobRole) }
    var batch by remember { mutableStateOf(worker.batchNumber) }
    var siteId by remember { mutableStateOf(worker.siteId) }
    var wageStr by remember { mutableStateOf(if (worker.dailyWage > 0) worker.dailyWage.toInt().toString() else JobRole.fromNameOrDisplay(worker.jobRole).defaultDailyWage.toInt().toString()) }
    var wageError by remember { mutableStateOf<String?>(null) }
    var emergencyName by remember { mutableStateOf(worker.emergencyContactName) }
    var emergencyPhone by remember { mutableStateOf(worker.emergencyContactPhone) }
    var emergencyPhoneError by remember { mutableStateOf<String?>(null) }
    var address by remember { mutableStateOf(worker.address) }

    val scrollState = rememberScrollState()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Edit Worker: ${worker.workerId}",
                fontWeight = FontWeight.Bold,
                color = ConstructionSlate
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(scrollState),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Legal Name *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                // Phone with Indian validation
                OutlinedTextField(
                    value = phone,
                    onValueChange = {
                        phone = it
                        phoneError = null
                    },
                    label = { Text("Mobile Phone (10-digit / +91) *") },
                    leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null, tint = ConstructionSteel) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                    isError = phoneError != null,
                    supportingText = phoneError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } },
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = jobRole,
                    onValueChange = { jobRole = it },
                    label = { Text("Job Role / Trade *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                // Daily Wage with INR symbol
                OutlinedTextField(
                    value = wageStr,
                    onValueChange = {
                        wageStr = it
                        wageError = null
                    },
                    label = { Text("Daily Wage Rate (INR) *") },
                    prefix = { Text("${CurrencyUtils.INR_SYMBOL} ", fontWeight = FontWeight.Bold) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    isError = wageError != null,
                    supportingText = {
                        val parsed = CurrencyUtils.parseWage(wageStr) ?: 0.0
                        Text(
                            text = wageError ?: "Est: ${CurrencyUtils.formatMonthlyEstimate(parsed)}",
                            color = if (wageError != null) MaterialTheme.colorScheme.error else ConstructionSteel,
                            fontSize = 11.sp
                        )
                    },
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = siteId,
                    onValueChange = { siteId = it },
                    label = { Text("Assigned Site ID *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = batch,
                    onValueChange = { batch = it },
                    label = { Text("Batch Number *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = emergencyName,
                    onValueChange = { emergencyName = it },
                    label = { Text("Emergency Contact Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = emergencyPhone,
                    onValueChange = {
                        emergencyPhone = it
                        emergencyPhoneError = null
                    },
                    label = { Text("Emergency Contact Phone") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                    isError = emergencyPhoneError != null,
                    supportingText = emergencyPhoneError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } },
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = { Text("Residential Address") },
                    maxLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val phoneRes = ValidationUtils.validatePhone(phone)
                    if (!phoneRes.isValid) {
                        phoneError = phoneRes.errorMessage
                        return@Button
                    }

                    if (emergencyPhone.isNotBlank()) {
                        val emRes = ValidationUtils.validatePhone(emergencyPhone)
                        if (!emRes.isValid) {
                            emergencyPhoneError = emRes.errorMessage
                            return@Button
                        }
                    }

                    val wageRes = ValidationUtils.validateDailyWage(wageStr)
                    if (!wageRes.isValid) {
                        wageError = wageRes.errorMessage
                        return@Button
                    }

                    onSave(
                        WorkerUpdatePayload(
                            fullName = name.trim(),
                            phone = phoneRes.normalizedNumber,
                            jobRole = jobRole.trim(),
                            batchNumber = batch.trim(),
                            siteId = siteId.trim(),
                            dailyWage = wageRes.wageAmount,
                            emergencyContactName = emergencyName.trim(),
                            emergencyContactPhone = emergencyPhone.trim(),
                            address = address.trim()
                        )
                    )
                },
                colors = ButtonDefaults.buttonColors(containerColor = SafetyAmber)
            ) {
                Text("Save Changes", color = Color.White)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = ConstructionSteel)
            }
        },
        shape = RoundedCornerShape(12.dp),
        containerColor = Color.White
    )
}

@Composable
fun AddWorkerDialog(
    onDismiss: () -> Unit,
    onCreate: (Worker, String) -> Unit
) {
    var workerId by remember { mutableStateOf("") }
    var idError by remember { mutableStateOf<String?>(null) }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var phoneError by remember { mutableStateOf<String?>(null) }
    var email by remember { mutableStateOf("") }
    var emailError by remember { mutableStateOf<String?>(null) }
    var jobRole by remember { mutableStateOf(JobRole.HELPER.displayName) }
    var siteId by remember { mutableStateOf("SITE-DEFAULT-01") }
    var batch by remember { mutableStateOf("BATCH-24A") }
    var wageStr by remember { mutableStateOf("600") }
    var wageError by remember { mutableStateOf<String?>(null) }
    var pin by remember { mutableStateOf("") }
    var pinError by remember { mutableStateOf<String?>(null) }

    val scrollState = rememberScrollState()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Direct Worker Onboarding", fontWeight = FontWeight.Bold, color = ConstructionSlate)
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(scrollState),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "Provision a verified civil worker record and authentication credentials directly.",
                    fontSize = 12.sp,
                    color = ConstructionSteel
                )

                OutlinedTextField(
                    value = workerId,
                    onValueChange = {
                        workerId = it
                        idError = null
                    },
                    label = { Text("Worker ID (e.g. W-1050) *") },
                    singleLine = true,
                    isError = idError != null,
                    supportingText = idError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } },
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Full Legal Name *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = phone,
                    onValueChange = {
                        phone = it
                        phoneError = null
                    },
                    label = { Text("Mobile Phone (10 digits / +91) *") },
                    leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null, tint = ConstructionSteel) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                    isError = phoneError != null,
                    supportingText = phoneError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } },
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = email,
                    onValueChange = {
                        email = it
                        emailError = null
                    },
                    label = { Text("Login Email *") },
                    placeholder = { Text("worker@angelenterprises.com") },
                    leadingIcon = { Icon(Icons.Default.Email, contentDescription = null, tint = ConstructionSteel) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                    isError = emailError != null,
                    supportingText = emailError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } },
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = jobRole,
                    onValueChange = { jobRole = it },
                    label = { Text("Trade / Role *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = wageStr,
                    onValueChange = {
                        wageStr = it
                        wageError = null
                    },
                    label = { Text("Daily Wage Rate (INR) *") },
                    prefix = { Text("${CurrencyUtils.INR_SYMBOL} ", fontWeight = FontWeight.Bold) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    isError = wageError != null,
                    supportingText = wageError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } },
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = siteId,
                    onValueChange = { siteId = it },
                    label = { Text("Assigned Site *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = pin,
                    onValueChange = {
                        pin = it
                        pinError = null
                    },
                    label = { Text("Initial PIN / Password (min 6 chars) *") },
                    leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = ConstructionSteel) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    isError = pinError != null,
                    supportingText = pinError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (workerId.trim().length < 3) {
                        idError = "Worker ID must be at least 3 characters."
                        return@Button
                    }
                    val phoneRes = ValidationUtils.validatePhone(phone)
                    if (!phoneRes.isValid) {
                        phoneError = phoneRes.errorMessage
                        return@Button
                    }
                    if (!ValidationUtils.isValidEmail(email)) {
                        emailError = "Valid email is required."
                        return@Button
                    }
                    val wageRes = ValidationUtils.validateDailyWage(wageStr)
                    if (!wageRes.isValid) {
                        wageError = wageRes.errorMessage
                        return@Button
                    }
                    if (pin.length < 6) {
                        pinError = "PIN/Password must be at least 6 characters."
                        return@Button
                    }

                    val newWorker = Worker(
                        workerId = workerId.trim(),
                        fullName = name.trim(),
                        phone = phoneRes.normalizedNumber,
                        email = email.trim().lowercase(),
                        jobRole = jobRole.trim(),
                        siteId = siteId.trim(),
                        batchNumber = batch.trim(),
                        dailyWage = wageRes.wageAmount,
                        status = UserStatus.ACTIVE
                    )
                    onCreate(newWorker, pin)
                },
                colors = ButtonDefaults.buttonColors(containerColor = SafetyAmber)
            ) {
                Text("Provision Worker", color = Color.White)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = ConstructionSteel)
            }
        },
        shape = RoundedCornerShape(12.dp),
        containerColor = Color.White
    )
}

@Composable
fun DetailRow(label: String, value: String) {
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
