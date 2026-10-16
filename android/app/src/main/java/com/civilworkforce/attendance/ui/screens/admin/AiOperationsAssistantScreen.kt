package com.civilworkforce.attendance.ui.screens.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.civilworkforce.attendance.data.AiOperationsRepository
import com.civilworkforce.attendance.model.*
import com.civilworkforce.attendance.ui.components.CivilTopAppBar
import com.civilworkforce.attendance.ui.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class AiTab(val displayName: String) {
    BRIEF("1. Brief"),
    RISKS("2. Risks"),
    ACTIONS("3. Actions")
}

data class AiOperationsUiState(
    val insights: AiOperationsInsights = AiOperationsInsights(),
    val activeTab: AiTab = AiTab.BRIEF,
    val completedActions: Set<String> = emptySet(),
    val isLoading: Boolean = false,
    val isSyncing: Boolean = false,
    val isInitialLoadDone: Boolean = false,
    val errorMessage: String? = null,
    val syncSuccessMessage: String? = null
)

class AiOperationsViewModel(
    private val repository: AiOperationsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AiOperationsUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadInsights(forceRefresh = false)
    }

    fun loadInsights(forceRefresh: Boolean = false) {
        viewModelScope.launch {
            if (!_uiState.value.isInitialLoadDone && !forceRefresh) {
                _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            } else {
                _uiState.value = _uiState.value.copy(isSyncing = true, errorMessage = null, syncSuccessMessage = null)
            }

            when (val res = repository.getLiveOperationsInsights(forceRefresh)) {
                is Resource.Success -> {
                    val syncSucceeded = forceRefresh && res.data.brief.attendanceDataAvailable
                    _uiState.value = _uiState.value.copy(
                        insights = res.data,
                        isLoading = false,
                        isSyncing = false,
                        isInitialLoadDone = true,
                        errorMessage = null,
                        syncSuccessMessage = if (syncSucceeded) "Live data synced from Firestore" else null
                    )
                    if (syncSucceeded) {
                        kotlinx.coroutines.delay(4000)
                        _uiState.value = _uiState.value.copy(syncSuccessMessage = null)
                    }
                }
                is Resource.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isSyncing = false,
                        isInitialLoadDone = true,
                        errorMessage = res.message ?: "Failed to synchronize operational records",
                        syncSuccessMessage = null
                    )
                }
                is Resource.Loading -> {
                    // Handled above
                }
            }
        }
    }

    fun selectTab(tab: AiTab) {
        _uiState.value = _uiState.value.copy(activeTab = tab)
    }

    fun toggleAction(actionId: String) {
        val current = _uiState.value.completedActions.toMutableSet()
        if (current.contains(actionId)) {
            current.remove(actionId)
        } else {
            current.add(actionId)
        }
        _uiState.value = _uiState.value.copy(completedActions = current)
    }
}

