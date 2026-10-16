package com.civilworkforce.attendance.ui.screens.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
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
import com.civilworkforce.attendance.util.ValidationUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AdminLoginUiState(
    val email: String = "",
    val emailError: String? = null,
    val password: String = "",
    val passwordError: String? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isSuccess: Boolean = false,
    val showForgotPasswordDialog: Boolean = false,
    val resetEmailSuccessMessage: String? = null
)

class AdminLoginViewModel(private val authRepository: AuthRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(AdminLoginUiState())
    val uiState = _uiState.asStateFlow()

    fun onEmailChange(newEmail: String) {
        _uiState.value = _uiState.value.copy(
            email = newEmail,
            emailError = null,
            errorMessage = null
        )
    }

    fun onPasswordChange(newPassword: String) {
        _uiState.value = _uiState.value.copy(
            password = newPassword,
            passwordError = null,
            errorMessage = null
        )
    }

    fun toggleForgotPassword(show: Boolean) {
        _uiState.value = _uiState.value.copy(showForgotPasswordDialog = show)
    }

    fun sendPasswordReset(email: String) {
        if (!ValidationUtils.isValidEmail(email)) {
            _uiState.value = _uiState.value.copy(errorMessage = "Please enter a valid email address.")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val result = authRepository.sendPasswordReset(email)) {
                is Resource.Success -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        showForgotPasswordDialog = false,
                        resetEmailSuccessMessage = "Password reset instructions sent to $email."
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
        _uiState.value = _uiState.value.copy(errorMessage = null, resetEmailSuccessMessage = null)
    }

    fun login() {
        val state = _uiState.value
        val email = state.email.trim()
        val password = state.password.trim()

        var hasError = false
        var emailErr: String? = null
        var passErr: String? = null

        if (email.isBlank()) {
            emailErr = "Administrator email is required"
            hasError = true
        } else if (!ValidationUtils.isValidEmail(email)) {
            emailErr = "Please enter a valid email address"
            hasError = true
        }

        if (password.isBlank()) {
            passErr = "Password is required"
            hasError = true
        } else if (!ValidationUtils.isValidPassword(password)) {
            passErr = "Password must be at least 6 characters"
            hasError = true
        }

        if (hasError) {
            _uiState.value = state.copy(
                emailError = emailErr,
                passwordError = passErr
            )
            return
        }

        viewModelScope.launch {
            _uiState.value = state.copy(isLoading = true, errorMessage = null)
            when (val result = authRepository.loginAdmin(email, password)) {
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
fun AdminLoginScreen(
    viewModel: AdminLoginViewModel,
    onNavigateBack: () -> Unit,
    onLoginSuccess: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current
    var passwordVisible by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            onLoginSuccess()
        }
    }

    Scaffold(
        topBar = {
            CivilTopAppBar(
                title = "Admin Portal",
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
                    text = "Administrator Sign In",
                    style = MaterialTheme.typography.headlineMedium,
                    color = ConstructionSlate,
                    fontWeight = FontWeight.Bold
                )

                Text(
                    text = "Sign in with verified site administrator credentials.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = ConstructionSteel,
                    modifier = Modifier.padding(top = 4.dp, bottom = 28.dp)
                )

                OutlinedTextField(
                    value = uiState.email,
                    onValueChange = viewModel::onEmailChange,
                    label = { Text("Admin Email") },
                    leadingIcon = {
                        Icon(imageVector = Icons.Default.Email, contentDescription = null, tint = ConstructionSteel)
                    },
                    isError = uiState.emailError != null,
                    supportingText = uiState.emailError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next
                    ),
                    keyboardActions = KeyboardActions(
                        onNext = { focusManager.moveFocus(FocusDirection.Down) }
                    ),
                    shape = RoundedCornerShape(8.dp)
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = uiState.password,
                    onValueChange = viewModel::onPasswordChange,
                    label = { Text("Password") },
                    leadingIcon = {
                        Icon(imageVector = Icons.Default.Lock, contentDescription = null, tint = ConstructionSteel)
                    },
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(
                                imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (passwordVisible) "Hide password" else "Show password",
                                tint = ConstructionSteel
                            )
                        }
                    },
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    isError = uiState.passwordError != null,
                    supportingText = uiState.passwordError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } },
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
                    TextButton(onClick = { viewModel.toggleForgotPassword(true) }) {
                        Text(
                            text = "Forgot Password?",
                            color = SafetyAmberDark,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = {
                        focusManager.clearFocus()
                        viewModel.login()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ConstructionSlate)
                ) {
                    Text(
                        text = "Sign In as Admin",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }

            LoadingOverlay(isLoading = uiState.isLoading)

            ErrorDialog(
                errorMessage = uiState.errorMessage ?: uiState.resetEmailSuccessMessage,
                onDismiss = viewModel::dismissError
            )

            if (uiState.showForgotPasswordDialog) {
                var resetEmail by remember { mutableStateOf(uiState.email) }
                AlertDialog(
                    onDismissRequest = { viewModel.toggleForgotPassword(false) },
                    title = { Text("Reset Password", fontWeight = FontWeight.Bold) },
                    text = {
                        Column {
                            Text(
                                text = "Enter your administrator email. A secure reset link will be sent to you.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = ConstructionSteel
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            OutlinedTextField(
                                value = resetEmail,
                                onValueChange = { resetEmail = it },
                                label = { Text("Email Address") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    },
                    confirmButton = {
                        Button(
                            onClick = { viewModel.sendPasswordReset(resetEmail) },
                            colors = ButtonDefaults.buttonColors(containerColor = SafetyAmber)
                        ) {
                            Text("Send Reset Link", color = Color.White)
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { viewModel.toggleForgotPassword(false) }) {
                            Text("Cancel", color = ConstructionSteel)
                        }
                    },
                    shape = RoundedCornerShape(12.dp),
                    containerColor = Color.White
                )
            }
        }
    }
}
