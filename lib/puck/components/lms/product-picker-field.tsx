'use client'

/**
 * Custom Puck fields that bind a block to the tenant's real products, plans
 * and teachers — siblings of course-picker-field.tsx / course-picker-single-field.tsx.
 *
 * Values keep the shapes the resolvers expect (correction D2):
 *   - list pickers store `{ id: string }[]` (same as CourseGrid.courseIds)
 *   - single pickers store a plain `string` ('' = unbound)
 * Lists come from `landing-pickers-context.tsx`, mounted by the editor.
 */
import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { IconArrowDown, IconArrowUp, IconPlus, IconSearch, IconX } from '@tabler/icons-react'
import { formatMoney } from '../../utils/format-money'
import { useLandingPlans, useLandingProducts, useLandingTeachers } from '../../utils/landing-pickers-context'

type IdItem = { id: string }
type Option = { id: string; label: string; hint?: string }

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <IconSearch className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-border bg-background pl-7 pr-2 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}

function useFiltered(options: Option[], query: string, exclude?: Set<string>) {
  return useMemo(() => {
    const q = query.trim().toLowerCase()
    return options.filter((o) => !exclude?.has(o.id) && (!q || o.label.toLowerCase().includes(q)))
  }, [options, query, exclude])
}

/** Ordered multi-select storing `{ id }[]`. */
export function EntityListPickerField({
  options,
  value,
  onChange,
  emptyHint,
}: {
  options: Option[]
  value: IdItem[] | undefined
  onChange: (value: IdItem[]) => void
  /** Shown when nothing is picked: what the block does by default. */
  emptyHint: string
}) {
  const t = useTranslations('puck.courseBlocks.picker')
  const [query, setQuery] = useState('')
  const selected = useMemo(() => (value ?? []).map((v) => v?.id).filter((id): id is string => !!id), [value])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])
  const available = useFiltered(options, query, selectedSet)

  const set = (ids: string[]) => onChange(ids.map((id) => ({ id })))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= selected.length) return
    const next = [...selected]
    ;[next[i], next[j]] = [next[j], next[i]]
    set(next)
  }

  if (options.length === 0) return <p className="text-[13px] text-muted-foreground py-2">{t('noneAvailable')}</p>

  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {selected.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
              <span className="text-xs tabular-nums text-muted-foreground w-4 text-center">{i + 1}</span>
              <span className="flex-1 truncate text-[13px] text-foreground">
                {byId.get(id)?.label ?? <span className="text-muted-foreground italic">{t('unknown', { id })}</span>}
              </span>
              <button type="button" aria-label={t('moveUp')} disabled={i === 0} onClick={() => move(i, -1)}
                className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed">
                <IconArrowUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" aria-label={t('moveDown')} disabled={i === selected.length - 1} onClick={() => move(i, 1)}
                className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed">
                <IconArrowDown className="w-3.5 h-3.5" />
              </button>
              <button type="button" aria-label={t('remove')} onClick={() => set(selected.filter((x) => x !== id))}
                className="p-1 text-muted-foreground hover:text-destructive">
                <IconX className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">{emptyHint}</p>
      )}

      <SearchBox value={query} onChange={setQuery} placeholder={t('search')} />

      {available.length > 0 ? (
        <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {available.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => set([...selected, o.id])}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-muted">
                <IconPlus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">{query.trim() ? t('noMatches') : t('allPicked')}</p>
      )}
    </div>
  )
}

/** Single-select storing a plain string id ('' = unbound). */
export function EntitySinglePickerField({
  options,
  value,
  onChange,
  emptyHint,
}: {
  options: Option[]
  value: string | undefined
  onChange: (value: string) => void
  emptyHint: string
}) {
  const t = useTranslations('puck.courseBlocks.picker')
  const [query, setQuery] = useState('')
  const selected = value ? options.find((o) => o.id === value) : undefined
  const available = useFiltered(options, query)

  if (options.length === 0) return <p className="text-[13px] text-muted-foreground py-2">{t('noneAvailable')}</p>

  return (
    <div className="flex flex-col gap-3">
      {value ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
          <span className="flex-1 truncate text-[13px] text-foreground">
            {selected?.label ?? <span className="text-muted-foreground italic">{t('unknown', { id: value })}</span>}
          </span>
          <button type="button" aria-label={t('clear')} onClick={() => onChange('')}
            className="p-1 text-muted-foreground hover:text-destructive">
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">{emptyHint}</p>
      )}

      <SearchBox value={query} onChange={setQuery} placeholder={t('search')} />

      {available.length > 0 ? (
        <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto" role="listbox">
          {available.map((o) => (
            <li key={o.id}>
              <button type="button" role="option" aria-selected={value === o.id} onClick={() => onChange(o.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-muted">
                <span aria-hidden="true"
                  className={'size-3.5 shrink-0 rounded-full border ' + (value === o.id ? 'border-primary bg-primary' : 'border-muted-foreground/40')} />
                <span className="truncate flex-1">{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">{t('noMatches')}</p>
      )}
    </div>
  )
}

function useProductOptions(): Option[] {
  const products = useLandingProducts()
  const locale = useLocale()
  const t = useTranslations('puck.courseBlocks')
  return useMemo(
    () => products.map((p) => ({ id: p.id, label: p.name, hint: formatMoney(p.price, p.currency, locale) ?? t('free') })),
    [products, locale, t]
  )
}

/** ProductGrid.productIds — ordered `{ id }[]`. */
export function ProductPickerField({ value, onChange }: { value: IdItem[] | undefined; onChange: (v: IdItem[]) => void }) {
  const t = useTranslations('puck.courseBlocks.picker')
  return <EntityListPickerField options={useProductOptions()} value={value} onChange={onChange} emptyHint={t('productsEmpty')} />
}

/** CoursePricingCard.productId — a single string id. */
export function ProductPickerSingleField({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const t = useTranslations('puck.courseBlocks.picker')
  return <EntitySinglePickerField options={useProductOptions()} value={value} onChange={onChange} emptyHint={t('productEmpty')} />
}

/** PricingTable.planIds — ordered `{ id }[]`. */
export function PlanPickerField({ value, onChange }: { value: IdItem[] | undefined; onChange: (v: IdItem[]) => void }) {
  const plans = useLandingPlans()
  const locale = useLocale()
  const t = useTranslations('puck.courseBlocks')
  const options = useMemo(
    () => plans.map((p) => ({ id: p.id, label: p.name, hint: formatMoney(p.price, p.currency, locale) ?? t('free') })),
    [plans, locale, t]
  )
  return <EntityListPickerField options={options} value={value} onChange={onChange} emptyHint={t('picker.plansEmpty')} />
}

/** InstructorCard.teacherUserId — a single profile id. */
export function TeacherPickerSingleField({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const teachers = useLandingTeachers()
  const t = useTranslations('puck.courseBlocks.picker')
  const options = useMemo(() => teachers.map((m) => ({ id: m.id, label: m.name })), [teachers])
  return <EntitySinglePickerField options={options} value={value} onChange={onChange} emptyHint={t('teacherEmpty')} />
}