@Composable
fun AiOperationsAssistantScreen(
    viewModel: AiOperationsViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToRoute: (String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            CivilTopAppBar(
                title = "AI Operations Assistant",
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                actions = {
                    IconButton(
                        onClick = { viewModel.loadInsights(forceRefresh = true) },
                        enabled = !uiState.isLoading && !uiState.isSyncing
                    ) {
                        if (uiState.isSyncing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(Icons.Default.Sync, contentDescription = "Sync Live", tint = Color.White)
                        }
                    }
                }
            )
        },
        containerColor = ConcreteBackground
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Header Bar with Phase 8 Badge
            Surface(
                color = ConstructionDark,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = SafetyAmber,
                            modifier = Modifier.padding(end = 4.dp)
                        ) {
                            Text(
                                text = "PHASE 8",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Black,
                                fontFamily = FontFamily.Monospace,
                                color = ConstructionDark,
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                            )
                        }
                        Text(
                            text = "Managerial Intelligence",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }

                    Text(
                        text = "Read-Only Grounded",
                        fontSize = 10.sp,
                        color = Color.LightGray
                    )
                }
            }

            // Strict Read-Only Guard Warning
            Surface(
                color = Color(0xFFFEF3C7),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        Icons.Default.Shield,
                        contentDescription = "Advisory Shield",
                        tint = SafetyAmberDark,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Advisory Only: AI cannot alter attendance, approve overtime/leave, modify wages, or write to Firestore records.",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF78350F),
                        lineHeight = 14.sp
                    )
                }
            }

            // Sync notice if present
            uiState.syncSuccessMessage?.let { msg ->
                Surface(
                    color = Color(0xFFDCFCE7),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = StatusActiveGreen, modifier = Modifier.size(14.dp))
                        Text(text = msg, fontSize = 11.sp, color = Color(0xFF166534), fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            // Tabs Selector
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF1F5F9))
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                AiTab.values().forEach { tab ->
                    val isSelected = uiState.activeTab == tab
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (isSelected) ConstructionDark else Color.Transparent,
                        border = if (isSelected) null else androidx.compose.foundation.BorderStroke(1.dp, ConcreteBorder),
                        modifier = Modifier.clickable { viewModel.selectTab(tab) }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = tab.displayName,
                                fontSize = 12.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                color = if (isSelected) SafetyAmber else ConstructionSteel
                            )

                            // Badge counts
                            if (tab == AiTab.RISKS && uiState.insights.alerts.any { it.severity == "HIGH" || it.severity == "CRITICAL" }) {
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .background(AlertRed, RoundedCornerShape(3.dp))
                                />
                            }
                            if (tab == AiTab.ACTIONS && uiState.insights.actions.isNotEmpty()) {
                                Surface(
                                    shape = RoundedCornerShape(4.dp),
                                    color = if (isSelected) SafetyAmber else Color(0xFFE2E8F0)
                                ) {
                                    Text(
                                        text = uiState.insights.actions.size.toString(),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isSelected) ConstructionDark else ConstructionSteel,
                                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Main Content Area
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                when {
                    uiState.isLoading -> {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(32.dp),
                            horizontalAlignment = Alignment.CenterVertically,
                            verticalArrangement = Arrangement.Center
                        ) {
                            CircularProgressIndicator(color = SafetyAmber)
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = "Grounding AI Operations Assistant",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = ConstructionSlate
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Aggregating live civil workforce rosters, site allocations, and shift records from Firestore...",
                                fontSize = 12.sp,
                                color = Color.Gray,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }

                    uiState.errorMessage != null && uiState.insights.brief.totalWorkers == 0 -> {
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2)),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFECACA)),
                            modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(20.dp),
                                horizontalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = AlertRed, modifier = Modifier.size(36.dp))
                                Spacer(modifier = Modifier.height(12.dp))
                                Text(
                                    text = "Failed to Retrieve Operational Data",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF991B1B)
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = uiState.errorMessage ?: "Unknown error",
                                    fontSize = 12.sp,
                                    color = Color(0xFFB91C1C),
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Button(
                                    onClick = { viewModel.loadInsights(forceRefresh = true) },
                                    colors = ButtonDefaults.buttonColors(containerColor = AlertRed)
                                ) {
                                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Retry Live Sync", fontSize = 12.sp)
                                }
                            }
                        }
                    }

                    else -> {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            // Non-blocking sync error banner if data was already cached
                            if (uiState.errorMessage != null) {
                                item {
                                    Surface(
                                        color = Color(0xFFFEF2F2),
                                        shape = RoundedCornerShape(8.dp),
                                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFCA5A5)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                text = "Sync notice: ${uiState.errorMessage}",
                                                fontSize = 11.sp,
                                                color = Color(0xFF991B1B),
                                                modifier = Modifier.weight(1f)
                                            )
                                            TextButton(onClick = { viewModel.loadInsights(forceRefresh = true) }) {
                                                Text("Retry", fontSize = 11.sp, color = AlertRed, fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    }
                                }
                            }

                            // Content per active tab
                            when (uiState.activeTab) {
                                AiTab.BRIEF -> {
                                    item {
                                        BriefTabContent(
                                            brief = uiState.insights.brief,
                                            isInsufficientData = uiState.insights.isInsufficientData,
                                            onGoToActions = { viewModel.selectTab(AiTab.ACTIONS) }
                                        )
                                    }
                                }
                                AiTab.RISKS -> {
                                    if (uiState.insights.alerts.isEmpty()) {
                                        item {
                                            Card(
                                                shape = RoundedCornerShape(10.dp),
                                                colors = CardDefaults.cardColors(containerColor = Color(0xFFECFDF5)),
                                                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFA7F3D0)),
                                                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)
                                            ) {
                                                Column(
                                                    modifier = Modifier.padding(20.dp),
                                                    horizontalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = StatusActiveGreen, modifier = Modifier.size(32.dp))
                                                    Spacer(modifier = Modifier.height(8.dp))
                                                    Text("All Project Sites Nominal", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color(0xFF065F46))
                                                    Spacer(modifier = Modifier.height(4.dp))
                                                    Text(
                                                        "Zero critical risk flags, understaffed sites, or anomalous activities detected.",
                                                        fontSize = 11.sp,
                                                        color = Color(0xFF047857),
                                                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                                    )
                                                }
                                            }
                                        }
                                    } else {
                                        items(uiState.insights.alerts) { alert ->
                                            RiskAlertCard(alert = alert)
                                        }
                                    }
                                }
                                AiTab.ACTIONS -> {
                                    if (uiState.insights.actions.isEmpty()) {
                                        item {
                                            Surface(
                                                color = Color(0xFFF8FAFC),
                                                shape = RoundedCornerShape(8.dp),
                                                border = androidx.compose.foundation.BorderStroke(1.dp, ConcreteBorder),
                                                modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp)
                                            ) {
                                                Box(modifier = Modifier.padding(20.dp), contentAlignment = Alignment.Center) {
                                                    Text("No immediate daily actions pending. All rosters and records clear.", fontSize = 12.sp, color = Color.Gray)
                                                }
                                            }
                                        }
                                    } else {
                                        items(uiState.insights.actions) { action ->
                                            ActionItemCard(
                                                action = action,
                                                isCompleted = uiState.completedActions.contains(action.id),
                                                onToggle = { viewModel.toggleAction(action.id) },
                                                onNavigate = { action.linkScreen?.let(onNavigateToRoute) }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BriefTabContent(
    brief: AiWorkforceBrief,
    isInsufficientData: Boolean,
    onGoToActions: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // Zero Records Warning Card if Database has Insufficient Records
        if (isInsufficientData || (brief.totalWorkers == 0 && brief.totalSites == 0)) {
            Card(
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                border = androidx.compose.foundation.BorderStroke(1.dp, ConcreteBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = "Empty Data Info",
                        tint = ConstructionSteel,
                        modifier = Modifier.size(18.dp)
                    )
                    Column {
                        Text(
                            text = "Zero Operational Records Found for Period",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = ConstructionSlate
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "Live Firestore queries confirmed zero registered workers or site records. Grounded operational intelligence requires registered workforce.",
                            fontSize = 11.sp,
                            color = Color.Gray,
                            lineHeight = 15.sp
                        )
                    }
                }
            }
        }

        // Operational Synthesis Card
        Card(
            shape = RoundedCornerShape(10.dp),
            colors = CardDefaults.cardColors(containerColor = ConcreteSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "OPERATIONAL SYNTHESIS",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = ConstructionSteel,
                        fontFamily = FontFamily.Monospace
                    )
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFFECFDF5),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFA7F3D0))
                    ) {
                        Text(
                            text = brief.staffingStatus,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = StatusActiveGreen,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = brief.todayHeadline,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = ConstructionSlate
                )

                Spacer(modifier = Modifier.height(10.dp))
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFF8FAFC),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF1F5F9)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = brief.summary,
                        fontSize = 12.sp,
                        color = ConstructionSteel,
                        lineHeight = 17.sp,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }
        }

        // Live Grounded Metrics Grid
        Text(
            text = "Grounded Database Metrics",
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = ConstructionSlate
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            MetricBox(
                title = "REGISTERED",
                value = brief.totalWorkers.toString(),
                subtitle = "Total roster",
                modifier = Modifier.weight(1f),
                bgColor = Color(0xFFEEF2FF),
                valueColor = Color(0xFF3730A3)
            )
            MetricBox(
                title = "ACTIVE",
                value = brief.totalActiveWorkers.toString(),
                subtitle = "Deployable",
                modifier = Modifier.weight(1f),
                bgColor = Color(0xFFECFDF5),
                valueColor = StatusActiveGreen
            )
            MetricBox(
                title = "UNASSIGNED",
                value = brief.unassignedWorkers.toString(),
                subtitle = "No site assigned",
                modifier = Modifier.weight(1f),
                bgColor = Color(0xFFFEF3C7),
                valueColor = SafetyAmberDark
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            MetricBox(
                title = "PRESENT TODAY",
                value = if (brief.attendanceDataAvailable && brief.presentToday != null) {
                    brief.presentToday.toString()
                } else {
                    "Unavailable"
                },
                subtitle = if (brief.attendanceDataAvailable && brief.presentToday != null) {
                    "On-site shifts"
                } else {
                    "Data unavailable"
                },
                modifier = Modifier.weight(1f),
                bgColor = if (brief.attendanceDataAvailable && brief.presentToday != null) Color(0xFFE0F2FE) else Color(0xFFF1F5F9),
                valueColor = if (brief.attendanceDataAvailable && brief.presentToday != null) Color(0xFF0369A1) else Color(0xFF64748B)
            )
            MetricBox(
                title = "ACTIVE SITES",
                value = "${brief.activeSites} / ${brief.totalSites}",
                subtitle = "Operational",
                modifier = Modifier.weight(1f),
                bgColor = Color(0xFFF1F5F9),
                valueColor = ConstructionSlate
            )
            MetricBox(
                title = "PENDING REG.",
                value = brief.pendingRegistrations.toString(),
                subtitle = "Awaiting review",
                modifier = Modifier.weight(1f),
                bgColor = Color(0xFFFEE2E2),
                valueColor = AlertRed
            )
        }

        Spacer(modifier = Modifier.height(4.dp))
        Button(
            onClick = onGoToActions,
            colors = ButtonDefaults.buttonColors(containerColor = ConstructionDark),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("View Today's Action Checklist", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SafetyAmber)
            Spacer(modifier = Modifier.width(6.dp))
            Icon(Icons.Default.ArrowForward, contentDescription = null, tint = SafetyAmber, modifier = Modifier.size(14.dp))
        }
    }
}

