package com.civilworkforce.attendance.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.civilworkforce.attendance.model.RegistrationStatus
import com.civilworkforce.attendance.model.UserStatus
import com.civilworkforce.attendance.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CivilTopAppBar(
    title: String,
    subtitle: String? = "ANGEL ENTERPRISES",
    canNavigateBack: Boolean = false,
    onNavigateBack: () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {}
) {
    TopAppBar(
        title = {
            Column {
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        fontSize = 11.sp,
                        color = SafetyAmber,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )
                }
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            }
        },
        navigationIcon = {
            if (canNavigateBack) {
                IconButton(onClick = onNavigateBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Color.White
                    )
                }
            }
        },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = ConstructionSlate
        )
    )
}

@Composable
fun StatusBadge(status: String) {
    val (bgColor, textColor) = when (status.uppercase()) {
        UserStatus.ACTIVE.name -> Pair(Color(0xFFDCFCE7), StatusActiveGreen)
        UserStatus.PENDING.name, RegistrationStatus.PENDING.name -> Pair(Color(0xFFFEF3C7), StatusPendingAmber)
        UserStatus.SUSPENDED.name, RegistrationStatus.SUSPENDED.name -> Pair(Color(0xFFFEE2E2), StatusSuspendedRed)
        UserStatus.REJECTED.name, RegistrationStatus.REJECTED.name -> Pair(Color(0xFFFEE2E2), StatusRejectedRed)
        else -> Pair(Color(0xFFF1F5F9), ConstructionSteel)
    }

    Surface(
        color = bgColor,
        shape = RoundedCornerShape(6.dp)
    ) {
        Text(
            text = status.uppercase(),
            color = textColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
fun EmptyStateView(
    message: String = "No data available yet",
    icon: ImageVector? = null,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color.LightGray,
                modifier = Modifier.size(48.dp)
            )
            Spacer(modifier = Modifier.height(12.dp))
        }
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = ConstructionSteel
        )
    }
}

@Composable
fun LoadingOverlay(isLoading: Boolean) {
    if (isLoading) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.35f)),
            contentAlignment = Alignment.Center
        ) {
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    CircularProgressIndicator(color = SafetyAmber)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Communicating with secure server...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = ConstructionSlate
                    )
                }
            }
        }
    }
}

@Composable
fun ErrorDialog(
    errorMessage: String?,
    onDismiss: () -> Unit
) {
    if (!errorMessage.isNullOrBlank()) {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = {
                Text(
                    text = "Notice",
                    fontWeight = FontWeight.Bold,
                    color = ConstructionDark
                )
            },
            text = {
                Text(
                    text = errorMessage,
                    style = MaterialTheme.typography.bodyMedium,
                    color = ConstructionSlate
                )
            },
            confirmButton = {
                Button(
                    onClick = onDismiss,
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
