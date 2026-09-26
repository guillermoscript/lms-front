'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { IconSend, IconPhoto, IconPlus, IconX, IconUser, IconChartBar } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { createPoll, createPost, uploadCommunityAsset } from '@/app/actions/community'
import { MAX_POST_MEDIA } from '@/lib/community/media'

interface PostComposerProps {
  scope: 'school' | 'course'
  courseId?: number
  userRole: string
  /** The school lets this viewer create polls (always true for staff). */
  canCreatePoll: boolean
  onPostCreated?: () => void
}

const MIN_POLL_OPTIONS = 2
const MAX_POLL_OPTIONS = 10

export function PostComposer({ scope, courseId, userRole, canCreatePoll, onPostCreated }: PostComposerProps) {
  const t = useTranslations('community')
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [showTitle, setShowTitle] = useState(false)
  const [postType, setPostType] = useState<'standard' | 'discussion_prompt' | 'poll'>('standard')
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [mediaFiles, setMediaFiles] = useState<{ url: string; type: 'image' | 'video' | 'file'; name: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canCreateDiscussion = userRole === 'teacher' || userRole === 'admin'

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const result = await uploadCommunityAsset(formData)

        if (result.success && result.data) {
          const fileType: 'image' | 'video' | 'file' = file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('video/')
              ? 'video'
              : 'file'

          setMediaFiles((prev) => [...prev, { url: result.data!.url, type: fileType, name: file.name }])
          toast.success(t('imageUploaded'))
        } else {
          toast.error(result.success === false ? result.error : t('errorPosting'))
        }
      } catch {
        toast.error(t('errorPosting'))
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [t]
  )

  const removeMedia = (index: number) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const isPoll = postType === 'poll'
  const filledOptions = pollOptions.map((o) => o.trim()).filter(Boolean)
  const canSubmit = isPoll
    ? title.trim().length > 0 && filledOptions.length >= MIN_POLL_OPTIONS
    : content.trim().length > 0

  function reset() {
    setContent('')
    setTitle('')
    setShowTitle(false)
    setPostType('standard')
    setPollOptions(['', ''])
    setMediaFiles([])
  }

  function togglePoll() {
    setPostType((prev) => (prev === 'poll' ? 'standard' : 'poll'))
  }

  async function handleSubmit() {
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('content', content.trim())
      if (courseId && scope === 'course') {
        formData.append('course_id', String(courseId))
      }

      let result
      if (isPoll) {
        formData.append('title', title.trim())
        formData.append('options', JSON.stringify(filledOptions))
        result = await createPoll(formData)
      } else {
        formData.append('post_type', postType)
        if (showTitle && title.trim()) {
          formData.append('title', title.trim())
        }
        if (mediaFiles.length > 0) {
          formData.append('media_urls', JSON.stringify(mediaFiles))
        }
        result = await createPost(formData)
      }

      if (result.success) {
        toast.success(t('posted'))
        reset()
        onPostCreated?.()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error(t('errorPosting'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback>
            <IconUser size={16} />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          {(showTitle || isPoll) && (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isPoll ? t('poll.question') : t('addTitle')}
              aria-label={isPoll ? t('poll.question') : t('addTitle')}
              maxLength={200}
              className="flex h-8 w-full rounded-md border border-input bg-input/20 px-3 text-sm font-medium outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
            />
          )}
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={isPoll ? t('poll.detailsPlaceholder') : t('writePost')}
            aria-label={t('writePost')}
            className={isPoll ? 'min-h-[48px] resize-none' : 'min-h-[80px] resize-none'}
          />
          {isPoll && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t('poll.options')}</p>
              {pollOptions.map((option, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) =>
                      setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))
                    }
                    placeholder={t('poll.optionPlaceholder', { n: i + 1 })}
                    aria-label={t('poll.optionPlaceholder', { n: i + 1 })}
                    maxLength={200}
                    className="flex h-8 w-full rounded-md border border-input bg-input/20 px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
                  />
                  {pollOptions.length > MIN_POLL_OPTIONS && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      aria-label={t('poll.removeOption')}
                      onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <IconX size={14} />
                    </Button>
                  )}
                </div>
              ))}
              {pollOptions.length < MAX_POLL_OPTIONS && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground"
                  onClick={() => setPollOptions((prev) => [...prev, ''])}
                >
                  <IconPlus size={12} />
                  {t('poll.addOption')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Media preview */}
      {!isPoll && mediaFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-12">
          {mediaFiles.map((media, i) => (
            <div
              key={i}
              className="relative group/media rounded-lg border bg-muted/30 overflow-hidden"
            >
              {media.type === 'image' ? (
                <img
                  src={media.url}
                  alt={media.name}
                  className="h-20 w-20 object-cover"
                />
              ) : (
                <div className="h-20 w-20 flex items-center justify-center text-[10px] text-muted-foreground px-1 text-center">
                  {media.name}
                </div>
              )}
              <button
                type="button"
                onClick={() => removeMedia(i)}
                aria-label={t('removeAttachment')}
                className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover/media:opacity-100 group-focus-within/media:opacity-100 focus-visible:opacity-100 transition-opacity"
              >
                <IconX size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pl-12">
        <div className="flex flex-wrap items-center gap-1">
          {!showTitle && !isPoll && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={() => setShowTitle(true)}
            >
              <IconPlus size={12} />
              {t('addTitle')}
            </Button>
          )}
          {!isPoll && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || mediaFiles.length >= MAX_POST_MEDIA}
              >
                <IconPhoto size={12} />
                {uploading ? t('uploading') : t('attachImage')}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.pdf"
                className="hidden"
                onChange={handleFileUpload}
              />
            </>
          )}
          {canCreatePoll && (
            <Button
              variant={isPoll ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 gap-1 text-xs"
              aria-pressed={isPoll}
              onClick={togglePoll}
            >
              <IconChartBar size={12} />
              {t('filters.polls')}
            </Button>
          )}
          {canCreateDiscussion && (
            <Button
              variant={postType === 'discussion_prompt' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              aria-pressed={postType === 'discussion_prompt'}
              onClick={() =>
                setPostType((prev) =>
                  prev === 'discussion_prompt' ? 'standard' : 'discussion_prompt'
                )
              }
            >
              {t('discussionPrompt')}
            </Button>
          )}
        </div>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || uploading || !canSubmit}
          className="gap-1"
        >
          {submitting ? t('posting') : t('post')}
          <IconSend size={12} />
        </Button>
      </div>
    </div>
  )
}
