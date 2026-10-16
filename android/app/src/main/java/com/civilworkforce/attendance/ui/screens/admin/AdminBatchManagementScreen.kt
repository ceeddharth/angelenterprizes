package com.civilworkforce.attendance.ui.screens.admin

import androidx.compose.foundation.background
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.civilworkforce.attendance.data.BatchRepository
import com.civilworkforce.attendance.model.Batch
import com.civilworkforce.attendance.model.BatchStatus
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.ui.components.CivilTopAppBar
import com.civilworkforce.attendance.ui.components.EmptyStateView
import com.civilworkforce.attendance.ui.components.LoadingView
import com.civilworkforce.attendance.ui.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class BatchManagementUiState(
    val batches: List<Batch> = emptyList(),
    val isLoading: Boolean = false,
    val updatingBatchId: String? = null,
    val errorMessage: String? = null,
    val successMessage: String? = null,
    // Dialog state for confirmation
    val batchToToggle: Batch? = null,
    // Dialog state for creation
    val isCreateDialogOpen: Boolean = false,
    val newBatchId: String = "",
    val newBatchName: String = "",
    val newBatchNotes: String = "",
    val selectedFilter: BatchFilter = BatchFilter.ALL
)

enum class BatchFilter {
    ALL,
    ACTIVE,
    INACTIVE
}

