'use client'

import { useCallback, useState, type DragEvent, type ReactElement } from 'react'
import { useTranslations } from 'next-intl'
import { IconLoader2, IconUpload } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  listCourseImages,
  uploadCourseImage,
  type CourseLibraryImage,
} from '@/app/actions/teacher/course-images'

interface ImagePickerProps {
  /** Receives the public URL of the uploaded or picked image. */
  onSelect: (url: string) => void
  /** Element that opens the picker (rendered through `render`). */
  trigger: ReactElement
}

/**
 * Drop-zone upload plus a library of every image the school already has, so a
 * teacher reuses an existing image instead of uploading it a second time.
 */
export function ImagePicker({ onSelect, trigger }: ImagePickerProps) {
  const t = useTranslations('dashboard.teacher.imagePicker')
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<string>('library')
  const [images, setImages] = useState<CourseLibraryImage[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const loadLibrary = useCallback(async () => {
    setLoadError(null)
    const result = await listCourseImages()
    if (result.success) setImages(result.images)
    else setLoadError(result.error)
  }, [])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) void loadLibrary()
  }

  const pick = (url: string) => {
    onSelect(url)
    setOpen(false)
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const data = new FormData()
      data.append('file', file)
      const result = await uploadCourseImage(data)
      if (result.success) {
        setImages(null)
        pick(result.url)
      } else {
        setUploadError(result.error)
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('uploadError'))
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    setDragging(false)
    void upload(e.dataTransfer.files?.[0])
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList>
            <TabsTrigger value="library">{t('libraryTab')}</TabsTrigger>
            <TabsTrigger value="upload">{t('uploadTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="pt-3">
            {loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : images === null ? (
              <div className="flex h-40 items-center justify-center">
                <IconLoader2 className="h-5 w-5 text-muted-foreground motion-safe:animate-spin" />
              </div>
            ) : images.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>
            ) : (
              <ul className="grid max-h-[55vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
                {images.map((img) => (
                  <li key={img.url}>
                    <button
                      type="button"
                      onClick={() => pick(img.url)}
                      className="group block w-full overflow-hidden rounded-md border focus-visible:outline-2 focus-visible:outline-ring"
                      aria-label={t('selectImage', { name: img.name })}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-full object-cover transition-opacity group-hover:opacity-80"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="upload" className="pt-3">
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted-foreground transition-colors',
                dragging && 'border-primary bg-primary/5 text-foreground',
                uploading && 'pointer-events-none opacity-60'
              )}
            >
              {uploading ? (
                <IconLoader2 className="h-6 w-6 motion-safe:animate-spin" />
              ) : (
                <IconUpload className="h-6 w-6" />
              )}
              <span>{uploading ? t('uploading') : t('dropHint')}</span>
              <span className="text-xs">{t('limits')}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  void upload(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
            {uploadError && <p className="mt-2 text-sm text-destructive">{uploadError}</p>}
          </TabsContent>
        </Tabs>
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
