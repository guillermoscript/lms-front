// Server-side only — fetches external URLs and writes via the caller's client.
import type { SupabaseClient } from '@supabase/supabase-js'

/** One caption segment with its start time in seconds. */
export interface TranscriptSegment {
  start: number
  text: string
}

/** Cached transcript shape stored in lessons.transcript (jsonb). */
export interface LessonTranscript {
  source: 'youtube_captions'
  video_url: string
  language: string
  segments: TranscriptSegment[]
  fetched_at: string
}

interface LessonForTranscript {
  id: number
  video_url: string | null
  transcript: LessonTranscript | null
}

const FETCH_TIMEOUT_MS = 10_000
const MAX_SEGMENTS = 600

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null
    if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      const embed = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{6,})/)
      if (embed) return embed[2]
    }
  } catch {
    return null
  }
  return null
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      ...init?.headers,
    },
  })
}

interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string
}

/**
 * List caption tracks via YouTube's Innertube player endpoint (the watch
 * page no longer embeds captionTracks). Unofficial but the same API every
 * client uses; every failure path returns null and the caller degrades to
 * MDX-only generation.
 */
async function listCaptionTracks(videoId: string): Promise<CaptionTrack[] | null> {
  const res = await fetchWithTimeout('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30 },
      },
      videoId,
    }),
  })
  if (!res.ok) return null
  try {
    const data = (await res.json()) as {
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } }
    }
    return data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? null
  } catch {
    return null
  }
}

function pickTrack(tracks: CaptionTrack[], preferredLanguages: string[]): CaptionTrack | null {
  const manual = tracks.filter((t) => t.kind !== 'asr')
  for (const lang of preferredLanguages) {
    const match =
      manual.find((t) => t.languageCode.startsWith(lang)) ??
      tracks.find((t) => t.languageCode.startsWith(lang))
    if (match) return match
  }
  return manual[0] ?? tracks[0] ?? null
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Fetch and parse a caption track. The timedtext endpoint answers in either
 * json3 (`{"events": ...}`) or XML (`<timedtext format="3">`) depending on
 * the client the track list came from — handle both.
 */
async function fetchSegments(track: CaptionTrack): Promise<TranscriptSegment[] | null> {
  const url = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`
  const res = await fetchWithTimeout(url)
  if (!res.ok) return null
  const raw = (await res.text()).trim()
  if (!raw) return null

  const segments: TranscriptSegment[] = []
  const push = (startMs: number, text: string) => {
    const cleaned = text.replace(/\s+/g, ' ').trim()
    if (!cleaned) return false
    segments.push({ start: Math.round((startMs / 1000) * 10) / 10, text: cleaned })
    return segments.length >= MAX_SEGMENTS
  }

  if (raw.startsWith('{')) {
    try {
      const data = JSON.parse(raw) as {
        events?: { tStartMs?: number; segs?: { utf8?: string }[] }[]
      }
      for (const event of data.events ?? []) {
        const text = (event.segs ?? []).map((s) => s.utf8 ?? '').join('')
        if (push(event.tStartMs ?? 0, text)) break
      }
    } catch {
      return null
    }
  } else {
    // XML: <p t="1200" d="2160">caption text</p> (t in ms; may contain <s> spans)
    const pattern = /<p[^>]*\bt="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
    let match: RegExpExecArray | null
    while ((match = pattern.exec(raw)) !== null) {
      const text = decodeXmlEntities(match[2].replace(/<[^>]+>/g, ''))
      if (push(Number(match[1]), text)) break
    }
  }

  return segments.length > 0 ? segments : null
}

/**
 * Get the transcript for a lesson's video, using the cached copy in
 * lessons.transcript when it matches the current video_url, otherwise
 * fetching YouTube caption tracks and caching the result.
 *
 * Best-effort by design: any failure (non-YouTube URL, no captions, network
 * error) returns null and question generation proceeds from the lesson MDX
 * alone. `client` must be able to update the lesson row (caller has already
 * verified ownership).
 */
export async function getLessonTranscript(
  client: SupabaseClient,
  lesson: LessonForTranscript,
  preferredLanguages: string[] = ['en', 'es']
): Promise<LessonTranscript | null> {
  const videoUrl = lesson.video_url?.trim()
  if (!videoUrl) return null

  if (lesson.transcript && lesson.transcript.video_url === videoUrl) {
    return lesson.transcript
  }

  const videoId = extractYouTubeId(videoUrl)
  if (!videoId) return null

  try {
    const tracks = await listCaptionTracks(videoId)
    if (!tracks || tracks.length === 0) return null

    const track = pickTrack(tracks, preferredLanguages)
    if (!track) return null

    const segments = await fetchSegments(track)
    if (!segments) return null

    const transcript: LessonTranscript = {
      source: 'youtube_captions',
      video_url: videoUrl,
      language: track.languageCode,
      segments,
      fetched_at: new Date().toISOString(),
    }

    await client.from('lessons').update({ transcript }).eq('id', lesson.id)

    return transcript
  } catch (err) {
    console.error('getLessonTranscript failed:', err)
    return null
  }
}
