package com.ytc.entry.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.ytc.entry.BuildConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "ytc")

/** Persisted session: the bearer token (null = logged out) and the server URL. */
data class Session(val token: String?, val baseUrl: String)

class SessionStore(private val context: Context) {
    private val tokenKey = stringPreferencesKey("token")
    private val baseKey = stringPreferencesKey("base_url")

    val session: Flow<Session> = context.dataStore.data.map { prefs ->
        Session(
            token = prefs[tokenKey],
            baseUrl = prefs[baseKey]?.takeIf { it.isNotBlank() } ?: BuildConfig.DEFAULT_BASE_URL,
        )
    }

    suspend fun save(token: String, baseUrl: String) {
        context.dataStore.edit {
            it[tokenKey] = token
            it[baseKey] = normalizeBaseUrl(baseUrl)
        }
    }

    /** Sign out but keep the configured server URL for the next login. */
    suspend fun clear() {
        context.dataStore.edit { it.remove(tokenKey) }
    }

    companion object {
        fun normalizeBaseUrl(raw: String): String {
            var s = raw.trim().trimEnd('/')
            if (s.isNotEmpty() && !s.startsWith("http://") && !s.startsWith("https://")) {
                s = "https://$s"
            }
            return s
        }
    }
}
