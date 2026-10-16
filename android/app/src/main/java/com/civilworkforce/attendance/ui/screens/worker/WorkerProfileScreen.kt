package com.civilworkforce.attendance.ui.screens.worker

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.civilworkforce.attendance.data.AuthRepository
import com.civilworkforce.attendance.data.StorageRepository
import com.civilworkforce.attendance.data.WorkerRepository
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.Worker
import com.civilworkforce.attendance.ui.components.CivilTopAppBar
import com.civilworkforce.attendance.ui.components.ErrorDialog
import com.civilworkforce.attendance.ui.components.LoadingOverlay
import com.civilworkforce.attendance.ui.components.StatusBadge
import com.civilworkforce.attendance.ui.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class WorkerProfileUiState(
    val worker: Worker? = null,
    val isLoading: Boolean = false,
    val isUploadingPhoto: Boolean = false,
    val errorMessage: String? = null
)

class WorkerProfileViewModel(
    private val workerRepository: WorkerRepository,
    private val authRepository: AuthRepository,
    private val storageRepository: StorageRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(WorkerProfileUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadProfile()
    }

    fun loadProfile() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val userRes = authRepository.getCurrentUser()) {
                is Resource.Success -> {
                    val uid = userRes.data?.uid
                    if (uid != null) {
                        when (val workerRes = workerRepository.getWorkerByUid(uid)) {
                            is Resource.Success -> {
                                _uiState.value = _uiState.value.copy(worker = workerRes.data, isLoading = false)
                            }
                            is Resource.Error -> {
                                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = workerRes.message)
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

    fun uploadProfilePhoto(uri: Uri, context: Context) {
        val currentWorker = _uiState.value.worker ?: return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isUploadingPhoto = true, errorMessage = null)
            try {
                val inputStream = context.contentResolver.openInputStream(uri)
                val bytes = inputStream?.readBytes() ?: throw Exception("Failed to read selected image data")
                inputStream.close()

                val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
                when (val result = storageRepository.uploadWorkerProfilePhoto(
                    workerId = currentWorker.workerId,
                    imageBytes = bytes,
                    mimeType = mimeType,
                    fileName = "profile_${currentWorker.workerId}.jpg"
                )) {
                    is Resource.Success -> {
                        val updatedWorker = currentWorker.copy(profilePhoto = result.data)
                        _uiState.value = _uiState.value.copy(worker = updatedWorker, isUploadingPhoto = false)
                    }
                    is Resource.Error -> {
                        _uiState.value = _uiState.value.copy(isUploadingPhoto = false, errorMessage = result.message)
                    }
                    Resource.Loading -> Unit
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isUploadingPhoto = false,
                    errorMessage = e.message ?: "Failed to upload photo"
                )
            }
        }
    }

    fun deleteProfilePhoto() {
        val currentWorker = _uiState.value.worker ?: return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isUploadingPhoto = true, errorMessage = null)
            when (val result = storageRepository.deleteWorkerProfilePhoto(currentWorker.workerId)) {
                is Resource.Success -> {
                    val updatedWorker = currentWorker.copy(profilePhoto = null)
                    _uiState.value = _uiState.value.copy(worker = updatedWorker, isUploadingPhoto = false)
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isUploadingPhoto = false, errorMessage = result.message)
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
fun WorkerProfileScreen(
    viewModel: WorkerProfileViewModel,
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val worker = uiState.worker
    val context = LocalContext.current

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { viewModel.uploadProfilePhoto(it, context) }
    }

    Scaffold(
        topBar = {
            CivilTopAppBar(
                title = "Worker Profile",
                canNavigateBack = true,
                onNavigateBack = onNavigateBack
            )
        },
        containerColor = ConcreteBackground
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Header Profile Badge with Photo Integration
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Profile Avatar Box with Upload Badge
                        Box(contentAlignment = Alignment.BottomEnd) {
                            Surface(
                                shape = CircleShape,
                                color = SafetyAmber,
                                modifier = Modifier
                                    .size(88.dp)
                                    .border(2.dp, SafetyAmber, CircleShape)
                            ) {
                                val photoUrl = worker?.profilePhoto?.downloadUrl
                                if (!photoUrl.isNullOrBlank()) {
                                    AsyncImage(
                                        model = photoUrl,
                                        contentDescription = "Profile Photo",
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .clip(CircleShape)
                                    )
                                } else {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.Engineering,
                                            contentDescription = null,
                                            tint = Color.White,
                                            modifier = Modifier.size(48.dp)
                                        )
                                    }
                                }
                            }

                            // Camera Edit Button
                            Surface(
                                shape = CircleShape,
                                color = ConstructionSlate,
                                shadowElevation = 3.dp,
                                modifier = Modifier
                                    .size(30.dp)
                                    .clickable { photoPickerLauncher.launch("image/*") }
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.CameraAlt,
                                        contentDescription = "Change Profile Photo",
                                        tint = Color.White,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        // Photo Actions: Upload / Delete
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            TextButton(
                                onClick = { photoPickerLauncher.launch("image/*") },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Icon(Icons.Default.Upload, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = if (worker?.profilePhoto != null) "Change Photo" else "Upload Photo",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = SafetyAmber
                                )
                            }

                            if (worker?.profilePhoto != null) {
                                TextButton(
                                    onClick = viewModel::deleteProfilePhoto,
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                                ) {
                                    Icon(Icons.Default.Delete, contentDescription = null, tint = AlertRed, modifier = Modifier.size(14.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Remove", fontSize = 12.sp, color = AlertRed)
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = worker?.fullName ?: "Civil Worker",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = ConstructionSlate
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        StatusBadge(worker?.status?.name ?: "ACTIVE")

                        Spacer(modifier = Modifier.height(14.dp))
                        Surface(
                            color = Color(0xFFF8FAFC),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.Lock,
                                    contentDescription = null,
                                    tint = ConstructionSteel,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "Employment records are read-only and verified by ANGEL ENTERPRISES HR",
                                    fontSize = 12.sp,
                                    color = ConstructionSteel
                                )
                            }
                        }
                    }
                }

                // Profile Fields Grid
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Text(
                            text = "Official Record Details",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = ConstructionSlate
                        )
                        val wage = if ((worker?.dailyWage ?: 0.0) > 0.0) worker!!.dailyWage else JobRole.fromNameOrDisplay(worker?.jobRole ?: "").defaultDailyWage

                        ProfileFieldRow(label = "Worker ID", value = worker?.workerId ?: "—")
                        ProfileFieldRow(label = "Daily Wage Rate", value = CurrencyUtils.formatDailyWage(wage))
                        ProfileFieldRow(label = "Monthly Estimate (26d)", value = CurrencyUtils.formatInr(wage * 26))
                        ProfileFieldRow(label = "Batch Number", value = worker?.batchNumber ?: "—")
                        ProfileFieldRow(label = "Job Role / Trade", value = worker?.jobRole ?: "—")
                        ProfileFieldRow(label = "Assigned Site", value = worker?.siteId ?: "—")
                        ProfileFieldRow(label = "Joining Date", value = worker?.joiningDate ?: "—")
                        ProfileFieldRow(label = "Phone Number", value = ValidationUtils.formatPhoneDisplay(worker?.phone ?: "—"))
                        ProfileFieldRow(label = "Email Address", value = worker?.email ?: "—")
                        ProfileFieldRow(label = "Residential Address", value = worker?.address ?: "—")
                        ProfileFieldRow(
                            label = "Emergency Contact",
                            value = "${worker?.emergencyContactName ?: "—"} (${ValidationUtils.formatPhoneDisplay(worker?.emergencyContactPhone ?: "—")})"
                        )
                    }
                }
            }

            LoadingOverlay(isLoading = uiState.isLoading || uiState.isUploadingPhoto)
            ErrorDialog(
                errorMessage = uiState.errorMessage,
                onDismiss = viewModel::dismissError
            )
        }
    }
}

@Composable
fun ProfileFieldRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            fontSize = 13.sp,
            color = ConstructionSteel,
            modifier = Modifier.weight(0.42f)
        )
        Text(
            text = value,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = ConstructionSlate,
            textAlign = androidx.compose.ui.text.style.TextAlign.End,
            modifier = Modifier.weight(0.58f)
        )
    }
}
