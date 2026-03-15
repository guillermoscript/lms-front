'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { IconSend, IconPhoto, IconPlus, IconX, IconUser } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { createPost, uploadCommunityAsset } from '@/app/actions/community'

interface PostComposerProps {
  scope: 'school' | 'course'
  courseId?: number
  userRole: string
  onPostCreated?: () => void
}

export function PostComposer({ scope, courseId, userRole, onPostCreated }: PostComposerProps) {
  const t = useTranslations('community')
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [showTitle, setShowTitle] = useState(false)
  const [postType, setPostType] = useState<'standard' | 'discussion_prompt'>('standard')
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

  async function handleSubmit() {
    if (!content.trim()) return

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('content', content.trim())
      formData.append('post_type', postType)
      if (showTitle && title.trim()) {
        formData.append('title', title.trim())
      }
      if (courseId && scope === 'course') {
        formData.append('course_id', String(courseId))
      }

      const result = await createPost(formData)

      if (result.success) {
        toast.success(t('posted'))
        setContent('')
        setTitle('')
        setShowTitle(false)
        setPostType('standard')
        setMediaFiles([])
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
          {showTitle && (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('addTitle')}
              className="flex h-8 w-full rounded-md border border-input bg-input/20 px-3 text-sm font-medium outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
            />
          )}
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('writePost')}
            className="min-h-[80px] resize-none"
          />
        </div>
      </div>

      {/* Media preview */}
      {mediaFiles.length > 0 && (
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
                onClick={() => removeMedia(i)}
                className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover/media:opacity-100 transition-opacity"
              >
                <IconX size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between pl-12">
        <div className="flex items-center gap-1">
          {!showTitle && (
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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
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
          {canCreateDiscussion && (
            <Button
              variant={postType === 'discussion_prompt' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
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
          disabled={submitting || !content.trim()}
          className="gap-1"
        >
          {submitting ? t('posting') : t('post')}
          <IconSend size={12} />
        </Button>
      </div>
    </div>
  )
}
