package com.ytc.entry.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.ytc.entry.R
import com.ytc.entry.SessionViewModel
import com.ytc.entry.SessionState
import com.ytc.entry.data.BootstrapResponse

private data class Tab(val route: String, val emoji: String, val labelRes: Int)

private val TABS = listOf(
    Tab("add", "➕", R.string.tab_add),
    Tab("roster", "📋", R.string.tab_roster),
    Tab("temp", "🔑", R.string.tab_temp),
)

@Composable
fun Root(vm: SessionViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    when (val s = state) {
        is SessionState.Loading -> Box(Modifier.fillMaxSize(), Alignment.Center) { CenteredSpinner() }
        is SessionState.LoggedOut -> {
            val loggingIn by vm.loggingIn.collectAsStateWithLifecycle()
            val error by vm.loginError.collectAsStateWithLifecycle()
            LoginScreen(
                defaultBaseUrl = s.baseUrl,
                loading = loggingIn,
                error = error,
                onSubmit = { email, pass, url -> vm.login(email, pass, url) },
            )
        }
        is SessionState.LoggedIn -> {
            val api = remember(s.token, s.baseUrl) { vm.apiFor(s) }
            MainScaffold(api = api, onLogout = vm::logout)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScaffold(
    api: com.ytc.entry.data.Api,
    onLogout: () -> Unit,
) {
    val nav = rememberNavController()
    var boot by remember { mutableStateOf<BootstrapResponse?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_name)) },
                actions = {
                    TextButton(onClick = onLogout) { Text(stringResource(R.string.logout)) }
                },
            )
        },
        bottomBar = {
            val backStack by nav.currentBackStackEntryAsState()
            val current = backStack?.destination
            NavigationBar {
                TABS.forEach { tab ->
                    val selected = current?.hierarchy?.any { it.route?.substringBefore("?") == tab.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            nav.navigate(tab.route) {
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Text(tab.emoji) },
                        label = { Text(stringResource(tab.labelRes)) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = "add",
            modifier = Modifier.padding(padding),
        ) {
            composable(
                route = "add?name={name}&rosterId={rosterId}",
                arguments = listOf(
                    navArgument("name") { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument("rosterId") { type = NavType.StringType; nullable = true; defaultValue = null },
                ),
            ) { entry ->
                AddPersonScreen(
                    api = api,
                    boot = boot,
                    onBoot = { boot = it },
                    prefillName = entry.arguments?.getString("name"),
                    prefillRosterId = entry.arguments?.getString("rosterId"),
                    onUnauthorized = onLogout,
                )
            }
            composable("roster") {
                RosterScreen(
                    api = api,
                    onUnauthorized = onLogout,
                    onEnroll = { name, rosterId ->
                        // Uri.encode, NOT URLEncoder.encode. URLEncoder does
                        // form encoding, which writes a space as "+" — and the
                        // nav argument is read back with %XX decoding only, so
                        // the "+" survives into the name ("Avromi+Franklin")
                        // and gets pushed to the door that way. Uri.encode
                        // writes %20, which decodes back to a space.
                        val encoded = android.net.Uri.encode(name)
                        nav.navigate("add?name=$encoded&rosterId=$rosterId")
                    },
                )
            }
            composable("temp") {
                TempPinScreen(api = api, boot = boot, onBoot = { boot = it }, onUnauthorized = onLogout)
            }
        }
    }
}