class AdminBatchViewModel(
    private val batchRepository: BatchRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(BatchManagementUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadBatches()
    }

    fun loadBatches() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val res = batchRepository.getAllBatches()) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(
                        batches = res.data,
                        isLoading = false
                    )
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = res.message
                    )
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun setFilter(filter: BatchFilter) {
        _uiState.value = _uiState.value.copy(selectedFilter = filter)
    }

    fun promptToggleStatus(batch: Batch) {
        _uiState.value = _uiState.value.copy(batchToToggle = batch)
    }

    fun dismissToggleDialog() {
        _uiState.value = _uiState.value.copy(batchToToggle = null)
    }

    fun confirmToggleStatus() {
        val batch = _uiState.value.batchToToggle ?: return
        val targetId = batch.batchId
        val nextStatus = if (batch.status == BatchStatus.ACTIVE) BatchStatus.INACTIVE else BatchStatus.ACTIVE

        _uiState.value = _uiState.value.copy(
            batchToToggle = null,
            updatingBatchId = targetId,
            errorMessage = null,
            successMessage = null
        )

        viewModelScope.launch {
            when (val res = batchRepository.toggleBatchStatus(targetId, batch.status)) {
                is Resource.Success -> {
                    // Refresh directly from database to ensure saved state is displayed
                    when (val reloadRes = batchRepository.getAllBatches()) {
                        is Resource.Success -> {
                            _uiState.value = _uiState.value.copy(
                                batches = reloadRes.data,
                                updatingBatchId = null,
                                successMessage = "Batch $targetId is now ${nextStatus.name}"
                            )
                        }
                        is Resource.Error -> {
                            _uiState.value = _uiState.value.copy(
                                updatingBatchId = null,
                                successMessage = "Status updated to ${nextStatus.name}, but refresh failed: ${reloadRes.message}"
                            )
                        }
                        Resource.Loading -> Unit
                    }
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(
                        updatingBatchId = null,
                        errorMessage = "Failed to update batch: ${res.message}"
                    )
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun openCreateDialog() {
        val nextNum = (_uiState.value.batches.size + 1).toString().padStart(2, '0')
        _uiState.value = _uiState.value.copy(
            isCreateDialogOpen = true,
            newBatchId = "BATCH-$nextNum",
            newBatchName = "Shift $nextNum - General",
            newBatchNotes = ""
        )
    }

    fun updateNewBatchFields(id: String, name: String, notes: String) {
        _uiState.value = _uiState.value.copy(
            newBatchId = id,
            newBatchName = name,
            newBatchNotes = notes
        )
    }

    fun dismissCreateDialog() {
        _uiState.value = _uiState.value.copy(isCreateDialogOpen = false)
    }

    fun createBatch() {
        val id = _uiState.value.newBatchId.trim()
        val name = _uiState.value.newBatchName.trim()
        val notes = _uiState.value.newBatchNotes.trim()

        if (id.isBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Batch ID cannot be empty")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, isCreateDialogOpen = false)
            val newBatch = Batch(
                batchId = id,
                batchNumber = id,
                name = if (name.isNotBlank()) name else id,
                notes = notes,
                status = BatchStatus.ACTIVE
            )

            when (val res = batchRepository.createBatch(newBatch)) {
                is Resource.Success -> {
                    loadBatches()
                    _uiState.value = _uiState.value.copy(successMessage = "Batch $id created successfully")
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = "Failed to create batch: ${res.message}"
                    )
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun clearMessages() {
        _uiState.value = _uiState.value.copy(errorMessage = null, successMessage = null)
    }
}

@Composable
fun AdminBatchManagementScreen(
    viewModel: AdminBatchViewModel,
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessages()
        }
    }

    LaunchedEffect(uiState.successMessage) {
        uiState.successMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessages()
        }
    }

    Scaffold(
        topBar = {
            CivilTopAppBar(
                title = "Workforce Batches",
                showBackButton = true,
                onBackClick = onNavigateBack,
                actions = {
                    IconButton(onClick = viewModel::loadBatches) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
                    }
                    IconButton(onClick = viewModel::openCreateDialog) {
                        Icon(Icons.Default.Add, contentDescription = "Add Batch", tint = SafetyAmber)
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = ConcreteBackground
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Overview summary card
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceAround,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val total = uiState.batches.size
                    val active = uiState.batches.count { it.status == BatchStatus.ACTIVE }
                    val inactive = total - active

                    BatchStatItem(label = "Total Batches", value = total.toString(), color = ConstructionDark)
                    Divider(modifier = Modifier.height(32.dp).width(1.dp), color = ConcreteBorder)
                    BatchStatItem(label = "Active", value = active.toString(), color = VerifiedGreen)
                    Divider(modifier = Modifier.height(32.dp).width(1.dp), color = ConcreteBorder)
                    BatchStatItem(label = "Inactive", value = inactive.toString(), color = HazardRed)
                }
            }

            // Filter Tabs (All, Active, Inactive)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = uiState.selectedFilter == BatchFilter.ALL,
                    onClick = { viewModel.setFilter(BatchFilter.ALL) },
                    label = { Text("All (${uiState.batches.size})") }
                )
                FilterChip(
                    selected = uiState.selectedFilter == BatchFilter.ACTIVE,
                    onClick = { viewModel.setFilter(BatchFilter.ACTIVE) },
                    label = { Text("Active (${uiState.batches.count { it.status == BatchStatus.ACTIVE }})") }
                )
                FilterChip(
                    selected = uiState.selectedFilter == BatchFilter.INACTIVE,
                    onClick = { viewModel.setFilter(BatchFilter.INACTIVE) },
                    label = { Text("Inactive (${uiState.batches.count { it.status == BatchStatus.INACTIVE }})") }
                )
            }

            // Batches List
            val filteredBatches = remember(uiState.batches, uiState.selectedFilter) {
                when (uiState.selectedFilter) {
                    BatchFilter.ALL -> uiState.batches
                    BatchFilter.ACTIVE -> uiState.batches.filter { it.status == BatchStatus.ACTIVE }
                    BatchFilter.INACTIVE -> uiState.batches.filter { it.status == BatchStatus.INACTIVE }
                }
            }

            if (uiState.isLoading && uiState.batches.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    LoadingView()
                }
            } else if (filteredBatches.isEmpty()) {
                EmptyStateView(
                    message = if (uiState.batches.isEmpty()) "No workforce batches found. Click + to create one." else "No batches match this filter.",
                    icon = Icons.Default.Groups
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(filteredBatches, key = { it.batchId }) { batch ->
                        BatchCard(
                            batch = batch,
                            isUpdating = uiState.updatingBatchId == batch.batchId,
                            onToggleStatus = { viewModel.promptToggleStatus(batch) }
                        )
                    }
                }
            }
        }
    }

    // Confirmation Dialog for Activation/Deactivation
    uiState.batchToToggle?.let { batch ->
        val isActivating = batch.status == BatchStatus.INACTIVE
        AlertDialog(
            onDismissRequest = viewModel::dismissToggleDialog,
            icon = {
                Icon(
                    imageVector = if (isActivating) Icons.Default.CheckCircle else Icons.Default.Warning,
                    contentDescription = null,
                    tint = if (isActivating) VerifiedGreen else HazardRed
                )
            },
            title = {
                Text(
                    text = if (isActivating) "Activate Batch?" else "Deactivate Batch?",
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "Batch ID: ${batch.batchId} (${batch.name.ifBlank { "Unnamed" }})",
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = if (isActivating) {
                            "Activating this batch allows workers assigned to it to check in and record attendance normally."
                        } else {
                            "Deactivating this batch will prevent new attendance check-ins for workers assigned to this batch until it is reactivated."
                        },
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = viewModel::confirmToggleStatus,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isActivating) VerifiedGreen else HazardRed
                    )
                ) {
                    Text(if (isActivating) "Confirm Activation" else "Confirm Deactivation")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = viewModel::dismissToggleDialog) {
                    Text("Cancel")
                }
            }
        )
    }

    // Create Batch Dialog
    if (uiState.isCreateDialogOpen) {
        AlertDialog(
            onDismissRequest = viewModel::dismissCreateDialog,
            title = { Text("Create Workforce Batch", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = uiState.newBatchId,
                        onValueChange = { viewModel.updateNewBatchFields(it, uiState.newBatchName, uiState.newBatchNotes) },
                        label = { Text("Batch ID (e.g. BATCH-08)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = uiState.newBatchName,
                        onValueChange = { viewModel.updateNewBatchFields(uiState.newBatchId, it, uiState.newBatchNotes) },
                        label = { Text("Batch Name (e.g. Shift 08 - Masonry)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = uiState.newBatchNotes,
                        onValueChange = { viewModel.updateNewBatchFields(uiState.newBatchId, uiState.newBatchName, it) },
                        label = { Text("Notes (Optional)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = viewModel::createBatch,
                    colors = ButtonDefaults.buttonColors(containerColor = ConstructionDark)
                ) {
                    Text("Create Batch", color = SafetyAmber)
                }
            },
            dismissButton = {
                OutlinedButton(onClick = viewModel::dismissCreateDialog) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun BatchStatItem(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, fontSize = 20.sp, fontWeight = FontWeight.Black, color = color)
        Text(text = label, fontSize = 11.sp, color = ConstructionSlate, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun BatchCard(
    batch: Batch,
    isUpdating: Boolean,
    onToggleStatus: () -> Unit
) {
    val isActive = batch.status == BatchStatus.ACTIVE

    Card(
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = if (isActive) SafetyAmber.copy(alpha = 0.15f) else Color.LightGray.copy(alpha = 0.3f)
                    ) {
                        Text(
                            text = batch.batchId,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isActive) ConstructionDark else Color.DarkGray,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }

                    Text(
                        text = batch.name.ifBlank { "Batch ${batch.batchId}" },
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = ConstructionDark
                    )
                }

                // Status Badge
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (isActive) VerifiedGreen.copy(alpha = 0.15f) else HazardRed.copy(alpha = 0.15f)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(if (isActive) VerifiedGreen else HazardRed)
                        )
                        Text(
                            text = if (isActive) "ACTIVE" else "INACTIVE",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isActive) VerifiedGreen else HazardRed
                        )
                    }
                }
            }

            if (batch.notes.isNotBlank()) {
                Text(
                    text = batch.notes,
                    fontSize = 12.sp,
                    color = ConstructionSlate
                )
            }

            Divider(color = ConcreteBorder, thickness = 0.8.dp)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "ID: ${batch.batchId}",
                    fontSize = 11.sp,
                    color = Color.Gray
                )

                if (isUpdating) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = if (isActive) HazardRed else VerifiedGreen
                        )
                        Text(
                            text = "Updating status...",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = ConstructionSlate
                        )
                    }
                } else {
                    Button(
                        onClick = onToggleStatus,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isActive) HazardRed.copy(alpha = 0.1f) else VerifiedGreen.copy(alpha = 0.12f),
                            contentColor = if (isActive) HazardRed else VerifiedGreen
                        ),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Icon(
                            imageVector = if (isActive) Icons.Default.PauseCircle else Icons.Default.PlayCircle,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (isActive) "Deactivate" else "Activate",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}
