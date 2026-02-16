'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Award, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface CertificateButtonProps {
  courseId: number
  totalLessons: number
  completedLessons: number
  existingCertificateId?: string | null
}

export function CertificateButton({
  courseId,
  totalLessons,
  completedLessons,
  existingCertificateId,
}: CertificateButtonProps) {
  const t = useTranslations('certificates')
  const [loading, setLoading] = useState(false)
  const [certificateId, setCertificateId] = useState<string | null>(
    existingCertificateId ?? null
  )

  const allCompleted = totalLessons > 0 && completedLessons >= totalLessons
  const hasExisting = certificateId != null

  async function handleClick() {
    if (hasExisting) {
      window.open(`/api/certificates/${certificateId}`, '_blank')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/certificates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || t('generateError'))
        return
      }

      const cert = data.certificate
      setCertificateId(cert.certificate_id)
      toast.success(t('generated'))
      window.open(`/api/certificates/${cert.certificate_id}`, '_blank')
    } catch {
      toast.error(t('generateError'))
    } finally {
      setLoading(false)
    }
  }

  if (!allCompleted) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Button disabled variant="outline" className="gap-2">
            <Award className="h-4 w-4" />
            {t('getCertificate')}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('completeAllLessons')}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      variant={hasExisting ? 'outline' : 'default'}
      className="gap-2"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Award className="h-4 w-4" />
      )}
      {loading
        ? t('generating')
        : hasExisting
          ? t('viewCertificate')
          : t('getCertificate')}
    </Button>
  )
}
