'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { IconUpload, IconFile, IconPhoto, IconLoader2, IconX } from '@tabler/icons-react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

interface ProofUploadProps {
  onUpload: (file: File) => Promise<void>
  currentProofUrl?: string | null
  disabled?: boolean
  label?: string
}

export function ProofUpload({ onUpload, currentProofUrl, disabled, label = 'Payment Proof' }: ProofUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    if (file.size > MAX_FILE_SIZE) {
      setError('File must be less than 10MB')
      return
    }

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Only images and PDFs are accepted')
      return
    }

    setFileName(file.name)

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setPreview(url)
    } else {
      setPreview(null)
    }

    setUploading(true)
    try {
      await onUpload(file)
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleClear = () => {
    setPreview(null)
    setFileName(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const hasProof = currentProofUrl || preview

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>

      {hasProof ? (
        <div className="flex items-center gap-3 rounded-md border p-3">
          {preview ? (
            <img src={preview} alt="Proof" className="h-12 w-12 rounded object-cover" />
          ) : currentProofUrl ? (
            currentProofUrl.endsWith('.pdf') ? (
              <IconFile className="h-8 w-8 text-muted-foreground" />
            ) : (
              <img src={currentProofUrl} alt="Proof" className="h-12 w-12 rounded object-cover" />
            )
          ) : null}
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{fileName || 'Proof uploaded'}</p>
            {currentProofUrl && !preview && (
              <a
                href={currentProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                View proof
              </a>
            )}
          </div>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
              <IconX className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <div
          className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <IconLoader2 className="h-5 w-5 animate-spin" />
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <IconUpload className="h-5 w-5" />
              <span>Upload receipt or screenshot (image or PDF, max 10MB)</span>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || uploading}
      />
    </div>
  )
}
