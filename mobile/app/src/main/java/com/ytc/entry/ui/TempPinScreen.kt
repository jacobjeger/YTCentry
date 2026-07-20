package com.ytc.entry.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ytc.entry.R
import com.ytc.entry.data.Api
import com.ytc.entry.data.ApiResult
import com.ytc.entry.data.BootstrapResponse
import com.ytc.entry.data.TempCreateRequest
import com.ytc.entry.data.TempDto
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Calendar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TempPinScreen(
    api: Api,
    boot: BootstrapResponse?,
    onBoot: (BootstrapResponse) -> Unit,
    onUnauthorized: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        if (boot == null) {
            when (val r = api.bootstrap()) {
                is ApiResult.Ok -> onBoot(r.value)
                is ApiResult.Err -> if (r.unauthorized) onUnauthorized()
            }
        }
    }

    val doors = boot?.doors ?: emptyList()
    var mode by remember { mutableStateOf("once") }
    var label by remember { mutableStateOf("") }
    var doorId by remember(boot) { mutableStateOf(doors.firstOrNull()?.id ?: "") }
    var pin by remember { mutableStateOf("") }

    // once
    var endsAt by remember { mutableStateOf(Instant.now().plusSeconds(24 * 3600)) }
    // repeat
    val days = remember { mutableStateOf(setOf<Int>()) }
    var timeFrom by remember { mutableStateOf("07:00") }
    var timeTo by remember { mutableStateOf("09:00") }
    var until by remember { mutableStateOf(LocalDate.now().plusDays(30)) }

    var creating by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var created by remember { mutableStateOf<Pair<String, String>?>(null) } // pin, label

    var pins by remember { mutableStateOf<List<TempDto>?>(null) }
    var reloadKey by remember { mutableStateOf(0) }
    LaunchedEffect(reloadKey) {
        when (val r = api.listTemp()) {
            is ApiResult.Ok -> pins = r.value
            is ApiResult.Err -> if (r.unauthorized) onUnauthorized()
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            stringResource(R.string.temp_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )

        // Created PIN banner
        created?.let { (code, who) ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.pin_created, who), style = MaterialTheme.typography.bodyMedium)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(code, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
                        FilledTonalButton(onClick = { copyToClipboard(context, code) }) {
                            Text(stringResource(R.string.copy))
                        }
                    }
                }
            }
        }

        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            SegmentedButton(
                selected = mode == "once",
                onClick = { mode = "once" },
                shape = SegmentedButtonDefaults.itemShape(0, 2),
            ) { Text(stringResource(R.string.temp_mode_once)) }
            SegmentedButton(
                selected = mode == "repeat",
                onClick = { mode = "repeat" },
                shape = SegmentedButtonDefaults.itemShape(1, 2),
            ) { Text(stringResource(R.string.temp_mode_repeat)) }
        }

        OutlinedTextField(
            value = label,
            onValueChange = { label = it },
            label = { Text(stringResource(R.string.temp_label)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        if (doors.size > 1) {
            LabeledDropdown(
                label = stringResource(R.string.temp_door),
                options = doors.map { it.id to it.name },
                selected = doorId,
                onSelect = { doorId = it },
                modifier = Modifier.fillMaxWidth(),
            )
        }

        if (mode == "once") {
            val fmt = remember { DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT).withZone(ZoneId.systemDefault()) }
            Text(stringResource(R.string.temp_ends, fmt.format(endsAt)))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { endsAt = Instant.now().plusSeconds(2 * 3600) }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.plus_2h)) }
                OutlinedButton(onClick = { endsAt = Instant.now().plusSeconds(4 * 3600) }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.plus_4h)) }
                OutlinedButton(onClick = { endsAt = Instant.now().plusSeconds(24 * 3600) }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.plus_1d)) }
                OutlinedButton(onClick = { endsAt = Instant.now().plusSeconds(7 * 24 * 3600) }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.plus_1w)) }
            }
        } else {
            Text(stringResource(R.string.repeat_days))
            val letters = stringArrayResource(R.array.weekday_letters)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (d in 0..6) {
                    FilterChip(
                        selected = days.value.contains(d),
                        onClick = {
                            days.value = days.value.toMutableSet().also {
                                if (!it.add(d)) it.remove(d)
                            }
                        },
                        label = { Text(letters[d]) },
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { pickTime(context, timeFrom) { timeFrom = it } }, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.time_from) + "  " + timeFrom)
                }
                OutlinedButton(onClick = { pickTime(context, timeTo) { timeTo = it } }, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.time_to) + "  " + timeTo)
                }
            }
            val dfmt = remember { DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM) }
            OutlinedButton(onClick = { pickDate(context, until) { until = it } }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.until) + "  " + dfmt.format(until))
            }
        }

        OutlinedTextField(
            value = pin,
            onValueChange = { if (it.all { c -> c.isDigit() } && it.length <= 6) pin = it },
            label = { Text(stringResource(R.string.custom_pin)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )

        error?.let { Text(errorText(it), color = MaterialTheme.colorScheme.error) }

        LoadingButton(
            text = stringResource(R.string.create_pin),
            loading = creating,
            enabled = label.isNotBlank() && doorId.isNotBlank() &&
                (mode == "once" || days.value.isNotEmpty()),
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                if (pin.isNotEmpty() && pin.length < 4) { error = "bad_pin"; return@LoadingButton }
                creating = true
                error = null
                val req = if (mode == "once") {
                    TempCreateRequest(
                        label = label.trim(), deviceId = doorId, mode = "once",
                        pin = pin.ifBlank { null },
                        endsAt = endsAt.toString(),
                    )
                } else {
                    TempCreateRequest(
                        label = label.trim(), deviceId = doorId, mode = "repeat",
                        pin = pin.ifBlank { null },
                        days = days.value.sorted().map { it.toString() },
                        timeFrom = timeFrom, timeTo = timeTo,
                        until = until.toString(),
                    )
                }
                scope.launch {
                    val r = api.createTemp(req)
                    creating = false
                    when (r) {
                        is ApiResult.Ok ->
                            if (r.value.ok && r.value.pin != null) {
                                created = r.value.pin!! to (r.value.label ?: label)
                                pin = ""; reloadKey++
                            } else error = r.value.error
                        is ApiResult.Err -> if (r.unauthorized) onUnauthorized() else error = r.message
                    }
                }
            },
        )

        // Active PINs
        Text(
            stringResource(R.string.active_pins),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 8.dp),
        )
        when (val list = pins) {
            null -> CenteredSpinner()
            else -> if (list.isEmpty()) {
                Text(stringResource(R.string.no_active_pins), color = MaterialTheme.colorScheme.outline)
            } else {
                list.forEach { p ->
                    ActivePinCard(p, onRevoke = {
                        scope.launch {
                            when (val r = api.revokeTemp(p.id)) {
                                is ApiResult.Ok -> reloadKey++
                                is ApiResult.Err -> if (r.unauthorized) onUnauthorized() else error = r.message
                            }
                        }
                    })
                }
            }
        }
    }
}

