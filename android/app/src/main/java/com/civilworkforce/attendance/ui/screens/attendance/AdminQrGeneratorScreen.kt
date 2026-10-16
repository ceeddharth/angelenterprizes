package com.civilworkforce.attendance.ui.screens.attendance

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.civilworkforce.attendance.data.AttendanceRepository
import com.civilworkforce.attendance.data.FirebaseConstants
import com.civilworkforce.attendance.model.ActiveQrSession
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.model.Site
import com.civilworkforce.attendance.ui.theme.SafetyAmber
import com.civilworkforce.attendance.util.QrCodeGenerator
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminQrGeneratorScreen(
    sites: List<Site>,
    attendanceRepository: AttendanceRepository,
    onNavigateBack: () -> Unit
) {
    var selectedSiteId by remember {
        mutableStateOf(sites.firstOrNull()?.siteId ?: "SITE-101")
    }

    var serverBaseUrl by remember {
        mutableStateOf(FirebaseConstants.DEFAULT_BACKEND_URL)
    }

    var activeSession by remember { mutableStateOf<ActiveQrSession?>(null) }
    var qrBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var qrRawJson by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var secondsRemaining by remember { mutableIntStateOf(30) }

    suspend fun refreshQrToken() {
        isLoading = true
        errorMessage = null
        val res = attendanceRepository.fetchActiveQrSessionFromServer(serverBaseUrl, selectedSiteId)
        when (res) {
            is Resource.Success -> {
                val session = res.data
                activeSession = session

                // Create JSON payload for scanner
                val json = JSONObject().apply {
                    put("siteId", session.siteId)
                    put("sessionId", session.sessionId)
                    put("token", session.token)
                }
                val rawJson = json.toString()
                qrRawJson = rawJson
                qrBitmap = QrCodeGenerator.generateQrBitmap(rawJson, 600)

                // Calculate remaining seconds in current 30s window
                val nowSec = System.currentTimeMillis() / 1000
                val expSec = session.expiresAt?.seconds ?: (nowSec + 30)
                secondsRemaining = (expSec - nowSec).coerceIn(1, 30).toInt()
            }
            is Resource.Error -> {
                errorMessage = res.message
            }
            is Resource.Loading -> {}
        }
        isLoading = false
    }

    // Auto-refresh loop: countdown every second; fetch new token when expired
    LaunchedEffect(selectedSiteId, serverBaseUrl) {
        refreshQrToken()
        while (isActive) {
            delay(1000)
            if (secondsRemaining > 1) {
                secondsRemaining -= 1
            } else {
                refreshQrToken()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "ANGEL ENTERPRISES",
                            fontSize = 11.sp,
                            color = SafetyAmber,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp
                        )
                        Text("Site Attendance Kiosk", fontWeight = FontWeight.Bold)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            // Manual Refresh
                            isLoading = true
                        }
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Site Selector & Base URL configuration
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Select Site for Live Kiosk", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .androidx.compose.foundation.horizontalScroll(androidx.compose.foundation.rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        sites.forEach { site ->
                            FilterChip(
                                selected = selectedSiteId == site.siteId,
                                onClick = { selectedSiteId = site.siteId },
                                label = { Text(site.siteId) }
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = serverBaseUrl,
                        onValueChange = { serverBaseUrl = it },
                        label = { Text("Trusted Server API Base URL") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        supportingText = {
                            Text("Default: ${FirebaseConstants.DEFAULT_BACKEND_URL}")
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Error banner if server not reachable
            AnimatedVisibility(visible = errorMessage != null) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            errorMessage ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Rotating QR Code Display
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(4.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        "Site: $selectedSiteId",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "Point worker scanner at this code",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.outline
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    Box(
                        modifier = Modifier
                            .size(280.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color.White)
                            .padding(16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        if (qrBitmap != null) {
                            Image(
                                bitmap = qrBitmap!!.asImageBitmap(),
                                contentDescription = "Active Attendance QR",
                                modifier = Modifier.fillMaxSize()
                            )
                        } else if (isLoading) {
                            CircularProgressIndicator()
                        } else {
                            Text("Connecting to server...", color = Color.Gray, textAlign = TextAlign.Center)
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // 30s Countdown timer & indicator
                    LinearProgressIndicator(
                        progress = { secondsRemaining / 30f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp)),
                        color = if (secondsRemaining <= 5) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        "Rotating in $secondsRemaining seconds",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = if (secondsRemaining <= 5) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Token details
                    activeSession?.let { sess ->
                        Text(
                            "Session ID: ${sess.sessionId}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                        Text(
                            "HMAC-SHA256 Token: ${sess.token.take(16)}...",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                }
            }
        }
    }
}
