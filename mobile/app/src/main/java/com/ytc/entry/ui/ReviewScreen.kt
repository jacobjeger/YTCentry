package com.ytc.entry.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ytc.entry.R
import com.ytc.entry.data.Api
import com.ytc.entry.data.ApiResult
import com.ytc.entry.data.ApproveRequest
import com.ytc.entry.data.SubmissionDto
import com.ytc.entry.data.fetchImageBytes
import kotlinx.coroutines.launch

/**
 * Review Queue: photos that arrived by email (and denied door scans) waiting to
 * be approved onto the door.
 *
 * Follows the same shape as RosterScreen — the screen owns its list and reload
 * key, and each card owns only its own in-flight flag, so approving one person
 * never blocks reviewing the next.
 */
@Composable
fun ReviewScreen(api: Api, onUnauthorized: () -> Unit) {
    var rows by remember { mutableStateOf<List<SubmissionDto>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableStateOf(0) }
    // Cards that have been dealt with, hidden immediately so the queue doesn't
    // appear to stall while the list refetches.
    var done by remember { mutableStateOf(setOf<String>()) }

    LaunchedEffect(reloadKey) {
        rows = null
        error = null
        when (val r = api.review()) {
            is ApiResult.Ok -> rows = r.value
            is ApiResult.Err -> if (r.unauthorized) onUnauthorized() else error = r.message
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            stringResource(R.string.review_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )

        when {
            error != null -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(errorText(error), color = MaterialTheme.colorScheme.error)
                FilledTonalButton(onClick = { reloadKey++ }) { Text(stringResource(R.string.retry)) }
            }
            rows == null -> CenteredSpinner()
            else -> {
                val pending = rows!!.filter { it.id !in done }
                if (pending.isEmpty()) {
                    Text(
                        stringResource(R.string.review_empty),
                        color = MaterialTheme.colorScheme.outline,
                    )
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(pending, key = { it.id }) { item ->
                            SubmissionCard(
                                api = api,
                                item = item,
                                onUnauthorized = onUnauthorized,
                                onDone = { done = done + item.id },
                            )
                        }
                    }
                }
            }
        }
    }
}

// FlowRow wraps the alternate-photo thumbnails onto a second line on narrow
// phones. Still experimental in this Compose BOM, hence the opt-in.
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SubmissionCard(
    api: Api,
    item: SubmissionDto,
    onUnauthorized: () -> Unit,
    onDone: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var name by remember(item.id) { mutableStateOf(item.parsedName ?: "") }
    var busy by remember(item.id) { mutableStateOf(false) }
    var cardError by remember(item.id) { mutableStateOf<String?>(null) }
    // Which image is in use. The server keeps the chosen one first, so index 0
    // is the current photo until staff tap another.
    var chosen by remember(item.id) { mutableStateOf(item.photos.firstOrNull()?.path) }

    fun run(block: suspend () -> ApiResult<*>) {
        if (busy) return
        busy = true
        cardError = null
        scope.launch {
            when (val r = block()) {
                is ApiResult.Ok -> onDone()
                is ApiResult.Err -> {
                    if (r.unauthorized) onUnauthorized() else cardError = r.message
                    busy = false
                }
            }
        }
    }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                if (item.source == "door") stringResource(R.string.review_source_door)
                else item.from,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )

            val current = item.photos.firstOrNull { it.path == chosen } ?: item.photos.firstOrNull()
            if (current == null) {
                Text(
                    stringResource(R.string.review_no_image),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                RemoteImage(
                    url = current.url,
                    modifier = Modifier.fillMaxWidth().aspectRatio(1f),
                )
            }

            // More than one image means a signature logo rode along with the
            // real photo — let staff say which one is the person.
            if (item.photos.size > 1) {
                Text(
                    stringResource(R.string.review_choose_photo),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item.photos.forEach { photo ->
                        val selected = photo.path == chosen
                        RemoteImage(
                            url = photo.url,
                            modifier = Modifier
                                .size(56.dp)
                                .border(
                                    width = if (selected) 3.dp else 1.dp,
                                    color = if (selected) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.outlineVariant,
                                    shape = RoundedCornerShape(8.dp),
                                )
                                .clickable(enabled = !busy && !selected) {
                                    chosen = photo.path
                                    scope.launch {
                                        api.chooseSubmissionPhoto(item.id, photo.path)
                                    }
                                },
                        )
                    }
                }
            }

            if (item.faceValid == false && !item.faceNote.isNullOrBlank()) {
                Text(
                    item.faceNote,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(stringResource(R.string.review_name)) },
                singleLine = true,
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            )

            // Roster matches the server proposed — one tap enrolls the right
            // person without retyping a name.
            item.candidates.forEach { c ->
                OutlinedButton(
                    enabled = !busy,
                    onClick = {
                        run {
                            api.approve(
                                ApproveRequest(submissionId = item.id, studentId = c.studentId),
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.review_approve_as, c.name))
                }
            }

            if (cardError != null) {
                Text(errorText(cardError), color = MaterialTheme.colorScheme.error)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LoadingButton(
                    text = stringResource(R.string.review_add),
                    loading = busy,
                    enabled = name.isNotBlank() && item.photos.isNotEmpty(),
                    modifier = Modifier.weight(1f),
                ) {
                    run {
                        api.approve(ApproveRequest(submissionId = item.id, displayName = name.trim()))
                    }
                }
                OutlinedButton(
                    enabled = !busy,
                    onClick = { run { api.rejectSubmission(item.id) } },
                ) {
                    Text(stringResource(R.string.review_reject))
                }
            }
        }
    }
}

/**
 * Load a signed image URL into a bitmap.
 *
 * Deliberately not a caching image library: the app has no such dependency, the
 * queue is short, and the URLs are already short-lived signatures. Keyed on the
 * url so recycled rows never show the previous person's face.
 */
@Composable
private fun RemoteImage(url: String, modifier: Modifier = Modifier) {
    var bitmap by remember(url) { mutableStateOf<ImageBitmap?>(null) }
    var failed by remember(url) { mutableStateOf(false) }

    LaunchedEffect(url) {
        val bytes = fetchImageBytes(url)
        val decoded = bytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
        if (decoded == null) failed = true else bitmap = decoded.asImageBitmap()
    }

    Box(
        modifier
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center,
    ) {
        when {
            bitmap != null -> Image(
                bitmap = bitmap!!,
                contentDescription = stringResource(R.string.review_photo_alt),
                // CONTAIN, not crop: this is the photo being judged.
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
            )
            failed -> Text("—", color = MaterialTheme.colorScheme.outline)
            else -> CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        }
    }
}
