package com.ytc.entry.data

import kotlinx.serialization.Serializable

// ---- Requests ----
@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class TempCreateRequest(
    val label: String,
    val deviceId: String,
    val mode: String, // "once" | "repeat"
    val pin: String? = null,
    val startsAt: String? = null, // ISO, once mode
    val endsAt: String? = null, // ISO, once mode
    val days: List<String>? = null, // repeat mode: "0".."6"
    val timeFrom: String? = null, // "HH:mm"
    val timeTo: String? = null,
    val until: String? = null, // "yyyy-MM-dd"
)

@Serializable
data class RevokeRequest(val id: String)

// ---- Responses ----
@Serializable
data class LoginResponse(val token: String, val name: String = "", val role: String = "")

@Serializable
data class UserDto(val name: String = "", val role: String = "")

@Serializable
data class DoorDto(val id: String, val name: String)

@Serializable
data class BootstrapResponse(
    val user: UserDto = UserDto(),
    val groups: List<String> = emptyList(),
    val doors: List<DoorDto> = emptyList(),
)

@Serializable
data class RosterDto(
    val id: String,
    val studentId: String = "",
    val fullName: String,
    val shiur: String? = null,
    val phone: String? = null,
    val status: String = "",
    val hasPhoto: Boolean = false,
    val enrolleeId: String? = null,
)

@Serializable
data class RosterResponse(val roster: List<RosterDto> = emptyList())

@Serializable
data class EnrollResponse(
    val ok: Boolean = false,
    val userId: Int? = null,
    val name: String? = null,
    val error: String? = null,
)

@Serializable
data class TempDto(
    val id: String,
    val label: String,
    val pin: String,
    val deviceName: String = "",
    val startsAt: String? = null,
    val expiresAt: String,
    val active: Boolean = true,
    val weekly: String? = null,
    val timeBegin: String? = null,
    val timeEnd: String? = null,
)

@Serializable
data class TempListResponse(val pins: List<TempDto> = emptyList())

@Serializable
data class TempCreateResponse(
    val ok: Boolean = false,
    val pin: String? = null,
    val label: String? = null,
    val expiresAt: String? = null,
    val error: String? = null,
)

@Serializable
data class ErrorResponse(val error: String? = null)
