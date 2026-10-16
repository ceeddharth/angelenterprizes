package com.civilworkforce.attendance.ui.screens.attendance

import android.Manifest
import android.content.pm.PackageManager
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.civilworkforce.attendance.data.AttendanceRepository
import com.civilworkforce.attendance.model.QrPayload
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.ui.theme.SafetyAmber
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.Executors

@Composable
fun WorkerQrScannerScreen(
    attendanceRepository: AttendanceRepository,
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    var isProcessingScan by remember { mutableStateOf(false) }
    var scanSuccessMessage by remember { mutableStateOf<String?>(null) }
    var scanErrorMessage by remember { mutableStateOf<String?>(null) }
    var lastScannedToken by remember { mutableStateOf<String?>(null) }

    // Dialog for manual payload entry if camera is unavailable/denied
    var showManualDialog by remember { mutableStateOf(false) }
    var manualPayloadInput by remember { mutableStateOf("") }

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
                        Text("Scan Site Attendance QR", fontWeight = FontWeight.Bold)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (hasCameraPermission) {
                // Live CameraX Preview + ML Kit Analyzer
                AndroidView(
                    factory = { ctx ->
                        val previewView = PreviewView(ctx)
                        val cameraExecutor = Executors.newSingleThreadExecutor()
                        val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)

                        cameraProviderFuture.addListener({
                            val cameraProvider = cameraProviderFuture.get()
                            val preview = Preview.Builder().build().also {
                                it.setSurfaceProvider(previewView.surfaceProvider)
                            }

                            val barcodeScanner = BarcodeScanning.getClient()

                            val imageAnalysis = ImageAnalysis.Builder()
                                .setTargetResolution(Size(1280, 720))
                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                .build()

                            imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
                                @OptIn(ExperimentalGetImage::class)
                                val mediaImage = imageProxy.image
                                if (mediaImage != null && !isProcessingScan) {
                                    val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                                    barcodeScanner.process(image)
                                        .addOnSuccessListener { barcodes ->
                                            for (barcode in barcodes) {
                                                val rawValue = barcode.rawValue
                                                if (!rawValue.isNullOrBlank() && rawValue != lastScannedToken) {
                                                    try {
                                                        val json = JSONObject(rawValue)
                                                        if (json.has("siteId") && json.has("token")) {
                                                            val payload = QrPayload(
                                                                siteId = json.getString("siteId"),
                                                                sessionId = json.optString("sessionId", "QRSESS_SITE"),
                                                                token = json.getString("token")
                                                            )
                                                            lastScannedToken = rawValue
                                                            isProcessingScan = true

                                                            scope.launch {
                                                                val res = attendanceRepository.recordOrQueueAttendance(payload)
                                                                when (res) {
                                                                    is Resource.Success -> {
                                                                        val (actionType, record) = res.data
                                                                        scanSuccessMessage = when (actionType) {
                                                                            "QUEUED" -> "Attendance Queued Locally (Offline)\n\nStored securely on this device. Will automatically sync with the server once connectivity is restored."
                                                                            "CHECK_IN" -> "Check-In Recorded Successfully for Site ${record.siteId}!"
                                                                            else -> "Check-Out Recorded Successfully! Shift Completed."
                                                                        }
                                                                    }
                                                                    is Resource.Error -> {
                                                                        scanErrorMessage = res.message
                                                                    }
                                                                    is Resource.Loading -> {}
                                                                }
                                                                isProcessingScan = false
                                                            }
                                                            break
                                                        }
                                                    } catch (e: Exception) {
                                                        // Not a valid attendance JSON QR
                                                    }
                                                }
                                            }
                                        }
                                        .addOnCompleteListener {
                                            imageProxy.close()
                                        }
                                } else {
                                    imageProxy.close()
                                }
                            }

                            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
                            try {
                                cameraProvider.unbindAll()
                                cameraProvider.bindToLifecycle(
                                    lifecycleOwner,
                                    cameraSelector,
                                    preview,
                                    imageAnalysis
                                )
                            } catch (exc: Exception) {
                                // Camera binding failed
                            }
                        }, ContextCompat.getMainExecutor(ctx))

                        previewView
                    },
                    modifier = Modifier.fillMaxSize()
                )

                // Scanner Target Frame Overlay
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(260.dp)
                            .border(3.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(16.dp))
                            .background(Color.Transparent)
                    )
                }
            } else {
                // Permission Denied View
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        Icons.Default.QrCodeScanner,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "Camera Access Required",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Camera permission is required to scan the rotating 30-second site attendance QR code.",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) {
                        Text("Grant Camera Permission")
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedButton(onClick = { showManualDialog = true }) {
                        Text("Enter QR Payload Manually")
                    }
                }
            }

            // Bottom Information Card
            Card(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f)
                ),
                elevation = CardDefaults.cardElevation(8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        "Point camera at Site Supervisor's live QR Code",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Codes rotate every 30 seconds to guarantee physical presence.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                        textAlign = TextAlign.Center
                    )

                    if (isProcessingScan) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Validating token on server...", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }

    // Success Dialog
    scanSuccessMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = {
                scanSuccessMessage = null
                onNavigateBack()
            },
            icon = { Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32)) },
            title = { Text("Attendance Confirmed", fontWeight = FontWeight.Bold) },
            text = { Text(msg) },
            confirmButton = {
                Button(onClick = {
                    scanSuccessMessage = null
                    onNavigateBack()
                }) {
                    Text("Return to Dashboard")
                }
            }
        )
    }

    // Error Dialog
    scanErrorMessage?.let { err ->
        AlertDialog(
            onDismissRequest = { scanErrorMessage = null },
            icon = { Icon(Icons.Default.Error, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
            title = { Text("Attendance Error", fontWeight = FontWeight.Bold) },
            text = { Text(err) },
            confirmButton = {
                Button(onClick = { scanErrorMessage = null }) {
                    Text("Try Again")
                }
            }
        )
    }

    // Manual Entry Dialog (Support for test setups or permission fallback)
    if (showManualDialog) {
        AlertDialog(
            onDismissRequest = { showManualDialog = false },
            title = { Text("Manual QR Payload Entry") },
            text = {
                Column {
                    Text(
                        "Paste the raw JSON payload displayed on the site kiosk:",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = manualPayloadInput,
                        onValueChange = { manualPayloadInput = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("{\"siteId\":\"...\",\"token\":\"...\"}") },
                        minLines = 3
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        try {
                            val json = JSONObject(manualPayloadInput)
                            val payload = QrPayload(
                                siteId = json.getString("siteId"),
                                sessionId = json.optString("sessionId", "QRSESS_MANUAL"),
                                token = json.getString("token")
                            )
                            showManualDialog = false
                            isProcessingScan = true
                            scope.launch {
                                val res = attendanceRepository.recordAttendance(payload)
                                when (res) {
                                    is Resource.Success -> {
                                        val (type, record) = res.data
                                        scanSuccessMessage = if (type == "CHECK_IN") {
                                            "Check-In Recorded Successfully for Site ${record.siteId}!"
                                        } else {
                                            "Check-Out Recorded Successfully! Shift Completed."
                                        }
                                    }
                                    is Resource.Error -> {
                                        scanErrorMessage = res.message
                                    }
                                    is Resource.Loading -> {}
                                }
                                isProcessingScan = false
                            }
                        } catch (e: Exception) {
                            scanErrorMessage = "Invalid QR JSON payload: ${e.message}"
                        }
                    }
                ) {
                    Text("Submit")
                }
            },
            dismissButton = {
                TextButton(onClick = { showManualDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}
