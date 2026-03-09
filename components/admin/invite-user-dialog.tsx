'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IconUserPlus, IconMail, IconBrandWhatsapp, IconCopy, IconCheck } from '@tabler/icons-react'
import { createInvitation } from '@/app/actions/admin/invitations'

interface InviteUserDialogProps {
  joinUrl: string
}

export function InviteUserDialog({ joinUrl }: InviteUserDialogProps) {
  const t = useTranslations('dashboard.admin.users.invite')
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'student' | 'teacher'>('student')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [copied, setCopied] = useState(false)

  const resetForm = () => {
    setEmail('')
    setRole('student')
    setError(null)
    setSuccess(false)
    setCopied(false)
  }

  const handleSendEmail = async () => {
    if (!email.trim()) {
      setError(t('emailRequired'))
      return
    }

    setSending(true)
    setError(null)

    const result = await createInvitation({
      email: email.trim(),
      role,
      sendEmailInvite: true,
    })

    setSending(false)

    if (result.success) {
      setSuccess(true)
    } else {
      setError(result.error || t('genericError'))
    }
  }

  const handleWhatsApp = async () => {
    // Create invitation record (without email) so role is tracked
    if (email.trim()) {
      await createInvitation({
        email: email.trim(),
        role,
        sendEmailInvite: false,
      })
    }

    const roleLabel = role === 'teacher' ? t('roleTeacher') : t('roleStudent')
    const message = t('whatsappMessage', { url: joinUrl, role: roleLabel })
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  const handleCopyLink = async () => {
    // Create invitation record if email provided
    if (email.trim()) {
      await createInvitation({
        email: email.trim(),
        role,
        sendEmailInvite: false,
      })
    }

    await navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) resetForm()
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" className="gap-2" id="invite-user-btn">
            <IconUserPlus className="h-4 w-4" />
            {t('button')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
              <IconCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-medium">{t('sent')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('sentDescription', { email })}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={resetForm}
            >
              {t('inviteAnother')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Role Selection */}
            <div className="space-y-2">
              <Label>{t('roleLabel')}</Label>
              <Select
                value={role}
                onValueChange={(v) => v && setRole(v as 'student' | 'teacher')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">{t('roleStudent')}</SelectItem>
                  <SelectItem value="teacher">{t('roleTeacher')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t('roleHint')}</p>
            </div>

            {/* Email Input */}
            <div className="space-y-2">
              <Label htmlFor="invite-email">{t('emailLabel')}</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSendEmail}
                disabled={sending || !email.trim()}
                className="gap-2"
              >
                <IconMail className="h-4 w-4" />
                {sending ? t('sending') : t('sendEmail')}
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleWhatsApp}
                >
                  <IconBrandWhatsapp className="h-4 w-4" />
                  {t('shareWhatsApp')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <IconCheck className="h-4 w-4" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                  {copied ? t('copied') : t('copyLink')}
                </Button>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              {t('linkNote')}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
