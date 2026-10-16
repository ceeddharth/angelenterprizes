package com.civilworkforce.attendance.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    primary = SafetyAmber,
    onPrimary = ConcreteSurface,
    primaryContainer = SafetyAmberLight,
    onPrimaryContainer = ConstructionDark,
    secondary = ConstructionSlate,
    onSecondary = ConcreteSurface,
    secondaryContainer = ConstructionSteel,
    background = ConcreteBackground,
    onBackground = ConstructionDark,
    surface = ConcreteSurface,
    onSurface = ConstructionDark,
    surfaceVariant = ConcreteBorder,
    onSurfaceVariant = ConstructionSteel
)

@Composable
fun CivilWorkforceTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = LightColorScheme // High-contrast sunlight readability for construction sites

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = ConstructionSlate.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