@Composable
private fun MetricBox(
    title: String,
    value: String,
    subtitle: String,
    bgColor: Color,
    valueColor: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = bgColor,
        modifier = modifier
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text(title, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color.Gray, fontFamily = FontFamily.Monospace)
            Text(value, fontSize = 18.sp, fontWeight = FontWeight.Black, color = valueColor, modifier = Modifier.padding(vertical = 2.dp))
            Text(subtitle, fontSize = 9.sp, color = Color.Gray)
        }
    }
}

@Composable
private fun RiskAlertCard(alert: AiSiteRiskAlert) {
    val (bg, border, text, badgeBg, badgeText) = when (alert.severity) {
        "CRITICAL" -> Tuple5(Color(0xFFFEF2F2), Color(0xFFFECACA), Color(0xFF991B1B), AlertRed, Color.White)
        "HIGH" -> Tuple5(Color(0xFFFFFBEB), Color(0xFFFDE68A), Color(0xFF92400E), SafetyAmber, Color.White)
        "MEDIUM" -> Tuple5(Color(0xFFEEF2FF), Color(0xFFC7D2FE), Color(0xFF3730A3), Color(0xFF4338CA), Color.White)
        "LOW", "NORMAL" -> Tuple5(Color(0xFFECFDF5), Color(0xFFA7F3D0), Color(0xFF065F46), StatusActiveGreen, Color.White)
        else -> Tuple5(Color(0xFFF8FAFC), ConcreteBorder, ConstructionSlate, Color(0xFF64748B), Color.White)
    }

    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = bg),
        border = androidx.compose.foundation.BorderStroke(1.dp, border),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = badgeBg, modifier = Modifier.size(16.dp))
                    Text(alert.title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = text)
                }
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = badgeBg
                ) {
                    Text(
                        text = alert.severity,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Black,
                        color = badgeText,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))
            Text(alert.description, fontSize = 11.sp, color = text.copy(alpha = 0.9f), lineHeight = 15.sp)

            if (alert.mitigation.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = border, thickness = 0.5.dp)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Mitigation: ${alert.mitigation}",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    color = text.copy(alpha = 0.8f)
                )
            }
        }
    }
}

