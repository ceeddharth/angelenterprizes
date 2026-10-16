package com.civilworkforce.attendance.data

import com.civilworkforce.attendance.model.*
import com.civilworkforce.attendance.util.FirebaseErrorParser
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Phase 8: AI Operations Assistant Repository (Strictly Read-Only)
 * Grounded in live Firestore records; never modifies attendance, leave, or wage records.
 */
interface AiOperationsRepository {
    suspend fun getLiveOperationsInsights(forceRefresh: Boolean = false): Resource<AiOperationsInsights>
}

class FirebaseAiOperationsRepository(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val backendBaseUrl: String = FirebaseConstants.DEFAULT_BACKEND_URL
) : AiOperationsRepository {

    override suspend fun getLiveOperationsInsights(forceRefresh: Boolean): Resource<AiOperationsInsights> = withContext(Dispatchers.IO) {
        // 1. Verify authentication upfront
        val currentUser = auth.currentUser
        if (currentUser == null) {
            return@withContext Resource.Error("Authentication required: Please sign in with an Administrator account.")
        }

        // 2. Attempt trusted backend AI endpoint first (returns Gemini AI or deterministic insights with full aggregates)
        try {
            val tokenResult = currentUser.getIdToken(forceRefresh).await()
            val idToken = tokenResult.token
            if (!idToken.isNullOrBlank()) {
                val backendInsights = fetchFromBackendApi(idToken, forceRefresh)
                if (backendInsights != null) {
                    return@withContext Resource.Success(backendInsights)
                }
            }
        } catch (_: Exception) {
            // If backend endpoint is unreachable or offline, proceed seamlessly to direct live Firestore queries
        }

        // 3. Direct live Firestore queries (Read-only ground-truth fallback)
        try {
            // When forceRefresh is requested, query Source.SERVER to fetch fresh data from Firestore backend
            val source = if (forceRefresh) com.google.firebase.firestore.Source.SERVER else com.google.firebase.firestore.Source.DEFAULT
            val workersSnap = firestore.collection(FirebaseConstants.COLLECTION_WORKERS).get(source).await()
            val sitesSnap = firestore.collection(FirebaseConstants.COLLECTION_SITES).get(source).await()
            val registrationsSnap = firestore.collection(FirebaseConstants.COLLECTION_REGISTRATIONS).get(source).await()

            val workers = workersSnap.documents
            val sites = sitesSnap.documents
            val registrations = registrationsSnap.documents

            val totalWorkers = workers.size
            val activeWorkers = workers.count { doc ->
                val status = doc.getString(FirebaseConstants.FIELD_STATUS)
                status?.equals(UserStatus.ACTIVE.name, ignoreCase = true) == true
            }
            val suspendedWorkers = workers.count { doc ->
                val status = doc.getString(FirebaseConstants.FIELD_STATUS)
                status?.equals(UserStatus.SUSPENDED.name, ignoreCase = true) == true
            }
            val totalSites = sites.size
            val activeSites = sites.count { doc ->
                val status = doc.getString(FirebaseConstants.FIELD_STATUS)
                status?.equals(SiteStatus.ACTIVE.name, ignoreCase = true) == true
            }
            val pendingRegistrations = registrations.count { doc ->
                val status = doc.getString(FirebaseConstants.FIELD_STATUS)
                status?.equals(RegistrationStatus.PENDING.name, ignoreCase = true) == true
            }

            val unassignedWorkers = workers.count { doc ->
                val status = doc.getString(FirebaseConstants.FIELD_STATUS)
                val siteId = doc.getString(FirebaseConstants.FIELD_SITE_ID)
                val assignedSiteId = doc.getString("assignedSiteId")
                val isActive = status?.equals(UserStatus.ACTIVE.name, ignoreCase = true) == true
                val hasNoSite = (siteId.isNullOrBlank() || siteId == "UNASSIGNED") && (assignedSiteId.isNullOrBlank() || assignedSiteId == "UNASSIGNED")
                isActive && hasNoSite
            }

            // Calculate understaffed sites (active sites with 0 assigned workers)
            val understaffedSites = sites.filter { siteDoc ->
                val status = siteDoc.getString(FirebaseConstants.FIELD_STATUS)
                if (status?.equals(SiteStatus.ACTIVE.name, ignoreCase = true) != true) return@filter false
                val siteId = siteDoc.id
                val siteIdField = siteDoc.getString("siteId")
                val count = workers.count { wDoc ->
                    val wStatus = wDoc.getString(FirebaseConstants.FIELD_STATUS)
                    val sId = wDoc.getString(FirebaseConstants.FIELD_SITE_ID) ?: wDoc.getString("assignedSiteId")
                    val isActive = wStatus?.equals(UserStatus.ACTIVE.name, ignoreCase = true) == true
                    val matchesSite = (sId == siteId) || (siteIdField != null && sId == siteIdField)
                    isActive && matchesSite
                }
                count == 0
            }.map { siteDoc ->
                val name = siteDoc.getString("siteName") ?: siteDoc.id
                "$name (${siteDoc.id})"
            }

            // Check today's attendance in IST (Asia/Kolkata)
            val istFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("Asia/Kolkata")
            }
            val todayStr = istFormat.format(Date())

            var attendanceQueryFailed = false
            var attendanceErrorMessage: String? = null
            val attendanceSnap = try {
                firestore.collection(FirebaseConstants.COLLECTION_ATTENDANCE)
                    .whereEqualTo(FirebaseConstants.FIELD_DATE, todayStr)
                    .get(source)
                    .await()
            } catch (e: Exception) {
                attendanceQueryFailed = true
                attendanceErrorMessage = FirebaseErrorParser.parse(e)
                null
            }

            // Do not report presentToday = 0 or derive absentToday when attendance query fails.
            // Represent unavailable attendance data explicitly as null and attendanceDataAvailable = false.
            val todayWorkerIds = if (attendanceQueryFailed || attendanceSnap == null) {
                null
            } else {
                attendanceSnap.documents.mapNotNull { it.getString(FirebaseConstants.FIELD_WORKER_ID) }.toSet()
            }

            val presentToday: Int? = if (attendanceQueryFailed || todayWorkerIds == null) null else todayWorkerIds.size
            val absentToday: Int? = if (attendanceQueryFailed || todayWorkerIds == null) null else (activeWorkers - (presentToday ?: 0)).coerceAtLeast(0)
            val attendanceDataAvailable: Boolean = !attendanceQueryFailed && todayWorkerIds != null

            val isInsufficient = totalWorkers == 0 && totalSites == 0

            val staffingStatus = when {
                isInsufficient -> "No Active Records"
                understaffedSites.isNotEmpty() -> "${understaffedSites.size} Understaffed Site(s)"
                else -> "Balanced Coverage"
            }

            val headline = when {
                isInsufficient -> "Zero Active Personnel Logged in System"
                activeWorkers == 0 -> "Zero Active Deployable Workers on Roster"
                else -> "$activeWorkers Active Personnel Deployed across $activeSites Construction Sites"
            }

            val summary = when {
                isInsufficient -> "No workforce or site records found in database. Grounded operational intelligence requires registered workforce."
                attendanceQueryFailed -> "Civil workforce operational status is nominal. $totalWorkers registered total ($activeWorkers active), $activeSites active sites. Attendance notice: Attendance data unavailable ($attendanceErrorMessage). $pendingRegistrations worker registrations pending verification."
                else -> "Civil workforce operational status is nominal. $totalWorkers registered total ($activeWorkers active), ${presentToday ?: 0} present today, ${absentToday ?: 0} absent today, $activeSites active sites. $pendingRegistrations worker registrations pending verification."
            }

            val brief = AiWorkforceBrief(
                todayHeadline = headline,
                totalWorkers = totalWorkers,
                totalActiveWorkers = activeWorkers,
                presentToday = presentToday,
                absentToday = absentToday,
                attendanceDataAvailable = attendanceDataAvailable,
                unassignedWorkers = unassignedWorkers,
                activeSites = activeSites,
                totalSites = totalSites,
                pendingRegistrations = pendingRegistrations,
                staffingStatus = staffingStatus,
                summary = summary
            )

            // Algorithmic Site Risk Alerts
            val alerts = mutableListOf<AiSiteRiskAlert>()
            if (understaffedSites.isNotEmpty()) {
                alerts.add(
                    AiSiteRiskAlert(
                        id = "risk-empty-sites",
                        severity = "HIGH",
                        title = "Unstaffed Construction Sites Detected",
                        description = "${understaffedSites.size} active site(s) currently have zero assigned workforce (${understaffedSites.joinToString(", ")}).",
                        mitigation = "Assign workers from unassigned personnel or rebalance squads from active batches."
                    )
                )
            }

            if (unassignedWorkers > 0) {
                alerts.add(
                    AiSiteRiskAlert(
                        id = "risk-unassigned-workers",
                        severity = "MEDIUM",
                        title = "Unassigned Personnel on Roster",
                        description = "$unassignedWorkers active worker(s) do not have a primary construction site assigned.",
                        mitigation = "Assign workers to active projects via Civil Workers management."
                    )
                )
            }

            if (pendingRegistrations > 0) {
                alerts.add(
                    AiSiteRiskAlert(
                        id = "risk-pending-reg",
                        severity = "MEDIUM",
                        title = "Pending Registrations Awaiting Verification",
                        description = "$pendingRegistrations applicant(s) awaiting administrative review and KYC verification.",
                        mitigation = "Review applicant records in Approvals console."
                    )
                )
            }

            if (attendanceQueryFailed) {
                alerts.add(
                    AiSiteRiskAlert(
                        id = "risk-attendance-sync",
                        severity = "HIGH",
                        title = "Live Attendance Records Unsynchronized",
                        description = "Attendance logs could not be queried directly: $attendanceErrorMessage.",
                        mitigation = "Check network connectivity and verify Administrator permissions in security ledger."
                    )
                )
            }

            if (alerts.isEmpty() && !isInsufficient) {
                alerts.add(
                    AiSiteRiskAlert(
                        id = "risk-nominal",
                        severity = "LOW",
                        title = "Site Operational Risks Nominal",
                        description = "All construction sites have assigned personnel with balanced supervisor coverage and zero critical alerts.",
                        mitigation = "Continue standard shift monitoring and rotation audits."
                    )
                )
            }

            // AI Daily Action List
            val actions = mutableListOf<AiDailyActionItem>()
            if (pendingRegistrations > 0) {
                actions.add(
                    AiDailyActionItem(
                        id = "act-reg",
                        priority = "HIGH",
                        action = "Review and verify $pendingRegistrations pending worker registration(s).",
                        category = "REGISTRATION",
                        linkScreen = "admin_pending_registrations"
                    )
                )
            }

            if (understaffedSites.isNotEmpty()) {
                actions.add(
                    AiDailyActionItem(
                        id = "act-sites",
                        priority = "HIGH",
                        action = "Deploy personnel to ${understaffedSites.size} understaffed operational site(s).",
                        category = "SITES",
                        linkScreen = "admin_sites"
                    )
                )
            }

            if (unassignedWorkers > 0) {
                actions.add(
                    AiDailyActionItem(
                        id = "act-assign",
                        priority = "MEDIUM",
                        action = "Assign $unassignedWorkers unassigned worker(s) to operational construction sites.",
                        category = "WORKERS",
                        linkScreen = "admin_workers"
                    )
                )
            }

            actions.add(
                AiDailyActionItem(
                    id = "act-sync",
                    priority = "LOW",
                    action = "Perform end-of-day attendance sync with field supervisor reports.",
                    category = "ATTENDANCE",
                    linkScreen = "admin_dashboard"
                )
            )

            val insights = AiOperationsInsights(
                brief = brief,
                alerts = alerts,
                actions = actions,
                modelUsed = "Rules-based Operational Engine (Grounded in live Firestore records)",
                isInsufficientData = isInsufficient,
                generatedAt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
            )

            Resource.Success(insights)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    /**
     * Calls trusted Cloud Run backend endpoint POST /api/ai/management-insights
     */
    private fun fetchFromBackendApi(idToken: String, forceRefresh: Boolean): AiOperationsInsights? {
        return try {
            val endpoint = "${backendBaseUrl.trimEnd('/')}/api/ai/management-insights"
            val url = URL(endpoint)
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Authorization", "Bearer $idToken")
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                doOutput = true
                connectTimeout = 8000
                readTimeout = 8000
            }

            val requestBody = JSONObject().apply {
                put("forceRefresh", forceRefresh)
            }

            connection.outputStream.use { os ->
                os.write(requestBody.toString().toByteArray(Charsets.UTF_8))
            }

            val responseCode = connection.responseCode
            if (responseCode == 200) {
                val reader = BufferedReader(InputStreamReader(connection.inputStream))
                val responseText = reader.readText()
                reader.close()
                parseBackendResponse(JSONObject(responseText))
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun parseBackendResponse(json: JSONObject): AiOperationsInsights? {
        if (!json.optBoolean("success", false)) return null

        val briefObj = json.optJSONObject("workforceBrief")
        val observedObj = json.optJSONObject("observedData")
        val workforceObj = observedObj?.optJSONObject("workforce")
        val sitesObj = observedObj?.optJSONObject("sites")

        val totalWorkers = workforceObj?.optInt("total", 0) ?: 0
        val activeWorkers = briefObj?.optInt("totalActiveWorkers", workforceObj?.optInt("active", 0) ?: 0) ?: 0
        val hasPresent = briefObj != null && briefObj.has("presentToday") && !briefObj.isNull("presentToday")
        val presentToday: Int? = if (hasPresent) briefObj!!.optInt("presentToday", 0) else null
        val hasAbsent = briefObj != null && briefObj.has("absentToday") && !briefObj.isNull("absentToday")
        val absentToday: Int? = if (hasAbsent) {
            briefObj!!.optInt("absentToday", 0)
        } else if (presentToday != null) {
            (activeWorkers - presentToday).coerceAtLeast(0)
        } else null
        val attendanceDataAvailable = briefObj?.optBoolean("attendanceDataAvailable", presentToday != null) ?: (presentToday != null)

        val unassignedWorkers = briefObj?.optInt("unassignedWorkers", 0) ?: 0
        val activeSites = sitesObj?.optInt("active", briefObj?.optInt("activeSites", 0) ?: 0) ?: 0
        val totalSites = sitesObj?.optInt("total", briefObj?.optInt("inactiveSites", 0)?.plus(activeSites) ?: 0) ?: 0
        val pendingRegistrations = briefObj?.optInt("pendingRegistrations", 0) ?: 0
        val staffingStatus = briefObj?.optString("staffingStatus", "Balanced Coverage") ?: "Balanced Coverage"
        val headline = briefObj?.optString("todayHeadline", "$activeWorkers Active Personnel Deployed across $activeSites Construction Sites") ?: ""
        val summary = briefObj?.optString("summary", "Civil workforce operational status is nominal.") ?: ""

        val brief = AiWorkforceBrief(
            todayHeadline = headline,
            totalWorkers = totalWorkers,
            totalActiveWorkers = activeWorkers,
            presentToday = presentToday,
            absentToday = absentToday,
            attendanceDataAvailable = attendanceDataAvailable,
            unassignedWorkers = unassignedWorkers,
            activeSites = activeSites,
            totalSites = totalSites,
            pendingRegistrations = pendingRegistrations,
            staffingStatus = staffingStatus,
            summary = summary
        )

        val alertsList = mutableListOf<AiSiteRiskAlert>()
        val alertsArray = json.optJSONArray("siteRiskAlerts")
        if (alertsArray != null) {
            for (i in 0 until alertsArray.length()) {
                val aObj = alertsArray.optJSONObject(i) ?: continue
                alertsList.add(
                    AiSiteRiskAlert(
                        id = aObj.optString("id", "alert-$i"),
                        severity = aObj.optString("severity", "LOW"),
                        title = aObj.optString("title", ""),
                        description = aObj.optString("description", ""),
                        mitigation = aObj.optString("mitigation", "")
                    )
                )
            }
        }

        val actionsList = mutableListOf<AiDailyActionItem>()
        val actionsArray = json.optJSONArray("dailyActions")
        if (actionsArray != null) {
            for (i in 0 until actionsArray.length()) {
                val actObj = actionsArray.optJSONObject(i) ?: continue
                actionsList.add(
                    AiDailyActionItem(
                        id = actObj.optString("id", "act-$i"),
                        priority = actObj.optString("priority", "MEDIUM"),
                        action = actObj.optString("action", ""),
                        category = actObj.optString("category", "WORKERS"),
                        linkScreen = actObj.optString("linkScreen", null)
                    )
                )
            }
        }

        return AiOperationsInsights(
            brief = brief,
            alerts = alertsList,
            actions = actionsList,
            modelUsed = json.optString("modelUsed", "Live Operations Intelligence"),
            isInsufficientData = json.optBoolean("insufficientData", totalWorkers == 0 && totalSites == 0),
            generatedAt = json.optString("generatedAt", SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date()))
        )
    }
}
