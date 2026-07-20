package com.ytc.entry.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Bronze = Color(0xFF8A6A3E)
private val BronzeDark = Color(0xFF5F4A2B)
private val BronzeLight = Color(0xFFB89466)

private val LightColors = lightColorScheme(
    primary = Bronze,
    onPrimary = Color.White,
    primaryContainer = BronzeLight,
    onPrimaryContainer = Color(0xFF2B2013),
    secondary = BronzeDark,
)

private val DarkColors = darkColorScheme(
    primary = BronzeLight,
    onPrimary = Color(0xFF2B2013),
    primaryContainer = BronzeDark,
    onPrimaryContainer = Color.White,
    secondary = BronzeLight,
)

@Composable
fun YtcTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
