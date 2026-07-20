package com.ytc.entry.ui

import android.Manifest
import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.ytc.entry.R
import com.ytc.entry.data.Api
import com.ytc.entry.data.ApiResult
import com.ytc.entry.data.BootstrapResponse
import com.ytc.entry.util.Images
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@Composable
fun AddPersonScreen(
    api: Api,
    boot: BootstrapResponse?,
    onBoot: (BootstrapResponse) -> Unit,
    prefillName: String?,
    prefillRosterId: String?,
    onUnauthorized: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var loadError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        if (boot == null) {
            when (val r = api.bootstrap()) {
                is ApiResult.Ok -> onBoot(r.value)
                is ApiResult.Err -> if (r.unauthorized) onUnauthorized() else loadError = r.message
            }
        }
    }

    // Form state (prefill from a roster tap).
    var name by remember(prefillName) { mutableStateOf(prefillName ?: "") }
    var group by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var doorId by remember(boot) { mutableStateOf(boot?.doors?.firstOrNull()?.id ?: "") }
    var photo by remember { mutableStateOf<ByteArray?>(null) }

    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<Pair<String, Int>?>(null) }
    var camDenied by remember { mutableStateOf(false) }

    fun readPhoto(uri: Uri?) {
        if (uri == null) return
        scope.launch {
            val bytes = withContext(Dispatchers.IO) { Images.fromUri(context, uri) }
            if (bytes != null) { photo = bytes; error = null }
        }
    }

    var pendingCamera by remember { mutableStateOf<Uri?>(null) }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (ok) readPhoto(pendingCamera)
    }
    val pickImage = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri -> readPhoto(uri) }

    fun launchCamera() {
        val uri = createCaptureUri(context)
        pendingCamera = uri
        takePicture.launch(uri)
    }
    val requestCamera = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) launchCamera() else camDenied = true }

    fun onTakePhoto() {
        camDenied = false
        val has = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
        if (has) launchCamera() else requestCamera.launch(Manifest.permission.CAMERA)
    }

    // ---- Success view ----
    success?.let { (who, id) ->
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("✅", style = MaterialTheme.typography.displayMedium)
            Text(
                stringResource(R.string.enroll_success, who, id),
                style = MaterialTheme.typography.titleMedium,
            )
            OutlinedButton(onClick = {
                success = null
                name = ""; group = ""; pin = ""; photo = null
            }) { Text(stringResource(R.string.add_another)) }
        }
        return
    }

    val doors = boot?.doors ?: emptyList()

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            stringResource(R.string.add_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )

        // Photo area
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val bmp = remember(photo) {
                    photo?.let { BitmapFactory.decodeByteArray(it, 0, it.size)?.asImageBitmap() }
                }
                if (bmp != null) {
                    Image(
                        bitmap = bmp,
                        contentDescription = stringResource(R.string.photo),
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(1f)
                            .clip(RoundedCornerShape(12.dp)),
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = ::onTakePhoto, modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.take_photo))
                    }
                    OutlinedButton(
                        onClick = {
                            pickImage.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                            )
                        },
                        modifier = Modifier.weight(1f),
                    ) { Text(stringResource(R.string.choose_gallery)) }
                }
                if (camDenied) {
                    Text(
                        stringResource(R.string.camera_denied),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }

        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text(stringResource(R.string.name)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        LabeledDropdown(
            label = stringResource(R.string.group),
            options = listOf("" to stringResource(R.string.group_none)) +
                (boot?.groups?.map { it to it } ?: emptyList()),
            selected = group,
            onSelect = { group = it },
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = pin,
            onValueChange = { if (it.all { c -> c.isDigit() } && it.length <= 6) pin = it },
            label = { Text(stringResource(R.string.pin_optional)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )

        if (doors.size > 1) {
            LabeledDropdown(
                label = stringResource(R.string.door),
                options = doors.map { it.id to it.name },
                selected = doorId,
                onSelect = { doorId = it },
                modifier = Modifier.fillMaxWidth(),
            )
        }

        if (doors.isEmpty() && boot != null) {
            Text(
                stringResource(R.string.no_doors),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        (error ?: loadError)?.let {
            Text(
                errorText(it),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        LoadingButton(
            text = stringResource(R.string.enroll),
            loading = submitting,
            enabled = name.isNotBlank() && photo != null && doors.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                val bytes = photo ?: return@LoadingButton
                if (pin.isNotEmpty() && pin.length < 4) { error = "bad_pin"; return@LoadingButton }
                submitting = true
                error = null
                scope.launch {
                    val deviceIds = if (doorId.isNotBlank()) listOf(doorId) else emptyList()
                    val r = api.enroll(
                        displayName = name.trim(),
                        groupName = group.ifBlank { null },
                        pin = pin.ifBlank { null },
                        deviceIds = deviceIds,
                        rosterEntryId = prefillRosterId,
                        photo = bytes,
                    )
                    submitting = false
                    when (r) {
                        is ApiResult.Ok ->
                            if (r.value.ok) success = (r.value.name ?: name) to (r.value.userId ?: 0)
                            else error = r.value.error
                        is ApiResult.Err -> if (r.unauthorized) onUnauthorized() else error = r.message
                    }
                }
            },
        )
    }
}

private fun createCaptureUri(context: Context): Uri {
    val dir = File(context.cacheDir, "captures").apply { mkdirs() }
    val file = File(dir, "cap_${System.nanoTime()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}
