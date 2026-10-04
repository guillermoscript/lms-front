'use client'

import { useMemo } from 'react'
import { useLocale } from 'next-intl'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { countryOptions, type CountryCode } from '@/lib/countries'

type CountryOption = { value: CountryCode; label: string }

interface CountryPickerProps {
  id: string
  value: CountryCode | null
  onValueChange: (value: CountryCode | null) => void
  placeholder: string
  emptyText: string
  disabled?: boolean
  'data-testid'?: string
  'aria-describedby'?: string
}

/**
 * Searchable country picker (#865). Names come from `Intl.DisplayNames` in the
 * page's locale, so no per-country translation keys are needed. `value` is an
 * ISO 3166-1 alpha-2 code or `null` — there is no default country.
 */
export function CountryPicker({
  id,
  value,
  onValueChange,
  placeholder,
  emptyText,
  disabled,
  'data-testid': testId,
  'aria-describedby': describedBy,
}: CountryPickerProps) {
  const locale = useLocale()
  const items = useMemo<CountryOption[]>(
    () => countryOptions(locale).map(({ code, name }) => ({ value: code, label: name })),
    [locale]
  )
  const selected = useMemo(
    () => (value ? items.find(item => item.value === value) ?? null : null),
    [items, value]
  )

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(next: CountryOption | null) => onValueChange(next?.value ?? null)}
      isItemEqualToValue={(a: CountryOption, b: CountryOption) => a.value === b.value}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full"
        data-testid={testId}
        aria-describedby={describedBy}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: CountryOption) => (
            <ComboboxItem key={item.value} value={item} data-testid={`country-option-${item.value}`}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
