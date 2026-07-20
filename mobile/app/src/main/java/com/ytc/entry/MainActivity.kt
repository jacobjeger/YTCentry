package com.ytc.entry

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ytc.entry.ui.Root
import com.ytc.entry.ui.theme.YtcTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            YtcTheme {
                val vm: SessionViewModel = viewModel()
                Root(vm)
            }
        }
    }
}
