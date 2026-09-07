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
import {
  IconUserPlus,
  IconMail,
  IconMailOff,
  IconBrandWhatsapp,
  IconCopy,
  IconCheck,
} from '@tabler/icons-react'
import { createInvitation } from '@/app/actions/admin/invitations'

interface InviteUserDialogProps {
  joinUrl: string
}

/**
 * What the dialog shows once an invitation row exists. `emailSent` is the
 * server's answer, not the button that was pressed: with no mailer configured
 * `createInvitation` reports `false` and the panel hands the admin the join
 * link instead of claiming an email went out (#673 / #676).
 */
interface InviteResult {
  emailSent: boolean
  joinUrl: string
}

export function InviteUserDialog({ joinUrl }: InviteUserDialogProps) {
  const t = useTranslations('dashboard.admin.users.invite')
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'student' | 'teacher'>('student')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InviteResult | null>(null)
  const [copied, setCopied] = useState(false)

  const resetForm = () => {
    setEmail('')
    setRole('student')
    setError(null)
    setResult(null)
    setCopied(false)
  }

  const copyToClipboard = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSendEmail = async () => {
    if (!email.trim()) {
      setError(t('emailRequired'))
      return
    }

    setSending(true)
    setError(null)

    const res = await createInvitation({
      email: email.trim(),
      role,
      sendEmailInvite: true,
    })

    setSending(false)

    if (res.success) {
      setResult({ emailSent: res.emailSent === true, joinUrl: res.joinUrl || joinUrl })
    } else {
      setError(res.error || t('genericError'))
    }
  }

  /**
   * Record the invitation (so the role is honoured on join) before handing
   * the link over. A refused record — usually a duplicate pending invite —
   * used to be swallowed here and the admin shared a link that would join the
   * person as a plain student.
   */
  const recordInvitationForLink = async (): Promise<string | null> => {
    if (!email.trim()) return joinUrl
    const res = await createInvitation({
      email: email.trim(),
      role,
      sendEmailInvite: false,
    })
    if (!res.success) {
      setError(res.error || t('genericError'))
      return null
    }
    return res.joinUrl || joinUrl
  }

  const handleWhatsApp = async () => {
    const url = await recordInvitationForLink()
    if (!url) return
    const roleLabel = role === 'teacher' ? t('roleTeacher') : t('roleStudent')
    const message = t('whatsappMessage', { url, role: roleLabel })
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  const handleCopyLink = async () => {
    const url = await recordInvitationForLink()
    if (!url) return
    try {
      await copyToClipboard(url)
    } catch {
      // Clipboard access refused (insecure context, no focus): show the link
      // instead of pretending it was copied.
      setResult({ emailSent: false, joinUrl: url })
    }
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
          <Button size="sm" className="gap-2" id="invite-user-btn" data-testid="invite-user-trigger">
            <IconUserPlus className="h-4 w-4" />
            {t('button')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md" data-testid="invite-user-dialog">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div
            className="py-6 text-center"
            data-testid="invite-result"
            data-email-sent={result.emailSent ? 'true' : 'false'}
          >
            {result.emailSent ? (
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <IconCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            ) : (
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
                <IconMailOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            )}
            <p className="text-sm font-medium" data-testid="invite-result-title">
              {result.emailSent ? t('sent') : t('createdNotSent')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.emailSent
                ? t('sentDescription', { email })
                : t('createdNotSentDescription', { email })}
            </p>

            {!result.emailSent && (
              <div className="mt-4 flex items-center gap-2 text-left">
                <Input
                  readOnly
                  value={result.joinUrl}
                  aria-label={t('joinLinkLabel')}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                  data-testid="invite-join-link"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2"
                  onClick={() => copyToClipboard(result.joinUrl).catch(() => undefined)}
                  data-testid="invite-copy-join-link"
                >
                  {copied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
                  {copied ? t('copied') : t('copyLink')}
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={resetForm}
              data-testid="invite-another"
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
                <SelectTrigger data-testid="invite-role">
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
                data-testid="invite-email"
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
              <p className="text-sm text-destructive" data-testid="invite-error">{error}</p>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSendEmail}
                disabled={sending || !email.trim()}
                className="gap-2"
                data-testid="invite-send-email"
              >
                <IconMail className="h-4 w-4" />
                {sending ? t('sending') : t('sendEmail')}
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleWhatsApp}
                  data-testid="invite-whatsapp"
                >
                  <IconBrandWhatsapp className="h-4 w-4" />
                  {t('shareWhatsApp')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleCopyLink}
                  data-testid="invite-copy-link"
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
