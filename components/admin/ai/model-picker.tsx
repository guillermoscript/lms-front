'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { IconAlertTriangle } from '@tabler/icons-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Cap } from '@/lib/ai/capabilities'
import type { ProviderId, ProviderKind } from '@/lib/ai/provider-ids'
import type { AiProviderDTO } from '@/app/actions/admin/ai-settings'

import { asTranslator, capWarningText, modelsForKind } from './helpers'

const NONE = '__none__'

interface ModelPickerProps {
  /** Providers that may be offered (already filtered to connected + able to serve the kind). */
  providers: AiProviderDTO[]
  kind: ProviderKind
  provider: ProviderId | null
  model: string
  onChange: (next: { provider: ProviderId | null; model: string }) => void
  /** Offer a "use default" entry that clears the provider (features only). */
  allowEmpty?: boolean
  placeholder?: string
  modelPlaceholder?: string
  disabled?: boolean
  /** Soft capability findings for the current pair, shown under the field. */
  missing?: Cap[]
  /** Hard problem with the current pair, shown in the error colour. */
  blockedText?: string | null
  compact?: boolean
}

/**
 * Provider select + model field. The model field is free text with the
 * provider's cached model list as suggestions (`<datalist>`), so a model that
 * was released after the list was cached can still be typed in.
 */
export function ModelPicker({
  providers,
  kind,
  provider,
  model,
  onChange,
  allowEmpty = false,
  placeholder,
  modelPlaceholder,
  disabled,
  missing = [],
  blockedText,
  compact,
}: ModelPickerProps) {
  const t = useTranslations('aiSettings')
  const uid = useId()
  const providerId = `${uid}-provider`
  const modelId = `${uid}-model`
  const listId = `${uid}-models`

  const selected = provider ? providers.find((p) => p.provider === provider) : undefined
  const suggestions = modelsForKind(selected, kind)

  const items: Record<string, string> = {}
  if (allowEmpty) items[NONE] = placeholder ?? t('advanced.providerPlaceholder')
  for (const p of providers) items[p.provider] = p.label

  return (
    <div className={compact ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-4 sm:grid-cols-2'}>
      <div className="space-y-1.5">
        <Label htmlFor={providerId}>{t('default.provider')}</Label>
        <Select
          items={items}
          value={provider ?? (allowEmpty ? NONE : null)}
          onValueChange={(value) => {
            if (value === null || value === NONE) onChange({ provider: null, model: '' })
            else if (value !== provider) onChange({ provider: value as ProviderId, model: '' })
          }}
          disabled={disabled}
        >
          <SelectTrigger id={providerId} className="w-full">
            <SelectValue placeholder={placeholder ?? t('default.providerPlaceholder')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {allowEmpty && <SelectItem value={NONE}>{placeholder ?? t('advanced.providerPlaceholder')}</SelectItem>}
            {providers.map((p) => (
              <SelectItem key={p.provider} value={p.provider}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={modelId}>{t('default.model')}</Label>
        <Input
          id={modelId}
          value={model}
          onChange={(e) => onChange({ provider, model: e.target.value })}
          list={suggestions.length ? listId : undefined}
          placeholder={modelPlaceholder ?? t('default.modelPlaceholder')}
          disabled={disabled || !provider}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={200}
          aria-invalid={blockedText ? true : undefined}
          className="font-mono"
        />
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label && m.label !== m.id ? m.label : undefined}
              </option>
            ))}
          </datalist>
        )}
      </div>

      {(blockedText || missing.length > 0) && (
        <div className="space-y-1 sm:col-span-2" aria-live="polite">
          {blockedText && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {blockedText}
            </p>
          )}
          {missing.map((cap) => (
            <p key={cap} className="flex items-start gap-1.5 text-xs text-warning">
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {capWarningText(asTranslator(t), cap)}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
