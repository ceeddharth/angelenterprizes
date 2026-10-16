package com.civilworkforce.attendance.util

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

/**
 * Enterprise Indian Rupee (INR) formatting and calculation utilities
 * for ANGEL ENTERPRISES Civil Workforce Attendance System.
 */
object CurrencyUtils {

    const val INR_SYMBOL = "₹"
    const val CURRENCY_CODE = "INR"

    // Standard civil construction default working days per month
    const val STANDARD_MONTHLY_WORK_DAYS = 26

    private val indianFormatSymbols = DecimalFormatSymbols(Locale("en", "IN")).apply {
        currencySymbol = INR_SYMBOL
        groupingSeparator = ','
        decimalSeparator = '.'
    }

    private val integerFormatter = DecimalFormat("##,##,##0", indianFormatSymbols)
    private val decimalFormatter = DecimalFormat("##,##,##0.00", indianFormatSymbols)

    /**
     * Formats an amount with the Indian Rupee symbol (₹) and Indian number grouping.
     * e.g., 850.0 -> "₹850", 125000.0 -> "₹1,25,000"
     */
    fun formatInr(amount: Double, showDecimals: Boolean = false): String {
        if (amount.isNaN() || amount.isInfinite()) return "${INR_SYMBOL}0"
        val formattedNumber = if (showDecimals && amount % 1.0 != 0.0) {
            decimalFormatter.format(amount)
        } else {
            integerFormatter.format(amount)
        }
        return "$INR_SYMBOL$formattedNumber"
    }

    /**
     * Overload for Long amounts.
     */
    fun formatInr(amount: Long): String {
        return "$INR_SYMBOL${integerFormatter.format(amount)}"
    }

    /**
     * Formats a daily wage rate string.
     * e.g. "₹850 / day"
     */
    fun formatDailyWage(dailyWage: Double): String {
        return "${formatInr(dailyWage)} / day"
    }

    /**
     * Estimates monthly gross pay based on standard civil working days.
     * e.g. "₹22,100 / month (26 shifts)"
     */
    fun formatMonthlyEstimate(dailyWage: Double, days: Int = STANDARD_MONTHLY_WORK_DAYS): String {
        val total = dailyWage * days
        return "${formatInr(total)} / month ($days shifts)"
    }

    /**
     * Safely parses user wage input, stripping currency symbols, commas, and whitespace.
     */
    fun parseWage(input: String?): Double? {
        if (input.isNullOrBlank()) return null
        val clean = input.replace(INR_SYMBOL, "")
            .replace(",", "")
            .replace(" ", "")
            .trim()
        return clean.toDoubleOrNull()
    }

    /**
     * Validates that a wage rate is within reasonable civil workforce limits (₹200 to ₹10,000/day).
     */
    fun isValidWageRate(wage: Double): Boolean {
        return wage in 200.0..10000.0
    }
}
