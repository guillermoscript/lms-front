import type { TenantTranscriber } from '@/lib/ai/tenant-ai'
import { buildTranscriptionResult } from '../metrics'
import type { STTConfig, STTProvider, TranscriptionResult } from '../types'

/**
 * STT through the school's own transcriber (`ai.getTranscriber()`): whichever of
 * AssemblyAI / OpenAI / Groq the school configured, with its key. This class
 * holds no key and reads no environment variable; it only adds the speech
 * metrics on top of the word-level transcript.
 */
export class TenantSttProvider implements STTProvider {
  readonly name: string

  constructor(private readonly transcriber: Pick<TenantTranscriber, 'providerId' | 'transcribe'>) {
    this.name = transcriber.providerId
  }

  async transcribe(audio: Buffer | Uint8Array | URL, config?: STTConfig): Promise<TranscriptionResult> {
    const result = await this.transcriber.transcribe(audio, {
      language: config?.language,
      verbatim: config?.verbatim,
    })
    return buildTranscriptionResult({
      text: result.text,
      words: result.words,
      durationSeconds: result.durationSeconds,
    })
  }
}
