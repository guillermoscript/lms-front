import type { STTProvider, STTConfig, TranscriptionResult, WordTimestamp, FillerEvent, PauseEvent } from '../types'

const FILLER_WORDS = new Set([
  'um', 'uh', 'er', 'ah', 'like', 'you know', 'basically', 'literally',
  'actually', 'so', 'right', 'okay', 'well', 'hmm', 'umm', 'uhh',
  // Spanish fillers
  'este', 'esteee', 'o sea', 'pues', 'bueno', 'verdad', 'entonces',
])

// Pause thresholds (ms)
const PAUSE_HESITATION_MIN = 300
const PAUSE_GOOD_MIN = 800
const PAUSE_MAX = 5000 // above this is probably a stop

export class AssemblyAIProvider implements STTProvider {
  name = 'assemblyai'

  async transcribe(audioUrl: string, _config?: STTConfig): Promise<TranscriptionResult> {
    const apiKey = process.env.ASSEMBLYAI_API_KEY
    if (!apiKey) throw new Error('ASSEMBLYAI_API_KEY is not set')

    // Download the file from Supabase Storage and re-upload to AssemblyAI.
    // This is required because AssemblyAI can't reach local/private Supabase URLs.
    // In production this also avoids exposing signed Storage URLs to a third party.
    const assemblyAiUrl = await this.uploadToAssemblyAI(apiKey, audioUrl)

    // Submit transcription job
    const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: assemblyAiUrl,
        speech_models: ['universal-2'],
        punctuate: true,
        format_text: true,
        disfluencies: true,
      }),
    })

    if (!submitRes.ok) {
      const err = await submitRes.text()
      throw new Error(`AssemblyAI submit failed: ${err}`)
    }

    const { id: transcriptId } = await submitRes.json()

    // Poll for completion
    const transcript = await this.pollTranscript(apiKey, transcriptId)

    return this.parseTranscript(transcript)
  }

  /**
   * Download audio from the source URL (Supabase Storage signed URL)
   * and upload it to AssemblyAI's /v2/upload endpoint.
   * Returns the AssemblyAI-hosted URL for use in transcription.
   */
  private async uploadToAssemblyAI(apiKey: string, sourceUrl: string): Promise<string> {
    // Fetch the audio bytes from Supabase Storage
    const audioRes = await fetch(sourceUrl)
    if (!audioRes.ok) throw new Error(`Failed to download audio from storage: ${audioRes.status}`)

    const audioBuffer = await audioRes.arrayBuffer()

    // Upload to AssemblyAI
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'content-type': 'application/octet-stream',
      },
      body: audioBuffer,
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      throw new Error(`AssemblyAI upload failed: ${err}`)
    }

    const { upload_url } = await uploadRes.json()
    return upload_url
  }

  private async pollTranscript(apiKey: string, id: string): Promise<any> {
    const url = `https://api.assemblyai.com/v2/transcript/${id}`

    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((r) => setTimeout(r, 3000))

      const res = await fetch(url, {
        headers: { authorization: apiKey },
      })

      if (!res.ok) throw new Error(`AssemblyAI poll failed: ${res.status}`)

      const data = await res.json()

      if (data.status === 'completed') return data
      if (data.status === 'error') throw new Error(`AssemblyAI transcription error: ${data.error}`)
    }

    throw new Error('AssemblyAI transcription timed out after 3 minutes')
  }

  private parseTranscript(data: any): TranscriptionResult {
    const rawWords: any[] = data.words ?? []
    const duration_ms = data.audio_duration ? data.audio_duration * 1000 : (rawWords.at(-1)?.end ?? 0)
    const duration_seconds = duration_ms / 1000

    const words: WordTimestamp[] = rawWords.map((w) => ({
      word: w.text,
      start_ms: w.start,
      end_ms: w.end,
      confidence: w.confidence ?? 1,
    }))

    // Detect filler words
    const filler_words: FillerEvent[] = []
    for (const w of words) {
      const normalized = w.word.toLowerCase().replace(/[.,!?]/g, '')
      if (FILLER_WORDS.has(normalized)) {
        const existing = filler_words.find((f) => f.word === normalized)
        if (existing) {
          existing.count++
        } else {
          filler_words.push({ word: normalized, timestamp_ms: w.start_ms, count: 1 })
        }
      }
    }

    // Calculate WPM (exclude filler words from count for a cleaner metric)
    const meaningfulWords = words.filter(
      (w) => !FILLER_WORDS.has(w.word.toLowerCase().replace(/[.,!?]/g, ''))
    )
    const wpm = duration_seconds > 0 ? Math.round((meaningfulWords.length / duration_seconds) * 60) : 0

    // Detect pauses between consecutive words
    const pauses: PauseEvent[] = []
    for (let i = 1; i < words.length; i++) {
      const gap = words[i].start_ms - words[i - 1].end_ms
      if (gap >= PAUSE_HESITATION_MIN && gap <= PAUSE_MAX) {
        pauses.push({
          start_ms: words[i - 1].end_ms,
          end_ms: words[i].start_ms,
          duration_ms: gap,
          type: gap >= PAUSE_GOOD_MIN ? 'good' : 'hesitation',
        })
      }
    }

    return {
      transcript: data.text ?? '',
      words,
      filler_words,
      wpm,
      pauses,
      duration_seconds,
    }
  }
}
