package com.civilworkforce.attendance.util

import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.FirebaseAuthRecentLoginRequiredException
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.firestore.FirebaseFirestoreException
import java.io.IOException

/**
 * User-friendly error mapper.
 * CRITICAL: Never exposes raw technical stack traces or cryptic Firebase error codes to users.
 */
object FirebaseErrorParser {

    fun parse(throwable: Throwable?): String {
        if (throwable == null) return "An unexpected error occurred. Please try again."

        return when (throwable) {
            is FirebaseNetworkException, is IOException -> {
                "Unable to connect to server. Please verify your internet connection and retry."
            }
            is FirebaseAuthInvalidUserException -> {
                "No registered account found with these credentials. Please check your details or contact your site administrator."
            }
            is FirebaseAuthInvalidCredentialsException -> {
                "The email, password, or security PIN entered is incorrect. Please try again."
            }
            is FirebaseAuthUserCollisionException -> {
                "An account with this email address already exists. Please sign in or use another email."
            }
            is FirebaseAuthRecentLoginRequiredException -> {
                "Your security session has expired. Please sign in again."
            }
            is FirebaseFirestoreException -> {
                when (throwable.code) {
                    FirebaseFirestoreException.Code.PERMISSION_DENIED -> {
                        "You do not have permission to perform this action. Administrator privileges required."
                    }
                    FirebaseFirestoreException.Code.UNAVAILABLE -> {
                        "The workforce database is temporarily unreachable. Please try again shortly."
                    }
                    FirebaseFirestoreException.Code.NOT_FOUND -> {
                        "The requested worker or site record was not found."
                    }
                    FirebaseFirestoreException.Code.ALREADY_EXISTS -> {
                        "A record with this identifier already exists in the system."
                    }
                    else -> "Database operation failed. Please check your connection and retry."
                }
            }
            is SecurityException -> {
                throwable.message ?: "Access denied. Insufficient authorization role."
            }
            else -> {
                val message = throwable.localizedMessage ?: throwable.message
                if (message != null && !message.contains("Exception") && !message.contains("com.google")) {
                    message
                } else {
                    "An unexpected error occurred. Please try again or contact site operations."
                }
            }
        }
    }
}
