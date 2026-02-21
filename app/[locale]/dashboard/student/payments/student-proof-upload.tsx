'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { IconUpload, IconLoader2 } from '@tabler/icons-react'
import { uploadStudentPaymentProof } from '@/app/actions/payment-requests'

interface StudentProofUploadProps {
  requestId: number
}

export function StudentProofUpload({ requestId }: StudentProofUploadProps) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be less than 10MB')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await uploadStudentPaymentProof(requestId, formData)
      toast.success('Proof uploaded successfully')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Upload failed')
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
        {uploading ? 'Uploading...' : 'Upload Proof'}
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
