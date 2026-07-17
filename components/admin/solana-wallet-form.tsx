'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setSolanaWallet } from '@/app/actions/admin/settings'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface SolanaWalletFormProps {
  initialAddress: string
}

export default function SolanaWalletForm({ initialAddress }: SolanaWalletFormProps) {
  const t = useTranslations('dashboard.admin.settings.form.solanaWallet')
  const [address, setAddress] = useState(initialAddress)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const result = await setSolanaWallet(address)
      if (result.success) {
        toast.success(t('success'))
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="solana_wallet">{t('label')}</Label>
        <Input
          id="solana_wallet"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('placeholder')}
          spellCheck={false}
          autoComplete="off"
          disabled={isSubmitting}
        />
        <p className="text-sm text-muted-foreground">{t('hint')}</p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  )
}
