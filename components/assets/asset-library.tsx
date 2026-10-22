'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconFile, IconLoader2, IconSearch, IconTrash } from '@tabler/icons-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  deleteTenantAsset,
  getAssetUsage,
  listTenantAssets,
  type AssetKind,
  type AssetSource,
  type TenantAsset,
} from '@/app/actions/assets'
import { AssetUploader, LIBRARY_BUCKET } from './asset-uploader'

const SOURCES: AssetSource[] = [
  'course',
  'landing_page',
  'certificate',
  'community',
  'ai_generated',
  'library',
]

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface AssetLibraryProps {
  /** `manage` shows size, source and delete; `pick` returns the URL of the clicked asset. */
  mode?: 'manage' | 'pick'
  kind?: AssetKind
  onSelect?: (url: string) => void
  className?: string
}

/**
 * Everything the school has uploaded — course covers, landing-page images,
 * certificate artwork, community media, AI images — in one place, with
 * drag-and-drop upload. Used as the admin Assets page and inside the image
 * picker (pick mode).
 */
export function AssetLibrary({ mode = 'manage', kind, onSelect, className }: AssetLibraryProps) {
  const t = useTranslations('assets')
  const [assets, setAssets] = useState<TenantAsset[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(48)
  const [usedBytes, setUsedBytes] = useState(0)
  const [page, setPage] = useState(0)
  const [source, setSource] = useState<AssetSource | undefined>()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [toDelete, setToDelete] = useState<{ asset: TenantAsset; description: string } | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(id)
  }, [search])

  const key = `${kind}|${source}|${debounced}|${page}|${reloadKey}`
  const loading = loadedKey !== key

  useEffect(() => {
    const current = ++requestId.current
    void listTenantAssets({ kind, source, search: debounced, page }).then((res) => {
      if (current !== requestId.current) return
      if (res.success) {
        setAssets(res.assets)
        setTotal(res.total)
        setPageSize(res.pageSize)
        setUsedBytes(res.usedBytes)
        setError(null)
      } else {
        setError(res.error)
      }
      setLoadedKey(key)
    })
  }, [kind, source, debounced, page, key])

  const handleUploaded = useCallback(
    (paths: string[]) => {
      setPage(0)
      setReloadKey((k) => k + 1)
      if (mode === 'pick' && paths.length === 1 && onSelect) {
        const supabase = createClient()
        onSelect(supabase.storage.from(LIBRARY_BUCKET).getPublicUrl(paths[0]).data.publicUrl)
      }
    },
    [mode, onSelect]
  )

  const askDelete = async (asset: TenantAsset) => {
    const res = await getAssetUsage(asset.assetId)
    const usages = res.success ? res.usages : []
    setToDelete({
      asset,
      description: usages.length
        ? t('deleteInUse', { count: usages.length, where: usages.map((u) => u.label).join(', ') })
        : t('deleteUnused'),
    })
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    const res = await deleteTenantAsset(toDelete.asset.assetId)
    if (res.success) {
      toast.success(t('deleted'))
      setReloadKey((k) => k + 1)
    } else {
      toast.error(res.error)
    }
    setToDelete(null)
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <AssetUploader onUploaded={handleUploaded} maxFiles={mode === 'pick' ? 1 : 10} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <IconSearch className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('filterBySource')}>
          {[undefined, ...SOURCES].map((s) => (
            <Button
              key={s ?? 'all'}
              type="button"
              size="sm"
              variant={source === s ? 'default' : 'outline'}
              aria-pressed={source === s}
              onClick={() => {
                setSource(s)
                setPage(0)
              }}
            >
              {s ? t(`sources.${s}`) : t('all')}
            </Button>
          ))}
        </div>
      </div>

      {mode === 'manage' && (
        <p className="text-sm text-muted-foreground">
          {t('summary', { count: total, size: formatSize(usedBytes) || '0 KB' })}
        </p>
      )}

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading && assets.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <IconLoader2 className="h-5 w-5 text-muted-foreground motion-safe:animate-spin" />
        </div>
      ) : assets.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul
          className={cn(
            'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4',
            mode === 'manage' && 'lg:grid-cols-5',
            mode === 'pick' && 'max-h-[45vh] overflow-y-auto',
            loading && 'opacity-60'
          )}
        >
          {assets.map((asset) => (
            <li key={asset.assetId} className="group relative overflow-hidden rounded-md border bg-card">
              <button
                type="button"
                disabled={mode === 'manage' && !onSelect}
                onClick={() => onSelect?.(asset.url)}
                className="block w-full text-left focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={mode === 'pick' ? t('select', { name: asset.name }) : asset.name}
              >
                {asset.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-full bg-muted object-cover"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-muted">
                    <IconFile className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </button>
              {mode === 'manage' && (
                <div className="flex items-center justify-between gap-1 p-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium" title={asset.name}>
                      {asset.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t(`sources.${asset.source}`)}
                      {asset.sizeBytes ? ` · ${formatSize(asset.sizeBytes)}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    aria-label={t('delete', { name: asset.name })}
                    onClick={() => void askDelete(asset)}
                  >
                    <IconTrash className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t('previous')}
          </Button>
          <span className="text-sm text-muted-foreground">{t('pageOf', { page: page + 1, count: pageCount })}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            {t('next')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('deleteTitle', { name: toDelete?.asset.name ?? '' })}
        description={toDelete?.description ?? ''}
        confirmText={t('deleteConfirm')}
        cancelText={t('cancel')}
        variant="destructive"
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
