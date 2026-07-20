package com.ytc.entry.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ytc.entry.R
import com.ytc.entry.data.Api
import com.ytc.entry.data.ApiResult
import com.ytc.entry.data.RosterDto

@Composable
fun RosterScreen(
    api: Api,
    onUnauthorized: () -> Unit,
    onEnroll: (name: String, rosterId: String) -> Unit,
) {
    var rows by remember { mutableStateOf<List<RosterDto>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var reloadKey by remember { mutableStateOf(0) }

    LaunchedEffect(reloadKey) {
        rows = null
        error = null
        when (val r = api.roster()) {
            is ApiResult.Ok -> rows = r.value
            is ApiResult.Err -> if (r.unauthorized) onUnauthorized() else error = r.message
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            stringResource(R.string.roster_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text(stringResource(R.string.roster_search)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        when {
            error != null -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(errorText(error), color = MaterialTheme.colorScheme.error)
                FilledTonalButton(onClick = { reloadKey++ }) { Text(stringResource(R.string.retry)) }
            }
            rows == null -> CenteredSpinner()
            else -> {
                val filtered = rows!!.filter {
                    query.isBlank() || it.fullName.contains(query.trim(), ignoreCase = true)
                }
                if (filtered.isEmpty()) {
                    Text(stringResource(R.string.roster_empty), color = MaterialTheme.colorScheme.outline)
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(filtered, key = { it.id }) { row ->
                            RosterRowCard(row, onEnroll = { onEnroll(row.fullName, row.id) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RosterRowCard(row: RosterDto, onEnroll: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(row.fullName, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                val statusRes = if (row.hasPhoto) R.string.roster_enrolled else R.string.roster_needs_photo
                Text(
                    stringResource(statusRes) + (row.shiur?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (row.hasPhoto) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.error,
                )
            }
            FilledTonalButton(onClick = onEnroll) { Text(stringResource(R.string.roster_add)) }
        }
    }
}