@Composable
private fun ActivePinCard(p: TempDto, onRevoke: () -> Unit) {
    val fmt = remember { DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT).withZone(ZoneId.systemDefault()) }
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(p.label, fontWeight = FontWeight.SemiBold)
                    Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = CircleShape) {
                        Text(p.pin, modifier = Modifier.padding(horizontal = 10.dp, vertical = 2.dp))
                    }
                }
                val sub = if (p.weekly != null && p.timeBegin != null && p.timeEnd != null) {
                    stringResource(R.string.temp_recurring, p.timeBegin, p.timeEnd)
                } else {
                    stringResource(R.string.temp_ends, runCatching { fmt.format(Instant.parse(p.expiresAt)) }.getOrDefault(p.expiresAt))
                }
                Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
            }
            TextButton(onClick = onRevoke) { Text(stringResource(R.string.revoke), color = MaterialTheme.colorScheme.error) }
        }
    }
}

private fun pickTime(context: Context, current: String, onPicked: (String) -> Unit) {
    val parts = current.split(":")
    val h = parts.getOrNull(0)?.toIntOrNull() ?: 7
    val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
    TimePickerDialog(context, { _, hour, minute ->
        onPicked("%02d:%02d".format(hour, minute))
    }, h, m, true).show()
}

private fun pickDate(context: Context, current: LocalDate, onPicked: (LocalDate) -> Unit) {
    val cal = Calendar.getInstance()
    DatePickerDialog(
        context,
        { _, y, mo, d -> onPicked(LocalDate.of(y, mo + 1, d)) },
        current.year, current.monthValue - 1, current.dayOfMonth,
    ).apply { datePicker.minDate = cal.timeInMillis }.show()
}

private fun copyToClipboard(context: Context, text: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("PIN", text))
}
