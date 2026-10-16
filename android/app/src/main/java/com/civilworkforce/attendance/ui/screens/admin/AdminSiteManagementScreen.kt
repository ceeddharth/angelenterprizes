package com.civilworkforce.attendance.ui.screens.admin

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import com.civilworkforce.attendance.data.SiteRepository
import com.civilworkforce.attendance.data.StorageRepository
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.Site
import com.civilworkforce.attendance.model.SitePhoto
import com.civilworkforce.attendance.model.SiteStatus
import com.civilworkforce.attendance.ui.components.CivilTopAppBar
import com.civilworkforce.attendance.ui.components.EmptyStateView
import com.civilworkforce.attendance.ui.components.ErrorDialog
import com.civilworkforce.attendance.ui.components.LoadingOverlay
import com.civilworkforce.attendance.ui.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SiteManagementUiState(
    val sites: List<Site> = emptyList(),
    val isFormOpen: Boolean = false,
    val editingSite: Site? = null,
    // Form fields
    val siteIdInput: String = "",
    val siteNameInput: String = "",
    val projectNameInput: String = "",
    val addressInput: String = "",
    val descriptionInput: String = "",
    // Future expansion fields (Phase 2 hooks)
    val latitudeInput: String = "",
    val longitudeInput: String = "",
    val geofenceRadiusInput: String = "150",
    val qrConfigInput: String = "",
    // Photos management (1–5 photos per site)
    val isPhotosDialogOpen: Boolean = false,
    val selectedSiteForPhotos: Site? = null,
    val sitePhotos: List<SitePhoto> = emptyList(),
    val isUploadingPhoto: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class AdminSiteViewModel(
    private val siteRepository: SiteRepository,
    private val storageRepository: StorageRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SiteManagementUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadSites()
    }

    fun loadSites() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val res = siteRepository.getAllSites()) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(sites = res.data, isLoading = false)
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = res.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun openCreateDialog() {
        _uiState.value = _uiState.value.copy(
            isFormOpen = true,
            editingSite = null,
            siteIdInput = "SITE-" + (1000..9999).random(),
            siteNameInput = "",
            projectNameInput = "",
            addressInput = "",
            descriptionInput = "",
            latitudeInput = "",
            longitudeInput = "",
            geofenceRadiusInput = "150",
            qrConfigInput = ""
        )
    }

    fun openEditDialog(site: Site) {
        _uiState.value = _uiState.value.copy(
            isFormOpen = true,
            editingSite = site,
            siteIdInput = site.siteId,
            siteNameInput = site.siteName,
            projectNameInput = site.projectName,
            addressInput = site.address,
            descriptionInput = site.description,
            latitudeInput = site.latitude?.toString() ?: "",
            longitudeInput = site.longitude?.toString() ?: "",
            geofenceRadiusInput = site.geofenceRadiusMeters?.toString() ?: "150",
            qrConfigInput = site.qrConfigurationId ?: ""
        )
    }

    fun closeFormDialog() {
        _uiState.value = _uiState.value.copy(isFormOpen = false, editingSite = null)
    }

    fun saveSite() {
        val s = _uiState.value
        if (s.siteIdInput.isBlank() || s.siteNameInput.isBlank() || s.projectNameInput.isBlank() || s.addressInput.isBlank()) {
            _uiState.value = s.copy(errorMessage = "Please enter Site ID, Site Name, Project Name, and Address.")
            return
        }

        val siteToSave = Site(
            siteId = s.siteIdInput.trim(),
            siteName = s.siteNameInput.trim(),
            projectName = s.projectNameInput.trim(),
            address = s.addressInput.trim(),
            description = s.descriptionInput.trim(),
            status = s.editingSite?.status ?: SiteStatus.ACTIVE,
            latitude = s.latitudeInput.toDoubleOrNull(),
            longitude = s.longitudeInput.toDoubleOrNull(),
            geofenceRadiusMeters = s.geofenceRadiusInput.toIntOrNull(),
            qrConfigurationId = s.qrConfigInput.ifBlank { null }
        )

        viewModelScope.launch {
            _uiState.value = s.copy(isLoading = true, errorMessage = null)
            val res = if (s.editingSite == null) {
                siteRepository.createSite(siteToSave)
            } else {
                siteRepository.updateSite(siteToSave)
            }
            when (res) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(isFormOpen = false, editingSite = null)
                    loadSites()
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = res.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun toggleSiteStatus(site: Site) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            when (val res = siteRepository.toggleSiteStatus(site.siteId, site.status)) {
                is Resource.Success -> loadSites()
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = res.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    // Site Photos Management (1–5 photos per site)
    fun openPhotosDialog(site: Site) {
        _uiState.value = _uiState.value.copy(
            isPhotosDialogOpen = true,
            selectedSiteForPhotos = site,
            sitePhotos = emptyList(),
            errorMessage = null
        )
        loadSitePhotos(site.siteId)
    }

    fun closePhotosDialog() {
        _uiState.value = _uiState.value.copy(
            isPhotosDialogOpen = false,
            selectedSiteForPhotos = null,
            sitePhotos = emptyList()
        )
    }

    fun loadSitePhotos(siteId: String) {
        viewModelScope.launch {
            when (val res = storageRepository.getSitePhotos(siteId)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(sitePhotos = res.data)
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(errorMessage = res.message)
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun uploadSitePhoto(siteId: String, uri: Uri, context: Context) {
        val currentPhotos = _uiState.value.sitePhotos
        if (currentPhotos.size >= 5) {
            _uiState.value = _uiState.value.copy(errorMessage = "Maximum limit reached: A site can have at most 5 photos.")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isUploadingPhoto = true, errorMessage = null)
            try {
                val inputStream = context.contentResolver.openInputStream(uri)
                val bytes = inputStream?.readBytes() ?: throw Exception("Failed to read image data")
                inputStream.close()

                val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
                val fileName = "site_${siteId}_${System.currentTimeMillis()}.jpg"

                when (val res = storageRepository.uploadSitePhoto(siteId, bytes, mimeType, fileName)) {
                    is Resource.Success -> {
                        _uiState.value = _uiState.value.copy(isUploadingPhoto = false)
                        loadSitePhotos(siteId)
                        loadSites() // refresh site photo counts
                    }
                    is Resource.Error -> {
                        _uiState.value = _uiState.value.copy(isUploadingPhoto = false, errorMessage = res.message)
                    }
                    Resource.Loading -> Unit
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isUploadingPhoto = false,
                    errorMessage = e.message ?: "Failed to upload site photo"
                )
            }
        }
    }

    fun deleteSitePhoto(siteId: String, photoId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isUploadingPhoto = true, errorMessage = null)
            when (val res = storageRepository.deleteSitePhoto(siteId, photoId)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(isUploadingPhoto = false)
                    loadSitePhotos(siteId)
                    loadSites()
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(isUploadingPhoto = false, errorMessage = res.message)
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
fun AdminSiteManagementScreen(
    viewModel: AdminSiteViewModel,
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    val sitePhotoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        val site = uiState.selectedSiteForPhotos
        if (uri != null && site != null) {
            viewModel.uploadSitePhoto(site.siteId, uri, context)
        }
    }

    Scaffold(
        topBar = {
            CivilTopAppBar(
                title = "Construction Sites",
                canNavigateBack = true,
                onNavigateBack = onNavigateBack,
                actions = {
                    IconButton(onClick = viewModel::loadSites) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = viewModel::openCreateDialog,
                containerColor = SafetyAmber,
                contentColor = Color.White
            ) {
                Icon(Icons.Default.Add, contentDescription = "Create Construction Site")
            }
        },
        containerColor = ConcreteBackground
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            if (uiState.sites.isEmpty() && !uiState.isLoading) {
                EmptyStateView(
                    message = "No construction sites registered. Click + to add one.",
                    icon = Icons.Default.LocationOff
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(uiState.sites) { site ->
                        SiteCardItem(
                            site = site,
                            onEdit = { viewModel.openEditDialog(site) },
                            onManagePhotos = { viewModel.openPhotosDialog(site) },
                            onToggleStatus = { viewModel.toggleSiteStatus(site) }
                        )
                    }
                }
            }

            LoadingOverlay(isLoading = uiState.isLoading || uiState.isUploadingPhoto)
            ErrorDialog(
                errorMessage = uiState.errorMessage,
                onDismiss = viewModel::dismissError
            )

            // Create / Edit Site Dialog
            if (uiState.isFormOpen) {
                SiteFormDialog(
                    uiState = uiState,
                    onSave = viewModel::saveSite,
                    onDismiss = viewModel::closeFormDialog
                )
            }

            // Site Photos Management Dialog (1–5 photos)
            if (uiState.isPhotosDialogOpen && uiState.selectedSiteForPhotos != null) {
                val site = uiState.selectedSiteForPhotos!!
                AlertDialog(
                    onDismissRequest = viewModel::closePhotosDialog,
                    title = {
                        Column {
                            Text(
                                text = "Site Photos: ${site.siteName}",
                                fontWeight = FontWeight.Bold,
                                color = ConstructionSlate,
                                fontSize = 18.sp
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "${uiState.sitePhotos.size} / 5 photos uploaded (Firebase Storage)",
                                fontSize = 12.sp,
                                color = ConstructionSteel
                            )
                        }
                    },
                    text = {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            if (uiState.sitePhotos.isEmpty()) {
                                Surface(
                                    color = Color(0xFFF8FAFC),
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(
                                        modifier = Modifier.padding(16.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Icon(
                                            Icons.Default.AddPhotoAlternate,
                                            contentDescription = null,
                                            tint = ConstructionSteel,
                                            modifier = Modifier.size(36.dp)
                                        )
                                        Spacer(modifier = Modifier.height(6.dp))
                                        Text(
                                            text = "No photos added for this construction site.",
                                            fontSize = 13.sp,
                                            color = ConstructionSteel
                                        )
                                    }
                                }
                            } else {
                                LazyRow(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    items(uiState.sitePhotos) { photo ->
                                        Box(
                                            modifier = Modifier
                                                .size(100.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .border(1.dp, ConcreteBorder, RoundedCornerShape(8.dp))
                                        ) {
                                            AsyncImage(
                                                model = photo.downloadUrl,
                                                contentDescription = "Site Photo",
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier.fillMaxSize()
                                            )
                                            // Delete photo button
                                            Surface(
                                                shape = CircleShape,
                                                color = Color(0xCC000000),
                                                modifier = Modifier
                                                    .align(Alignment.TopEnd)
                                                    .padding(4.dp)
                                                    .size(24.dp)
                                                    .clickable {
                                                        viewModel.deleteSitePhoto(site.siteId, photo.photoId)
                                                    }
                                            ) {
                                                Icon(
                                                    Icons.Default.Close,
                                                    contentDescription = "Delete photo",
                                                    tint = Color.White,
                                                    modifier = Modifier.padding(4.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }

                            // Add Photo button (disabled if >= 5)
                            Button(
                                onClick = { sitePhotoPickerLauncher.launch("image/*") },
                                enabled = uiState.sitePhotos.size < 5,
                                colors = ButtonDefaults.buttonColors(containerColor = SafetyAmber),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.Upload, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = if (uiState.sitePhotos.size < 5) "Upload Site Photo" else "Limit Reached (Max 5)",
                                    color = Color.White,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    },
                    confirmButton = {
                        TextButton(onClick = viewModel::closePhotosDialog) {
                            Text("Done", fontWeight = FontWeight.Bold, color = ConstructionSlate)
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
fun SiteCardItem(
    site: Site,
    onEdit: () -> Unit,
    onManagePhotos: () -> Unit,
    onToggleStatus: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = site.siteName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = ConstructionSlate,
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                    )
                    Text(
                        text = "Project: ${site.projectName} (ID: ${site.siteId})",
                        style = MaterialTheme.typography.bodySmall,
                        color = ConstructionSteel,
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                    )
                }
                Spacer(modifier = Modifier.width(8.dp))
                Surface(
                    color = if (site.status == SiteStatus.ACTIVE) Color(0xFFDCFCE7) else Color(0xFFF1F5F9),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = site.status.name,
                        color = if (site.status == SiteStatus.ACTIVE) StatusActiveGreen else ConstructionSteel,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = site.address,
                style = MaterialTheme.typography.bodyMedium,
                color = ConstructionSlate,
                maxLines = 2,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
            )
            if (site.description.isNotBlank()) {
                Text(
                    text = site.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = ConstructionSteel,
                    maxLines = 2,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = ConcreteBorder)
            Spacer(modifier = Modifier.height(6.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Photos button
                OutlinedButton(
                    onClick = onManagePhotos,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = SafetyAmber),
                    border = ButtonDefaults.outlinedButtonBorder.copy(width = 1.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Photos", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextButton(
                        onClick = onToggleStatus,
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = if (site.status == SiteStatus.ACTIVE) "Deactivate" else "Activate",
                            color = if (site.status == SiteStatus.ACTIVE) StatusSuspendedRed else StatusActiveGreen,
                            fontSize = 12.sp
                        )
                    }
                    Button(
                        onClick = onEdit,
                        colors = ButtonDefaults.buttonColors(containerColor = ConstructionSlate),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text("Edit Site", color = Color.White, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun SiteFormDialog(
    uiState: SiteManagementUiState,
    onSave: () -> Unit,
    onDismiss: () -> Unit
) {
    var sId by remember { mutableStateOf(uiState.siteIdInput) }
    var sName by remember { mutableStateOf(uiState.siteNameInput) }
    var pName by remember { mutableStateOf(uiState.projectNameInput) }
    var addr by remember { mutableStateOf(uiState.addressInput) }
    var desc by remember { mutableStateOf(uiState.descriptionInput) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = if (uiState.editingSite == null) "Create Construction Site" else "Edit Site",
                fontWeight = FontWeight.Bold,
                color = ConstructionSlate
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = sId,
                    onValueChange = { sId = it },
                    label = { Text("Site ID *") },
                    enabled = uiState.editingSite == null,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = sName,
                    onValueChange = { sName = it },
                    label = { Text("Site Name *") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = pName,
                    onValueChange = { pName = it },
                    label = { Text("Project Name *") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = addr,
                    onValueChange = { addr = it },
                    label = { Text("Address / Location *") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = desc,
                    onValueChange = { desc = it },
                    label = { Text("Description") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onSave,
                colors = ButtonDefaults.buttonColors(containerColor = SafetyAmber)
            ) {
                Text("Save Site", color = Color.White)
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