@Composable
private fun ActionItemCard(
    action: AiDailyActionItem,
    isCompleted: Boolean,
    onToggle: () -> Unit,
    onNavigate: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isCompleted) Color(0xFFF8FAFC) else ConcreteSurface
        ),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (isCompleted) Color(0xFFE2E8F0) else ConcreteBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Checkbox(
                checked = isCompleted,
                onCheckedChange = { onToggle() },
                colors = CheckboxDefaults.colors(checkedColor = StatusActiveGreen)
            )

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = when (action.priority) {
                            "HIGH" -> Color(0xFFFEE2E2)
                            "MEDIUM" -> Color(0xFFFEF3C7)
                            else -> Color(0xFFF1F5F9)
                        }
                    ) {
                        Text(
                            text = action.priority,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = when (action.priority) {
                                "HIGH" -> AlertRed
                                "MEDIUM" -> SafetyAmberDark
                                else -> ConstructionSteel
                            },
                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                        )
                    }
                    Text(
                        text = action.category,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.Gray,
                        fontFamily = FontFamily.Monospace
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = action.action,
                    fontSize = 12.sp,
                    color = if (isCompleted) Color.Gray else ConstructionSlate,
                    fontWeight = if (isCompleted) FontWeight.Normal else FontWeight.Medium
                )
            }

            if (action.linkScreen != null) {
                OutlinedButton(
                    onClick = onNavigate,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                    modifier = Modifier.height(30.dp)
                ) {
                    Text("Open", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.width(3.dp))
                    Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(10.dp))
                }
            }
        }
    }
}

private data class Tuple5<A, B, C, D, E>(val a: A, val b: B, val c: C, val d: D, val e: E)
