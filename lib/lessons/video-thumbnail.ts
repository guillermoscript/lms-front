/** YouTube video id from a watch / youtu.be / embed / shorts / live URL, else null. */
export function extractYouTubeId(url: string): string | null {
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

/** Cover for a lesson row: the teacher's image, else the YouTube poster, else null. */
export function lessonThumbnail(lesson: { image: string | null; video_url: string | null }): string | null {
  if (lesson.image) return lesson.image
  const id = lesson.video_url ? extractYouTubeId(lesson.video_url) : null
  return id && /^[\w-]{6,}$/.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null
}
