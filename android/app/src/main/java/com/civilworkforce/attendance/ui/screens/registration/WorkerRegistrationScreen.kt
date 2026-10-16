package com.civilworkforce.attendance.ui.screens.registration

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.civilworkforce.attendance.data.RegistrationRepository
import com.civilworkforce.attendance.data.SiteRepository
import com.civilworkforce.attendance.model.JobRole
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.Site
import com.civilworkforce.attendance.model.SubmittedData
import com.civilworkforce.attendance.ui.components.CivilTopAppBar
import com.civilworkforce.attendance.ui.components.ErrorDialog
import com.civilworkforce.attendance.ui.components.LoadingOverlay
import com.civilworkforce.attendance.ui.theme.*
import com.civilworkforce.attendance.util.CurrencyUtils
import com.civilworkforce.attendance.util.ValidationUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RegistrationUiState(
    val currentStep: Int = 1, // 1: Personal, 2: Employment, 3: Account
    // Step 1: Personal
    val fullName: String = "",
    val dateOfBirth: String = "",
    val phone: String = "",
    val phoneError: String? = null,
    val email: String = "",
    val emailError: String? = null,
    val address: String = "",
    val emergencyContactName: String = "",
    val emergencyContactPhone: String = "",
    val emergencyPhoneError: String? = null,
    // Step 2: Employment
    val workerId: String = "",
    val batchNumber: String = "",
    val jobRole: String = JobRole.HELPER.displayName,
    val siteId: String = "",
    val joiningDate: String = "",
    val dailyWage: String = JobRole.HELPER.defaultDailyWage.toInt().toString(),
    val wageError: String? = null,
    val sites: List<Site> = emptyList(),
    // Step 3: Account Security
    val passwordPin: String = "",
    val confirmPasswordPin: String = "",
    val termsAccepted: Boolean = false,
    // Status & Feedback
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isSubmittedSuccess: Boolean = false
)

