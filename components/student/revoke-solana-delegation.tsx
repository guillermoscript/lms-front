'use client'

/**
 * Revoke a native Solana subscription's on-chain auto-pull delegation (#460).
 *
 * The server cannot revoke the delegation — the Subscriptions program's `cancel`
 * instruction is signed by the subscriber. So the student does it from their own
 * wallet: we ask the server for an UNSIGNED cancel tx (/cancel-tx), sign it with
 * Phantom (sign-only — Phantom's own simulate trips on these instructions),
 * submit it through /submit, then confirm + finalize the DB row via
 * /cancel-verify. Mirrors the subscribe flow in checkout-form.tsx.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconWallet, IconAlertTriangle } from '@tabler/icons-react'

// Minimal shape of the injected Phantom provider we rely on (sign-only flow).
interface PhantomProvider {
  isPhantom?: boolean
  connect: () => Promise<{ publicKey: { toString: () => string } }>
  signTransaction: <T>(tx: T) => Promise<T>
}
function getPhantom(): PhantomProvider | null {
  if (typeof window === 'undefined') return null
  const p = (window as unknown as { solana?: PhantomProvider }).solana
  return p?.isPhantom ? p : null
}

export function RevokeSolanaDelegation({ subscriptionId }: { subscriptionId: number }) {
  const t = useTranslations('dashboard.student.billing.subscription.revoke')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const handleRevoke = async () => {
    setBusy(true)
    setMsg(t('connecting'))
    try {
      const provider = getPhantom()
      if (!provider) throw new Error(t('noWallet'))

      await provider.connect()

      // 1. Ask the server for the unsigned cancel tx for our own subscription.
      setMsg(t('preparing'))
      const br = await fetch('/api/payments/solana/cancel-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId }),
      })
      const bd = await br.json()
      if (!br.ok || !bd.transaction) throw new Error(bd.error || t('error'))

      // 2. Sign with the wallet.
      setMsg(t('signing'))
      const { VersionedTransaction } = await import('@solana/web3.js')
      const bytes = Uint8Array.from(atob(bd.transaction), (c) => c.charCodeAt(0))
      const vtx = VersionedTransaction.deserialize(bytes)
      const signed = await provider.signTransaction(vtx)
      let binary = ''
      const serialized = signed.serialize()
      for (let k = 0; k < serialized.length; k++) binary += String.fromCharCode(serialized[k])

      // 3. Submit through the shared relay (confirms before returning).
      setMsg(t('submitting'))
      const sr = await fetch('/api/payments/solana/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: btoa(binary) }),
      })
      const sd = await sr.json()
      if (!sr.ok || !sd.signature) throw new Error(sd.error || t('error'))

      // 4. Confirm on-chain + finalize our DB row.
      setMsg(t('confirming'))
      const vr = await fetch('/api/payments/solana/cancel-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId }),
      })
      const vd = await vr.json()
      if (!vr.ok || !vd.canceled) throw new Error(vd.error || t('notConfirmed'))

      toast.success(t('success'))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setBusy(false)
      setMsg(null)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive"
        onClick={() => setOpen(true)}
      >
        <IconWallet className="h-3.5 w-3.5" />
        {t('button')}
      </Button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
            <IconAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t('walletNote2')}</span>
          </div>

          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={busy}>
              {busy ? t('working') : t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
