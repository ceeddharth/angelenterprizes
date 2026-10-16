package com.civilworkforce.attendance.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.civilworkforce.attendance.MainActivity
import com.civilworkforce.attendance.R
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class CivilFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "Refreshed FCM device token received: ${token.take(12)}...")
        registerTokenWithCurrentUser(token)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "From: ${remoteMessage.from}")

        // Check if message contains a notification payload
        val title = remoteMessage.notification?.title 
            ?: remoteMessage.data["title"] 
            ?: "Workforce Notification"
        val body = remoteMessage.notification?.body 
            ?: remoteMessage.data["body"] 
            ?: "You have an update regarding your civil workforce assignment."

        showNotification(title, body, remoteMessage.data)
    }

    private fun showNotification(title: String, message: String, data: Map<String, String>) {
        val channelId = "civil_workforce_alerts"
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Workforce Assignments & Status Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts for registration approval, site assignment changes, and workforce schedules."
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            for ((key, value) in data) {
                putExtra(key, value)
            }
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )

        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))

        val notificationId = (System.currentTimeMillis() % 10000).toInt()
        notificationManager.notify(notificationId, notificationBuilder.build())
    }

    companion object {
        private const val TAG = "CivilFcmService"

        /**
         * Register or update current device FCM token for authenticated worker UID in Firestore.
         * Primary database updates remain authoritative. Push notification is alert only.
         * Token doc ID is deterministic hash of uid + token to prevent duplicates.
         */
        fun registerTokenWithCurrentUser(token: String) {
            val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
            if (token.isBlank()) return

            try {
                val digest = MessageDigest.getInstance("SHA-256")
                val hashBytes = digest.digest("$uid:$token".toByteArray())
                val docId = hashBytes.joinToString("") { "%02x".format(it) }

                val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                val now = sdf.format(Date())

                val tokenData = hashMapOf(
                    "token" to token,
                    "uid" to uid,
                    "platform" to "android",
                    "updatedAt" to now,
                    "createdAt" to now
                )

                FirebaseFirestore.getInstance()
                    .collection("deviceTokens")
                    .document(docId)
                    .set(tokenData, SetOptions.merge())
                    .addOnSuccessListener {
                        Log.d(TAG, "Device FCM token registered successfully in Firestore for UID: $uid")
                    }
                    .addOnFailureListener { e ->
                        Log.w(TAG, "Failed to register FCM token in Firestore: ${e.message}")
                    }
            } catch (e: Exception) {
                Log.w(TAG, "Error hashing device token: ${e.message}")
            }
        }

        /**
         * Fetch current FCM token and associate with authenticated worker
         */
        fun syncDeviceTokenForWorker() {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (!task.isSuccessful) {
                    Log.w(TAG, "Fetching FCM registration token failed", task.exception)
                    return@addOnCompleteListener
                }
                val token = task.result
                if (!token.isNullOrBlank()) {
                    registerTokenWithCurrentUser(token)
                }
            }
        }

        /**
         * Safely unregister FCM token when worker signs out
         */
        fun unregisterDeviceTokenOnSignOut(onComplete: () -> Unit = {}) {
            val uid = FirebaseAuth.getInstance().currentUser?.uid
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (task.isSuccessful && !task.result.isNullOrBlank() && uid != null) {
                    try {
                        val token = task.result
                        val digest = MessageDigest.getInstance("SHA-256")
                        val hashBytes = digest.digest("$uid:$token".toByteArray())
                        val docId = hashBytes.joinToString("") { "%02x".format(it) }

                        FirebaseFirestore.getInstance()
                            .collection("deviceTokens")
                            .document(docId)
                            .delete()
                            .addOnCompleteListener { onComplete() }
                    } catch (e: Exception) {
                        onComplete()
                    }
                } else {
                    onComplete()
                }
            }
        }
    }
}
