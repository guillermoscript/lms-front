// Phase 2 stub: VAPI real-time conversation provider
// Implement when VAPI integration is ready

import type { STTProvider, STTConfig, TranscriptionResult } from '../types'

export class VapiProvider implements STTProvider {
  name = 'vapi'

  async transcribe(_audioUrl: string, _config?: STTConfig): Promise<TranscriptionResult> {
    throw new Error('VapiProvider is not yet implemented. Use for Phase 2 real-time conversation exercises.')
  }
}