class WorkerRegistrationViewModel(
    private val registrationRepository: RegistrationRepository,
    private val siteRepository: SiteRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegistrationUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadSites()
    }

    private fun loadSites() {
        viewModelScope.launch {
            when (val res = siteRepository.getActiveSites()) {
                is Resource.Success -> {
                    val sites = res.data
                    _uiState.value = _uiState.value.copy(
                        sites = sites,
                        siteId = if (sites.isNotEmpty()) sites.first().siteId else ""
                    )
                }
                else -> Unit
            }
        }
    }

    fun updateField(block: (RegistrationUiState) -> RegistrationUiState) {
        _uiState.value = block(_uiState.value)
    }

    fun onPhoneChanged(newVal: String) {
        _uiState.value = _uiState.value.copy(
            phone = newVal,
            phoneError = null,
            errorMessage = null
        )
    }

    fun onEmergencyPhoneChanged(newVal: String) {
        _uiState.value = _uiState.value.copy(
            emergencyContactPhone = newVal,
            emergencyPhoneError = null,
            errorMessage = null
        )
    }

    fun onJobRoleChanged(roleName: String) {
        val role = JobRole.fromNameOrDisplay(roleName)
        _uiState.value = _uiState.value.copy(
            jobRole = role.displayName,
            dailyWage = role.defaultDailyWage.toInt().toString(),
            wageError = null
        )
    }

    fun nextStep() {
        val s = _uiState.value
        when (s.currentStep) {
            1 -> {
                // Validate Step 1
                if (s.fullName.isBlank() || s.dateOfBirth.isBlank() || s.phone.isBlank() ||
                    s.email.isBlank() || s.address.isBlank() || s.emergencyContactName.isBlank() ||
                    s.emergencyContactPhone.isBlank()
                ) {
                    _uiState.value = s.copy(errorMessage = "Please complete all personal and emergency contact fields.")
                    return
                }

                if (!ValidationUtils.isValidEmail(s.email)) {
                    _uiState.value = s.copy(
                        emailError = "Please enter a valid email address.",
                        errorMessage = "Invalid email address."
                    )
                    return
                }

                val phoneResult = ValidationUtils.validatePhone(s.phone)
                if (!phoneResult.isValid) {
                    _uiState.value = s.copy(
                        phoneError = phoneResult.errorMessage,
                        errorMessage = phoneResult.errorMessage
                    )
                    return
                }

                val emergencyResult = ValidationUtils.validatePhone(s.emergencyContactPhone)
                if (!emergencyResult.isValid) {
                    _uiState.value = s.copy(
                        emergencyPhoneError = emergencyResult.errorMessage,
                        errorMessage = "Emergency contact: ${emergencyResult.errorMessage}"
                    )
                    return
                }

                _uiState.value = s.copy(
                    currentStep = 2,
                    phone = phoneResult.normalizedNumber,
                    emergencyContactPhone = emergencyResult.normalizedNumber,
                    phoneError = null,
                    emergencyPhoneError = null,
                    emailError = null,
                    errorMessage = null
                )
            }
            2 -> {
                // Validate Step 2
                if (s.workerId.isBlank() || s.batchNumber.isBlank() || s.joiningDate.isBlank()) {
                    _uiState.value = s.copy(errorMessage = "Please enter Worker ID, Batch Number, and Joining Date.")
                    return
                }

                val wageResult = ValidationUtils.validateDailyWage(s.dailyWage)
                if (!wageResult.isValid) {
                    _uiState.value = s.copy(
                        wageError = wageResult.errorMessage,
                        errorMessage = wageResult.errorMessage
                    )
                    return
                }

                _uiState.value = s.copy(
                    currentStep = 3,
                    wageError = null,
                    errorMessage = null
                )
            }
        }
    }

    fun prevStep() {
        if (_uiState.value.currentStep > 1) {
            _uiState.value = _uiState.value.copy(
                currentStep = _uiState.value.currentStep - 1,
                errorMessage = null
            )
        }
    }

    fun submitRegistration() {
        val s = _uiState.value
        if (s.passwordPin.isBlank() || s.passwordPin.length < 6) {
            _uiState.value = s.copy(errorMessage = "PIN / Password must be at least 6 characters.")
            return
        }
        if (s.passwordPin != s.confirmPasswordPin) {
            _uiState.value = s.copy(errorMessage = "Passwords / PINs do not match.")
            return
        }
        if (!s.termsAccepted) {
            _uiState.value = s.copy(errorMessage = "Please accept the workforce verification terms and consent.")
            return
        }

        val wageParsed = CurrencyUtils.parseWage(s.dailyWage) ?: 600.0

        viewModelScope.launch {
            _uiState.value = s.copy(isLoading = true, errorMessage = null)
            val data = SubmittedData(
                fullName = s.fullName.trim(),
                dateOfBirth = s.dateOfBirth.trim(),
                phone = s.phone.trim(),
                email = s.email.trim(),
                address = s.address.trim(),
                emergencyContactName = s.emergencyContactName.trim(),
                emergencyContactPhone = s.emergencyContactPhone.trim(),
                workerId = s.workerId.trim(),
                batchNumber = s.batchNumber.trim(),
                jobRole = s.jobRole,
                siteId = s.siteId,
                joiningDate = s.joiningDate.trim(),
                dailyWage = wageParsed
            )

            when (val result = registrationRepository.submitWorkerRegistration(data, s.passwordPin)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isSubmittedSuccess = true
                    )
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = result.message
                    )
                }
                Resource.Loading -> Unit
            }
        }
    }

    fun dismissError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkerRegistrationScreen(
    viewModel: WorkerRegistrationViewModel,
    onNavigateBack: () -> Unit,
    onRegistrationFinished: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    var jobRoleExpanded by remember { mutableStateOf(false) }
    var siteExpanded by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            CivilTopAppBar(
                title = "Worker Registration",
                canNavigateBack = true,
                onNavigateBack = {
                    if (uiState.currentStep > 1) viewModel.prevStep() else onNavigateBack()
                }
            )
        },
        containerColor = ConcreteBackground
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp)
            ) {
                // Step Progress Indicator
                RegistrationStepIndicator(currentStep = uiState.currentStep)

                Spacer(modifier = Modifier.height(24.dp))

                when (uiState.currentStep) {
                    1 -> {
                        // Step 1: Personal Information
                        Text(
                            text = "Step 1: Personal Information",
                            style = MaterialTheme.typography.titleLarge,
                            color = ConstructionSlate,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Ensure details match your official civil government ID.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = ConstructionSteel,
                            modifier = Modifier.padding(bottom = 16.dp)
                        )

                        OutlinedTextField(
                            value = uiState.fullName,
                            onValueChange = { v -> viewModel.updateField { it.copy(fullName = v) } },
                            label = { Text("Full Legal Name *") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        Spacer(modifier = Modifier.height(14.dp))

                        OutlinedTextField(
                            value = uiState.dateOfBirth,
                            onValueChange = { v -> viewModel.updateField { it.copy(dateOfBirth = v) } },
                            label = { Text("Date of Birth *") },
                            placeholder = { Text("YYYY-MM-DD") },
                            leadingIcon = { Icon(Icons.Default.CalendarToday, contentDescription = null, tint = ConstructionSteel) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        Spacer(modifier = Modifier.height(14.dp))

                        // Dedicated full-width Indian Mobile Number Input with robust validation & prefix
                        OutlinedTextField(
                            value = uiState.phone,
                            onValueChange = viewModel::onPhoneChanged,
                            label = { Text("Mobile Phone Number *") },
                            placeholder = { Text("e.g. 9876543210 or +91 98765 43210") },
                            leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null, tint = ConstructionSteel) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            isError = uiState.phoneError != null,
                            supportingText = {
                                Text(
                                    text = uiState.phoneError ?: "Supported: 10-digit Indian national number or +91 prefix",
                                    color = if (uiState.phoneError != null) MaterialTheme.colorScheme.error else ConstructionSteel,
                                    fontSize = 11.sp
                                )
                            }
                        )
                        Spacer(modifier = Modifier.height(10.dp))

                        OutlinedTextField(
                            value = uiState.email,
                            onValueChange = { v -> viewModel.updateField { it.copy(email = v, emailError = null) } },
                            label = { Text("Email Address *") },
                            placeholder = { Text("worker@angelenterprises.com") },
                            leadingIcon = { Icon(Icons.Default.Email, contentDescription = null, tint = ConstructionSteel) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            isError = uiState.emailError != null,
                            supportingText = uiState.emailError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } }
                        )
                        Spacer(modifier = Modifier.height(14.dp))

                        OutlinedTextField(
                            value = uiState.address,
                            onValueChange = { v -> viewModel.updateField { it.copy(address = v) } },
                            label = { Text("Permanent Residential Address *") },
                            leadingIcon = { Icon(Icons.Default.Home, contentDescription = null, tint = ConstructionSteel) },
                            modifier = Modifier.fillMaxWidth(),
                            maxLines = 3
                        )
                        Spacer(modifier = Modifier.height(20.dp))

                        Text(
                            text = "Emergency Contact Details",
                            style = MaterialTheme.typography.titleMedium,
                            color = ConstructionSlate,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(10.dp))

                        OutlinedTextField(
                            value = uiState.emergencyContactName,
                            onValueChange = { v -> viewModel.updateField { it.copy(emergencyContactName = v) } },
                            label = { Text("Emergency Contact Person Name *") },
                            leadingIcon = { Icon(Icons.Default.Person, contentDescription = null, tint = ConstructionSteel) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        Spacer(modifier = Modifier.height(14.dp))

                        OutlinedTextField(
                            value = uiState.emergencyContactPhone,
                            onValueChange = viewModel::onEmergencyPhoneChanged,
                            label = { Text("Emergency Contact Phone *") },
                            placeholder = { Text("e.g. 9876543210") },
                            leadingIcon = { Icon(Icons.Default.ContactPhone, contentDescription = null, tint = ConstructionSteel) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            isError = uiState.emergencyPhoneError != null,
                            supportingText = {
                                Text(
                                    text = uiState.emergencyPhoneError ?: "10-digit Indian emergency contact phone number",
                                    color = if (uiState.emergencyPhoneError != null) MaterialTheme.colorScheme.error else ConstructionSteel,
                                    fontSize = 11.sp
                                )
                            }
                        )
                    }

                    2 -> {
                        // Step 2: Employment Information
                        Text(
                            text = "Step 2: Employment Information",
                            style = MaterialTheme.typography.titleLarge,
                            color = ConstructionSlate,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Enter your construction trade, wage rate, and assignment details.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = ConstructionSteel,
                            modifier = Modifier.padding(bottom = 16.dp)
                        )

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            OutlinedTextField(
                                value = uiState.workerId,
                                onValueChange = { v -> viewModel.updateField { it.copy(workerId = v) } },
                                label = { Text("Worker ID *") },
                                placeholder = { Text("e.g. W-1042") },
                                modifier = Modifier.weight(1f),
                                singleLine = true
                            )
                            OutlinedTextField(
                                value = uiState.batchNumber,
                                onValueChange = { v -> viewModel.updateField { it.copy(batchNumber = v) } },
                                label = { Text("Batch Number *") },
                                placeholder = { Text("e.g. BATCH-24A") },
                                modifier = Modifier.weight(1f),
                                singleLine = true
                            )
                        }
                        Spacer(modifier = Modifier.height(14.dp))

                        // Job Role Dropdown
                        ExposedDropdownMenuBox(
                            expanded = jobRoleExpanded,
                            onExpandedChange = { jobRoleExpanded = !jobRoleExpanded }
                        ) {
                            OutlinedTextField(
                                value = uiState.jobRole,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Job Role / Trade *") },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = jobRoleExpanded) },
                                modifier = Modifier.menuAnchor().fillMaxWidth()
                            )
                            ExposedDropdownMenu(
                                expanded = jobRoleExpanded,
                                onDismissRequest = { jobRoleExpanded = false }
                            ) {
                                JobRole.values().forEach { role ->
                                    DropdownMenuItem(
                                        text = {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                Text(role.displayName)
                                                Text(
                                                    text = CurrencyUtils.formatDailyWage(role.defaultDailyWage),
                                                    color = SafetyAmberDark,
                                                    fontSize = 12.sp
                                                )
                                            }
                                        },
                                        onClick = {
                                            viewModel.onJobRoleChanged(role.name)
                                            jobRoleExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(14.dp))

                        // Daily Wage Input in INR (₹)
                        val parsedWage = CurrencyUtils.parseWage(uiState.dailyWage) ?: 0.0
                        OutlinedTextField(
                            value = uiState.dailyWage,
                            onValueChange = { v -> viewModel.updateField { it.copy(dailyWage = v, wageError = null) } },
                            label = { Text("Daily Wage Rate (INR) *") },
                            prefix = { Text("${CurrencyUtils.INR_SYMBOL} ", fontWeight = FontWeight.Bold, color = ConstructionSlate) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            isError = uiState.wageError != null,
                            supportingText = {
                                val monthlyEst = if (parsedWage > 0) {
                                    CurrencyUtils.formatMonthlyEstimate(parsedWage)
                                } else "Enter standard daily rate (₹200 - ₹10,000)"
                                Text(
                                    text = uiState.wageError ?: "Estimated: $monthlyEst",
                                    color = if (uiState.wageError != null) MaterialTheme.colorScheme.error else ConstructionSteel,
                                    fontSize = 11.sp
                                )
                            }
                        )
                        Spacer(modifier = Modifier.height(14.dp))

                        // Construction Site Dropdown
                        val selectedSiteName = uiState.sites.find { it.siteId == uiState.siteId }?.siteName ?: "Main Civil Site A"
                        ExposedDropdownMenuBox(
                            expanded = siteExpanded,
                            onExpandedChange = { siteExpanded = !siteExpanded }
                        ) {
                            OutlinedTextField(
                                value = selectedSiteName,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Assigned Construction Site *") },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = siteExpanded) },
                                modifier = Modifier.menuAnchor().fillMaxWidth()
                            )
                            ExposedDropdownMenu(
                                expanded = siteExpanded,
                                onDismissRequest = { siteExpanded = false }
                            ) {
                                if (uiState.sites.isEmpty()) {
                                    DropdownMenuItem(
                                        text = { Text("Main Civil Site A (Default)") },
                                        onClick = {
                                            viewModel.updateField { it.copy(siteId = "SITE-DEFAULT-01") }
                                            siteExpanded = false
                                        }
                                    )
                                } else {
                                    uiState.sites.forEach { site ->
                                        DropdownMenuItem(
                                            text = { Text("${site.siteName} (${site.projectName})") },
                                            onClick = {
                                                viewModel.updateField { it.copy(siteId = site.siteId) }
                                                siteExpanded = false
                                            }
                                        )
                                    }
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(14.dp))

                        OutlinedTextField(
                            value = uiState.joiningDate,
                            onValueChange = { v -> viewModel.updateField { it.copy(joiningDate = v) } },
                            label = { Text("Joining Date *") },
                            placeholder = { Text("YYYY-MM-DD") },
                            leadingIcon = { Icon(Icons.Default.DateRange, contentDescription = null, tint = ConstructionSteel) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                    }

                    3 -> {
                        // Step 3: Account Security & Summary Review
                        Text(
                            text = "Step 3: Account Security",
                            style = MaterialTheme.typography.titleLarge,
                            color = ConstructionSlate,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Verify your employment summary and set your attendance PIN.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = ConstructionSteel,
                            modifier = Modifier.padding(bottom = 14.dp)
                        )

                        // Registration Summary Card
                        Card(
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
                            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    text = "Registration Overview",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = ConstructionSlate
                                )
                                HorizontalDivider(color = ConcreteBorder)
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Worker Name:", fontSize = 12.sp, color = ConstructionSteel)
                                    Text(uiState.fullName.ifBlank { "—" }, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = ConstructionSlate)
                                }
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Worker ID / Batch:", fontSize = 12.sp, color = ConstructionSteel)
                                    Text("${uiState.workerId} (${uiState.batchNumber})", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = ConstructionSlate)
                                }
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Mobile Number:", fontSize = 12.sp, color = ConstructionSteel)
                                    Text(ValidationUtils.formatPhoneDisplay(uiState.phone), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = ConstructionSlate)
                                }
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Trade / Role:", fontSize = 12.sp, color = ConstructionSteel)
                                    Text(uiState.jobRole, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = ConstructionSlate)
                                }
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Daily Wage Rate:", fontSize = 12.sp, color = ConstructionSteel)
                                    val w = CurrencyUtils.parseWage(uiState.dailyWage) ?: 0.0
                                    Text(CurrencyUtils.formatDailyWage(w), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SafetyAmberDark)
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(16.dp))

                        OutlinedTextField(
                            value = uiState.passwordPin,
                            onValueChange = { v -> viewModel.updateField { it.copy(passwordPin = v) } },
                            label = { Text("Password / PIN (min 6 chars) *") },
                            leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = ConstructionSteel) },
                            visualTransformation = PasswordVisualTransformation(),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedTextField(
                            value = uiState.confirmPasswordPin,
                            onValueChange = { v -> viewModel.updateField { it.copy(confirmPasswordPin = v) } },
                            label = { Text("Confirm Password / PIN *") },
                            leadingIcon = { Icon(Icons.Default.LockReset, contentDescription = null, tint = ConstructionSteel) },
                            visualTransformation = PasswordVisualTransformation(),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        Spacer(modifier = Modifier.height(16.dp))

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Checkbox(
                                checked = uiState.termsAccepted,
                                onCheckedChange = { checked ->
                                    viewModel.updateField { it.copy(termsAccepted = checked) }
                                }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "I certify all employment details are accurate and agree to workforce identity verification by ANGEL ENTERPRISES site management.",
                                style = MaterialTheme.typography.bodySmall,
                                color = ConstructionSteel
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(28.dp))

                // Navigation buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (uiState.currentStep > 1) {
                        OutlinedButton(
                            onClick = viewModel::prevStep,
                            modifier = Modifier.weight(1f).height(50.dp),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Previous", color = ConstructionSlate)
                        }
                    }

                    Button(
                        onClick = {
                            if (uiState.currentStep < 3) viewModel.nextStep() else viewModel.submitRegistration()
                        },
                        modifier = Modifier.weight(1f).height(50.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = SafetyAmber)
                    ) {
                        Text(
                            text = if (uiState.currentStep < 3) "Next Step" else "Submit Registration",
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }
            }

            LoadingOverlay(isLoading = uiState.isLoading)

            ErrorDialog(
                errorMessage = uiState.errorMessage,
                onDismiss = viewModel::dismissError
            )

            // Post-Submission Dialog
            if (uiState.isSubmittedSuccess) {
                AlertDialog(
                    onDismissRequest = onRegistrationFinished,
                    title = {
                        Text(
                            text = "Registration Submitted Successfully",
                            fontWeight = FontWeight.Bold,
                            color = ConstructionDark
                        )
                    },
                    text = {
                        Text(
                            text = "Your registration has been securely submitted. Your worker record is under review by ANGEL ENTERPRISES site administration. Your account status is PENDING. You will be able to log in once your profile is verified.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = ConstructionSlate
                        )
                    },
                    confirmButton = {
                        Button(
                            onClick = onRegistrationFinished,
                            colors = ButtonDefaults.buttonColors(containerColor = SafetyAmber)
                        ) {
                            Text("Back to Welcome", color = Color.White)
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
fun RegistrationStepIndicator(currentStep: Int) {
    val steps = listOf("Personal", "Employment", "Account")
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        steps.forEachIndexed { index, title ->
            val stepNumber = index + 1
            val isCompleted = currentStep > stepNumber
            val isCurrent = currentStep == stepNumber

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.weight(1f)
            ) {
                Surface(
                    shape = CircleShape,
                    color = when {
                        isCompleted -> StatusActiveGreen
                        isCurrent -> SafetyAmber
                        else -> ConcreteBorder
                    },
                    modifier = Modifier.size(34.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (isCompleted) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                        } else {
                            Text(
                                text = "$stepNumber",
                                color = if (isCurrent) Color.White else ConstructionSteel,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = title,
                    fontSize = 11.sp,
                    fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
                    color = if (isCurrent) ConstructionSlate else ConstructionSteel
                )
            }
        }
    }
}
