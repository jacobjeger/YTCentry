package com.ytc.entry.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import java.io.ByteArrayOutputStream

/**
 * Turn a picked/captured image Uri into JPEG bytes ready to upload.
 *
 * The server (sharp) already auto-orients EXIF and downscales, so for normal
 * photos we upload the raw bytes untouched. We only re-encode when a file is
 * very large (some gallery images are 20 MB+, over the API's 15 MB cap) — in
 * that case we sample it down and bake in the EXIF rotation ourselves.
 */
object Images {
    private const val RAW_CEILING = 12 * 1024 * 1024 // re-encode above this
    private const val TARGET_MAX_DIM = 1600
    private const val JPEG_QUALITY = 90

    fun fromUri(context: Context, uri: Uri): ByteArray? {
        val raw = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
        if (raw.size <= RAW_CEILING) return raw
        return downscale(context, uri, raw) ?: raw
    }

    private fun downscale(context: Context, uri: Uri, raw: ByteArray): ByteArray? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(raw, 0, raw.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        val longest = maxOf(bounds.outWidth, bounds.outHeight)
        while (longest / sample > TARGET_MAX_DIM * 2) sample *= 2

        val decoded = BitmapFactory.decodeByteArray(
            raw, 0, raw.size,
            BitmapFactory.Options().apply { inSampleSize = sample },
        ) ?: return null

        val rotated = applyExif(context, uri, decoded)
        return ByteArrayOutputStream().use { out ->
            rotated.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
            out.toByteArray()
        }
    }

    private fun applyExif(context: Context, uri: Uri, bitmap: Bitmap): Bitmap {
        val orientation = try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                ExifInterface(input).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL,
                )
            } ?: ExifInterface.ORIENTATION_NORMAL
        } catch (e: Exception) {
            ExifInterface.ORIENTATION_NORMAL
        }
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            else -> return bitmap
        }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }
}
