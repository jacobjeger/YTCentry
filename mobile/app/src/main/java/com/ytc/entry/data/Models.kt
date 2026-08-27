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

/** Approve a queued photo: by roster [studentId], or under a typed [displayName]. */
@Serializable
data class ApproveRequest(
    val submissionId: String,
    val studentId: String? = null,
    val displayName: String? = null,
    val groupName: String? = null,
    val pin: String? = null,
    /** Doors to enrol on. Omitted = the server's everyday-door default. */
    val deviceIds: List<String>? = null,
)

@Serializable
data class SubmissionIdRequest(val submissionId: String)

/** Pick which image from the email is the person's photo. */
@Serializable
data class ChoosePhotoRequest(val submissionId: String, val path: String)

// ---- Responses ----
@Serializable
data class LoginResponse(val token: String, val name: String = "", val role: String = "")

@Serializable
data class UserDto(val name: String = "", val role: String = "")

@Serializable
data class DoorDto(
    val id: String,
    val name: String,
    /** An everyday door: pre-ticked. Restricted doors must be chosen. */
    val allowEmail: Boolean = false,
)

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

/** One image that arrived with a submission. [path] identifies it server-side. */
@Serializable
data class SubmissionPhotoDto(val path: String, val url: String)

/** A roster person the matcher thinks this photo might be. */
@Serializable
data class MatchCandidateDto(
    val studentId: String,
    val name: String,
    val score: Double = 0.0,
)

@Serializable
data class SubmissionDto(
    val id: String,
    val source: String = "email", // "email" | "door"
    val from: String = "",
    val subject: String = "",
    val parsedName: String? = null,
    val faceValid: Boolean? = null,
    val faceNote: String? = null,
    val createdAt: String = "",
    /** Every image from the email, the one in use first. */
    val photos: List<SubmissionPhotoDto> = emptyList(),
    val candidates: List<MatchCandidateDto> = emptyList(),
)

@Serializable
data class ReviewResponse(
    val submissions: List<SubmissionDto> = emptyList(),
    val doors: List<DoorDto> = emptyList(),
)

@Serializable
data class ApproveResponse(
    val ok: Boolean = false,
    /** True when the door was unreachable: saved and queued, not a failure. */
    val queued: Boolean = false,
    val userId: Int? = null,
    val name: String? = null,
    val error: String? = null,
)

@Serializable
data class ErrorResponse(val error: String? = null)
