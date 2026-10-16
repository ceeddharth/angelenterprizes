package com.civilworkforce.attendance.ui.screens.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.civilworkforce.attendance.data.AuthRepository
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.ui.components.CivilTopAppBar
import com.civilworkforce.attendance.ui.components.ErrorDialog
import com.civilworkforce.attendance.ui.components.LoadingOverlay
import com.civilworkforce.attendance.ui.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class WorkerLoginUiState(
    val identifier: String = "",
    val identifierError: String? = null,
    val pinOrPassword: String = "",
    val pinError: String? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isSuccess: Boolean = false,
    val showForgotDialog: Boolean = false,
    val phoneOtpReadyNotice: Boolean = false
)

class WorkerLoginViewModel(private val authRepository: AuthRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(WorkerLoginUiState())
    val uiState = _uiState.asStateFlow()

    fun onIdentifierChange(newVal: String) {
        _uiState.value = _uiState.value.copy(
            identifier = newVal,
            identifierError = null,
            errorMessage = null
        )
    }

    fun onPinChange(newVal: String) {
        _uiState.value = _uiState.value.copy(
            pinOrPassword = newVal,
            pinError = null,
            errorMessage = null
        )
    }

    fun toggleForgotDialog(show: Boolean) {
        _uiState.value = _uiState.value.copy(showForgotDialog = show)
    }

    fun dismissError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    fun login() {
        val state = _uiState.value
        val id = state.identifier.trim()
        val pin = state.pinOrPassword.trim()

        var hasError = false
        var idErr: String? = null
        var pinErr: String? = null

        if (id.isBlank()) {
            idErr = "Worker ID or registered phone number is required"
            hasError = true
        }

        if (pin.isBlank()) {
            pinErr = "Security PIN or password is required"
            hasError = true
        } else if (pin.length < 4) {
            pinErr = "PIN/Password must be at least 4 digits"
            hasError = true
        }

        if (hasError) {
            _uiState.value = state.copy(identifierError = idErr, pinError = pinErr)
            return
        }

        viewModelScope.launch {
            _uiState.value = state.copy(isLoading = true, errorMessage = null)
            when (val result = authRepository.loginWorker(id, pin)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, isSuccess = true)
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
}

@Composable
fun WorkerLoginScreen(
    viewModel: WorkerLoginViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToRegistration: () -> Unit,
    onLoginSuccess: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current
    var pinVisible by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            onLoginSuccess()
        }
    }

    Scaffold(
        topBar = {
            CivilTopAppBar(
                title = "Worker Sign In",
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
                    .padding(24.dp),
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    text = "ANGEL ENTERPRISES",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = SafetyAmberDark,
                    letterSpacing = 0.5.sp
                )

                Text(
                    text = "Worker Access",
                    style = MaterialTheme.typography.headlineMedium,
                    color = ConstructionSlate,
                    fontWeight = FontWeight.Bold
                )

                Text(
                    text = "Enter your assigned Worker ID or registered phone number.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = ConstructionSteel,
                    modifier = Modifier.padding(top = 4.dp, bottom = 24.dp)
                )

                OutlinedTextField(
                    value = uiState.identifier,
                    onValueChange = viewModel::onIdentifierChange,
                    label = { Text("Worker ID or Mobile Number") },
                    placeholder = { Text("e.g. W-1024 or 9876543210 / +91...") },
                    leadingIcon = {
                        Icon(imageVector = Icons.Default.Badge, contentDescription = null, tint = ConstructionSteel)
                    },
                    isError = uiState.identifierError != null,
                    supportingText = {
                        Text(
                            text = uiState.identifierError ?: "Enter Worker ID or 10-digit mobile number (+91 supported)",
                            color = if (uiState.identifierError != null) MaterialTheme.colorScheme.error else ConstructionSteel,
                            fontSize = 11.sp
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Text,
                        imeAction = ImeAction.Next
                    ),
                    keyboardActions = KeyboardActions(
                        onNext = { focusManager.moveFocus(FocusDirection.Down) }
                    ),
                    shape = RoundedCornerShape(8.dp)
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = uiState.pinOrPassword,
                    onValueChange = viewModel::onPinChange,
                    label = { Text("PIN / Password") },
                    leadingIcon = {
                        Icon(imageVector = Icons.Default.Lock, contentDescription = null, tint = ConstructionSteel)
                    },
                    trailingIcon = {
                        IconButton(onClick = { pinVisible = !pinVisible }) {
                            Icon(
                                imageVector = if (pinVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (pinVisible) "Hide PIN" else "Show PIN",
                                tint = ConstructionSteel
                            )
                        }
                    },
                    visualTransformation = if (pinVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    isError = uiState.pinError != null,
                    supportingText = uiState.pinError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            focusManager.clearFocus()
                            viewModel.login()
                        }
                    ),
                    shape = RoundedCornerShape(8.dp)
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = { viewModel.toggleForgotDialog(true) }) {
                        Text(
                            text = "Forgot PIN / Password?",
                            color = SafetyAmberDark,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                Button(
                    onClick = {
                        focusManager.clearFocus()
                        viewModel.login()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = SafetyAmber)
                ) {
                    Text(
                        text = "Sign In",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                HorizontalDivider(color = ConcreteBorder)

                Spacer(modifier = Modifier.height(24.dp))

                OutlinedButton(
                    onClick = onNavigateToRegistration,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(containerColor = ConcreteSurface),
                    border = ButtonDefaults.outlinedButtonBorder.copy(
                        brush = androidx.compose.ui.graphics.SolidColor(ConstructionSlate),
                        width = 1.5.dp
                    )
                ) {
                    Text(
                        text = "First-Time Registration",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = ConstructionSlate
                    )
                }
            }

            LoadingOverlay(isLoading = uiState.isLoading)

            ErrorDialog(
                errorMessage = uiState.errorMessage,
                onDismiss = viewModel::dismissError
            )

            if (uiState.showForgotDialog) {
                AlertDialog(
                    onDismissRequest = { viewModel.toggleForgotDialog(false) },
                    title = { Text("Worker Credential Support", fontWeight = FontWeight.Bold) },
                    text = {
                        Text(
                            text = "For security and site authorization, worker PIN resets are handled by ANGEL ENTERPRISES Site Supervisors or HR Administrators. Please report to the site office with your Worker ID.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = ConstructionSteel
                        )
                    },
                    confirmButton = {
                        Button(
                            onClick = { viewModel.toggleForgotDialog(false) },
                            colors = ButtonDefaults.buttonColors(containerColor = ConstructionSlate)
                        ) {
                            Text("Understood", color = Color.White)
                        }
                    },
                    shape = RoundedCornerShape(12.dp),
                    containerColor = Color.White
                )
            }
        }
    }
}
