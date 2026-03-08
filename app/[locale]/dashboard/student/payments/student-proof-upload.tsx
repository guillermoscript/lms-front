'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { IconUpload, IconLoader2 } from '@tabler/icons-react'
import { uploadStudentPaymentProof } from '@/app/actions/payment-requests'
import { useTranslations } from 'next-intl'

interface StudentProofUploadProps {
  requestId: number
}

export function StudentProofUpload({ requestId }: StudentProofUploadProps) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const t = useTranslations('dashboard.student.payments.proofUpload')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('invalidFileType'))
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('fileTooLarge'))
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await uploadStudentPaymentProof(requestId, formData)
      toast.success(t('uploadSuccess'))
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || t('uploadFailed'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <IconLoader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <IconUpload className="mr-1 h-3 w-3" />
        )}
        {uploading ? t('uploading') : t('uploadProof')}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  )
}
