package com.ytc.entry.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/** Result of an API call. `unauthorized` drives an automatic sign-out. */
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class Err(val message: String, val unauthorized: Boolean = false) : ApiResult<Nothing>
}

private object Http {
    val client = HttpClient(CIO) {
        expectSuccess = false
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true; isLenient = true })
        }
        install(HttpTimeout) {
            requestTimeoutMillis = 90_000
            connectTimeoutMillis = 15_000
            socketTimeoutMillis = 90_000
        }
    }
}

/**
 * Authenticated client bound to one base URL + bearer token. Every method turns
 * transport/HTTP failures into an ApiResult; a 401 flips `unauthorized` so the
 * caller (Root) can drop the token and return to Login.
 */
class Api(
    private val baseUrl: String,
    private val token: String,
) {
    private fun url(path: String) = "$baseUrl$path"

    suspend fun bootstrap(): ApiResult<BootstrapResponse> = safe {
        val resp = Http.client.get(url("/api/mobile/bootstrap")) { auth() }
        resp.toResult { it.body<BootstrapResponse>() }
    }

    suspend fun roster(): ApiResult<List<RosterDto>> = safe {
        val resp = Http.client.get(url("/api/mobile/roster")) { auth() }
        resp.toResult { it.body<RosterResponse>().roster }
    }

    suspend fun enroll(
        displayName: String,
        groupName: String?,
        pin: String?,
        deviceIds: List<String>,
        rosterEntryId: String?,
        photo: ByteArray,
    ): ApiResult<EnrollResponse> = safe {
        val resp = Http.client.submitFormWithBinaryData(
            url = url("/api/mobile/enroll"),
            formData = formData {
                append("displayName", displayName)
                if (!groupName.isNullOrBlank()) append("groupName", groupName)
                if (!pin.isNullOrBlank()) append("pin", pin)
                if (!rosterEntryId.isNullOrBlank()) append("rosterEntryId", rosterEntryId)
                append("deviceIds", deviceIds.joinToString(","))
                append("photo", photo, Headers.build {
                    append(HttpHeaders.ContentType, "image/jpeg")
                    append(HttpHeaders.ContentDisposition, "filename=\"photo.jpg\"")
                })
            },
        ) { auth() }
        if (resp.status.isSuccess()) {
            ApiResult.Ok(resp.body<EnrollResponse>())
        } else {
            val msg = runCatching { resp.body<EnrollResponse>().error }.getOrNull()
            ApiResult.Err(msg ?: "error_generic", resp.status.value == 401)
        }
    }

    suspend fun listTemp(): ApiResult<List<TempDto>> = safe {
        val resp = Http.client.get(url("/api/mobile/temp")) { auth() }
        resp.toResult { it.body<TempListResponse>().pins }
    }

    suspend fun createTemp(req: TempCreateRequest): ApiResult<TempCreateResponse> = safe {
        val resp = Http.client.post(url("/api/mobile/temp")) {
            auth(); contentType(ContentType.Application.Json); setBody(req)
        }
        if (resp.status.isSuccess()) {
            ApiResult.Ok(resp.body<TempCreateResponse>())
        } else {
            val msg = runCatching { resp.body<TempCreateResponse>().error }.getOrNull()
            ApiResult.Err(msg ?: "error_generic", resp.status.value == 401)
        }
    }

    suspend fun revokeTemp(id: String): ApiResult<Unit> = safe {
        val resp = Http.client.post(url("/api/mobile/temp/revoke")) {
            auth(); contentType(ContentType.Application.Json); setBody(RevokeRequest(id))
        }
        resp.toResult { }
    }

    private fun io.ktor.client.request.HttpRequestBuilder.auth() {
        header(HttpHeaders.Authorization, "Bearer $token")
    }

    companion object {
        suspend fun login(baseUrl: String, email: String, password: String): ApiResult<LoginResponse> =
            safe {
                val resp = Http.client.post("$baseUrl/api/mobile/login") {
                    contentType(ContentType.Application.Json)
                    setBody(LoginRequest(email, password))
                }
                if (resp.status.isSuccess()) {
                    ApiResult.Ok(resp.body<LoginResponse>())
                } else {
                    ApiResult.Err(
                        if (resp.status.value == 401) "login_failed" else "server_unreachable",
                        false,
                    )
                }
            }

        /** Wrap transport exceptions (offline, DNS, TLS) as a reachability error. */
        private suspend fun <T> safe(block: suspend () -> ApiResult<T>): ApiResult<T> =
            try {
                block()
            } catch (e: Exception) {
                ApiResult.Err("server_unreachable")
            }

        private suspend fun <T> HttpResponse.toResult(map: suspend (HttpResponse) -> T): ApiResult<T> =
            if (status.isSuccess()) {
                ApiResult.Ok(map(this))
            } else {
                val msg = runCatching { body<ErrorResponse>().error }.getOrNull()
                ApiResult.Err(msg ?: "error_generic", status.value == 401)
            }
    }
}
