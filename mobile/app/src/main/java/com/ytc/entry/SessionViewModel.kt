package com.ytc.entry

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ytc.entry.data.Api
import com.ytc.entry.data.ApiResult
import com.ytc.entry.data.SessionStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface SessionState {
    data object Loading : SessionState
    data class LoggedOut(val baseUrl: String) : SessionState
    data class LoggedIn(val token: String, val baseUrl: String) : SessionState
}

class SessionViewModel(app: Application) : AndroidViewModel(app) {
    private val store = SessionStore(app)

    val state: StateFlow<SessionState> = store.session
        .map { s ->
            if (s.token == null) SessionState.LoggedOut(s.baseUrl)
            else SessionState.LoggedIn(s.token, s.baseUrl)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SessionState.Loading)

    val loggingIn = MutableStateFlow(false)
    val loginError = MutableStateFlow<String?>(null)

    fun login(email: String, password: String, baseUrl: String) {
        viewModelScope.launch {
            loggingIn.value = true
            loginError.value = null
            val normalized = SessionStore.normalizeBaseUrl(baseUrl)
            when (val r = Api.login(normalized, email.trim(), password)) {
                is ApiResult.Ok -> store.save(r.value.token, normalized)
                is ApiResult.Err -> loginError.value = r.message
            }
            loggingIn.value = false
        }
    }

    fun logout() {
        viewModelScope.launch { store.clear() }
    }

    /** Build an authed client for the logged-in session. */
    fun apiFor(s: SessionState.LoggedIn): Api = Api(s.baseUrl, s.token)
}
