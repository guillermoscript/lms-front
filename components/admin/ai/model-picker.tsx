'use client'

import { useId, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { IconAlertTriangle } from '@tabler/icons-react'

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
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
 * Provider select + model field. The model field is a searchable combobox over the
 * provider's cached model list, with free text still accepted, so a model that
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

  const selected = provider ? providers.find((p) => p.provider === provider) : undefined
  // Capability lookups run per model: keep them off the keystroke path.
  const suggestions = useMemo(() => modelsForKind(selected, kind), [selected, kind])

  const visible = useMemo(() => {
    const q = model.trim().toLowerCase()
    // Typing narrows the list; once a listed id is picked, show the whole list again.
    if (!q || suggestions.some((m) => m.id.toLowerCase() === q)) return suggestions
    return suggestions.filter((m) => m.id.toLowerCase().includes(q) || (m.label ?? '').toLowerCase().includes(q))
  }, [suggestions, model])
  const visibleIds = useMemo(() => visible.map((m) => m.id), [visible])

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
        <Combobox
          items={visibleIds}
          filter={null}
          value={model || null}
          inputValue={model}
          onInputValueChange={(value) => onChange({ provider, model: value })}
          onValueChange={(value: string | null) => onChange({ provider, model: value ?? '' })}
          disabled={disabled || !provider}
        >
          <ComboboxInput
            id={modelId}
            placeholder={modelPlaceholder ?? t('default.modelPlaceholder')}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={200}
            aria-invalid={blockedText ? true : undefined}
            className="w-full font-mono"
            showTrigger={suggestions.length > 0}
          />
          <ComboboxContent>
            <ComboboxEmpty>{suggestions.length ? t('default.noMatch') : t('default.noModels')}</ComboboxEmpty>
            <ComboboxList>
              {visible.map((m) => (
                <ComboboxItem key={m.id} value={m.id}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-xs">{m.id}</span>
                    {m.label && m.label !== m.id && (
                      <span className="truncate text-xs text-muted-foreground">{m.label}</span>
                    )}
                  </span>
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
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
