package ru.vitalvoi.cdmm

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import java.io.ByteArrayOutputStream
import kotlin.math.abs
import kotlin.math.sqrt

/** Copies the same microphone samples into Android's recognizer and the final transcription. */
internal class CommandRecording @SuppressLint("MissingPermission") constructor() {
    companion object {
        const val END_SILENCE_MS = 650L
        const val RATE = 16000
        const val ENCODING = AudioFormat.ENCODING_PCM_16BIT
    }

    private val pipe = ParcelFileDescriptor.createPipe()
    val audioSource get() = pipe[0]
    @Volatile private var stopped = false

    @SuppressLint("MissingPermission")
    fun start(level: (Float) -> Unit, finished: (ByteArray) -> Unit) {
        Thread {
            val output = ByteArrayOutputStream()
            try {
                val writer = pipe[1].fileDescriptor
                Os.fcntlInt(writer, OsConstants.F_SETFL, OsConstants.O_NONBLOCK)
                val minimum = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, ENCODING)
                check(minimum > 0)
                val recorder = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE,
                    AudioFormat.CHANNEL_IN_MONO, ENCODING, maxOf(minimum, 6400))
                try {
                    if (!stopped) recorder.startRecording()
                    val chunk = ByteArray(640)
                    var noiseRms = 30.0
                    var steadyRms = 0.0
                    var steadySamples = 0
                    var consecutiveVoiceSamples = 0
                    var lastVoiceSample = 0
                    var speechStarted = false
                    var preview = true
                    while (!stopped && output.size() < RATE * 2 * 15) {
                        val count = recorder.read(chunk, 0, chunk.size)
                        if (count <= 0) break
                        output.write(chunk, 0, count)
                        // A recognizer that ignores the injected source must never stall capture.
                        if (preview) preview = runCatching { Os.write(writer, chunk, 0, count) == count }.getOrDefault(false)
                        var peak = 0
                        var energy = 0.0
                        val samples = count / 2
                        for (i in 0 until count - 1 step 2) {
                            val sample = (chunk[i + 1].toInt() shl 8) or (chunk[i].toInt() and 255)
                            peak = maxOf(peak, abs(sample))
                            energy += sample.toDouble() * sample
                        }
                        val rms = sqrt(energy / samples)
                        if (abs(rms - steadyRms) > maxOf(20.0, steadyRms * 0.2)) {
                            steadyRms = rms
                            steadySamples = 0
                        }
                        steadySamples += samples
                        // Learn a steady background even if it initially crosses the voice threshold.
                        if (steadySamples >= RATE * 350 / 1000 && rms > noiseRms) {
                            noiseRms += (rms - noiseRms) * 0.2
                        }
                        val voiceThreshold = maxOf(75.0, noiseRms * 2.5)
                        val recordedSamples = output.size() / 2
                        if (rms >= voiceThreshold) {
                            consecutiveVoiceSamples += samples
                            // Require sustained energy so a click does not restart the pause.
                            if (consecutiveVoiceSamples >= RATE * 40 / 1000) {
                                lastVoiceSample = recordedSamples
                            }
                            if (consecutiveVoiceSamples >= RATE * 60 / 1000) speechStarted = true
                        } else {
                            consecutiveVoiceSamples = 0
                            noiseRms += (rms - noiseRms) * 0.05
                        }
                        level((peak / 7000f).coerceAtMost(1f))
                        if (speechStarted && recordedSamples - lastVoiceSample >= RATE * END_SILENCE_MS / 1000) break
                        if (!speechStarted && recordedSamples >= RATE * 5) break
                    }
                    if (!speechStarted) output.reset()
                } finally {
                    recorder.release()
                }
            } catch (_: Exception) {
                output.reset()
            } finally {
                pipe[1].close()
                finished(output.toByteArray())
            }
        }.start()
    }

    fun stop() { stopped = true }

    fun close() {
        stop()
        audioSource.close()
    }
}
