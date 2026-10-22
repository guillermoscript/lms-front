'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { IconCopy, IconExternalLink, IconTrash } from '@tabler/icons-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/format-date'
import type { TenantAsset } from '@/app/actions/assets'

export function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface AssetDetailDialogProps {
  asset: TenantAsset | null
  onOpenChange: (open: boolean) => void
  onDelete: (asset: TenantAsset) => void
}

/** One file in full: preview, who uploaded it and when, and every place it is used. */
export function AssetDetailDialog({ asset, onOpenChange, onDelete }: AssetDetailDialogProps) {
  const t = useTranslations('assets')
  const locale = useLocale()

  const copyUrl = async () => {
    if (!asset) return
    try {
      await navigator.clipboard.writeText(asset.url)
      toast.success(t('urlCopied'))
    } catch {
      // clipboard is unavailable on plain http
      toast.error(t('copyFailed'))
    }
  }

  return (
    <Dialog open={!!asset} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {asset && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-6">{asset.name}</DialogTitle>
              <DialogDescription>{t(`sources.${asset.source}`)}</DialogDescription>
            </DialogHeader>

            {asset.kind === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.url}
                alt=""
                className="max-h-72 w-full rounded-md border bg-muted object-contain"
              />
            )}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('uploadedBy')}</dt>
              <dd>
                {asset.uploadedBy ? asset.uploadedBy.name || t('unknownUser') : t('unknownUploader')}
              </dd>
              <dt className="text-muted-foreground">{t('uploadedOn')}</dt>
              <dd>{formatDate(asset.createdAt, locale)}</dd>
              {asset.sizeBytes ? (
                <>
                  <dt className="text-muted-foreground">{t('size')}</dt>
                  <dd>{formatSize(asset.sizeBytes)}</dd>
                </>
              ) : null}
              {asset.mimeType ? (
                <>
                  <dt className="text-muted-foreground">{t('type')}</dt>
                  <dd>{asset.mimeType}</dd>
                </>
              ) : null}
            </dl>

            <section aria-labelledby="asset-usage-heading">
              <h3 id="asset-usage-heading" className="mb-1 text-sm font-medium">
                {t('usedIn')}
              </h3>
              {asset.usages.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('notUsed')}</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                  {asset.usages.map((u, i) => {
                    const label = u.name
                      ? `${t(`usageTypes.${u.type}`)}: ${u.name}`
                      : t(`usageTypes.${u.type}`)
                    return (
                      <li key={`${u.type}-${u.name}-${i}`}>
                        {u.href ? (
                          <Link href={`/${locale}${u.href}`} className="text-primary underline-offset-2 hover:underline">
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="destructive" onClick={() => onDelete(asset)}>
                <IconTrash className="mr-1.5 h-4 w-4" />
                {t('deleteConfirm')}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => void copyUrl()}>
                  <IconCopy className="mr-1.5 h-4 w-4" />
                  {t('copyUrl')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  render={<a href={asset.url} target="_blank" rel="noopener noreferrer" />}
                >
                  <IconExternalLink className="mr-1.5 h-4 w-4" />
                  {t('openOriginal')}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
