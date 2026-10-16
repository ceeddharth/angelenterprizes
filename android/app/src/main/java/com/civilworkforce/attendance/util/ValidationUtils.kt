package com.civilworkforce.attendance.util

/**
 * Result data class for phone validation with field-level error messages.
 */
data class PhoneValidationResult(
    val isValid: Boolean,
    val normalizedNumber: String = "",
    val formattedDisplay: String = "",
    val errorMessage: String? = null
)

/**
 * Result data class for wage validation with field-level error messages.
 */
data class WageValidationResult(
    val isValid: Boolean,
    val wageAmount: Double = 0.0,
    val errorMessage: String? = null
)

object ValidationUtils {

    const val MAX_EMAIL_LENGTH = 254

    // Valid 10-digit Indian mobile number: starts with 6, 7, 8, or 9 followed by 9 digits
    private val INDIAN_MOBILE_STRICT_REGEX = Regex("^[6-9][0-9]{9}$")

    // Standard RFC 5322 compliant email regex
    private val EMAIL_REGEX = Regex("^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$")

    /**
     * Validates and normalizes phone numbers throughout the app.
     * Supports:
     * - Standard 10-digit Indian numbers: "9876543210"
     * - Formatted with spaces / dashes: "98765 43210", "98765-43210"
     * - With +91 country code: "+91 9876543210", "+919876543210", "+91-98765-43210", "+91 98765 43210"
     * - With 0 trunk prefix: "09876543210"
     * - With 91 country code prefix without plus: "919876543210" (when length is 12)
     * Rejects:
     * - Incomplete or short numbers (< 10 digits)
     * - Numbers starting with 0-5 for 10-digit national numbers
     * - Malformed input containing letters or invalid characters
     * - Blank or null input
     */
    fun validatePhone(phone: String?): PhoneValidationResult {
        if (phone.isNullOrBlank()) {
            return PhoneValidationResult(
                isValid = false,
                errorMessage = "Mobile phone number is required."
            )
        }

        val rawTrimmed = phone.trim()

        // Check for invalid characters (only digits, spaces, hyphens, and leading plus are permitted)
        val validCharsRegex = Regex("^\\+?[0-9\\s\\-]+$")
        if (!validCharsRegex.matches(rawTrimmed)) {
            return PhoneValidationResult(
                isValid = false,
                errorMessage = "Phone number contains invalid characters. Enter digits only."
            )
        }

        var digitsOnly = rawTrimmed

        // Handle optional +91 prefix
        if (rawTrimmed.startsWith("+91")) {
            val afterPrefix = rawTrimmed.removePrefix("+91").trimStart()
            val cleanAfter = afterPrefix.removePrefix("-").trimStart()
            digitsOnly = cleanAfter.replace(Regex("[\\s\\-]"), "")
        } else if (rawTrimmed.startsWith("+")) {
            return PhoneValidationResult(
                isValid = false,
                errorMessage = "Unsupported country code. Please provide an Indian mobile number (+91)."
            )
        } else {
            digitsOnly = rawTrimmed.replace(Regex("[\\s\\-]"), "")
        }

        // Verify national 10-digit length
        if (digitsOnly.length != 10) {
            return PhoneValidationResult(
                isValid = false,
                errorMessage = if (digitsOnly.length < 10) {
                    "Mobile number is too short (${digitsOnly.length}/10 digits). Enter 10 digits."
                } else {
                    "Mobile number is too long (${digitsOnly.length} digits). Enter 10 digits."
                }
            )
        }

        // Verify leading digit rule (6, 7, 8, 9)
        val firstDigit = digitsOnly[0]
        if (firstDigit !in '6'..'9') {
            return PhoneValidationResult(
                isValid = false,
                errorMessage = "Indian mobile numbers must start with 6, 7, 8, or 9 (entered starts with '$firstDigit')."
            )
        }

        if (!INDIAN_MOBILE_STRICT_REGEX.matches(digitsOnly)) {
            return PhoneValidationResult(
                isValid = false,
                errorMessage = "Invalid mobile number format."
            )
        }

        val display = formatPhoneDisplay(digitsOnly)

        return PhoneValidationResult(
            isValid = true,
            normalizedNumber = digitsOnly,
            formattedDisplay = display,
            errorMessage = null
        )
    }

    /**
     * Backward-compatible boolean validation check.
     */
    fun isValidPhone(phone: String?): Boolean {
        return validatePhone(phone).isValid
    }

    /**
     * Normalizes phone to clean 10-digit string if valid, or trimmed string.
     */
    fun normalizePhone(phone: String): String {
        val result = validatePhone(phone)
        return if (result.isValid) result.normalizedNumber else phone.trim()
    }

    /**
     * Formats 10-digit mobile number into user-friendly Indian format: "+91 XXXXX XXXXX"
     */
    fun formatPhoneDisplay(phone: String): String {
        val clean = phone.replace(Regex("[^0-9]"), "")
        val national = if (clean.length == 12 && clean.startsWith("91")) clean.substring(2) else clean
        return if (national.length == 10) {
            "+91 ${national.substring(0, 5)} ${national.substring(5)}"
        } else {
            phone.trim()
        }
    }

    /**
     * Validates Daily Wage input in INR.
     */
    fun validateDailyWage(wageStr: String?): WageValidationResult {
        if (wageStr.isNullOrBlank()) {
            return WageValidationResult(
                isValid = false,
                errorMessage = "Daily wage rate is required."
            )
        }
        val wage = CurrencyUtils.parseWage(wageStr)
        if (wage == null) {
            return WageValidationResult(
                isValid = false,
                errorMessage = "Please enter a valid numeric wage amount (e.g. 750)."
            )
        }
        if (wage < 100.0) {
            return WageValidationResult(
                isValid = false,
                errorMessage = "Daily wage must be at least ₹100/day."
            )
        }
        if (wage > 20000.0) {
            return WageValidationResult(
                isValid = false,
                errorMessage = "Daily wage cannot exceed ₹20,000/day."
            )
        }
        return WageValidationResult(
            isValid = true,
            wageAmount = wage,
            errorMessage = null
        )
    }

    fun isValidEmail(email: String?): Boolean {
        if (email.isNullOrBlank()) return false
        val trimmed = email.trim()
        if (trimmed.length > MAX_EMAIL_LENGTH || trimmed.contains(' ')) return false
        return EMAIL_REGEX.matches(trimmed)
    }

    fun normalizeEmail(email: String): String {
        return email.trim().lowercase()
    }

    fun isValidPassword(password: String): Boolean {
        return password.trim().length >= 6
    }

    fun isValidWorkerId(workerId: String): Boolean {
        return workerId.trim().isNotBlank() && workerId.trim().length >= 3
    }
}
