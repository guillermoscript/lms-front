'use client'

import { useState, type ComponentProps } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ListToolbar, matchesQuery } from '@/components/student/list-toolbar'
import { StudentCertificateCard } from '@/components/student/student-certificate-card'

type CertificateRow = ComponentProps<typeof StudentCertificateCard>['certificate']
type Sort = 'newest' | 'oldest' | 'title'

/** Search / sort for the student's certificates. */
export function CertificatesExplorer({ certificates }: { certificates: CertificateRow[] }) {
  const t = useTranslations('dashboard.student.certificates')
  const locale = useLocale()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('newest')

  const sorts = (['newest', 'oldest', 'title'] as const).map((value) => ({
    value,
    label: t(`list.${value}`),
  }))

  const title = (c: CertificateRow) => c.courses?.title ?? ''
  const visible = certificates
    .filter((c) => matchesQuery(search, locale, title(c), c.certificate_templates?.template_name))
    .sort((a, b) => {
      if (sort === 'title') return title(a).localeCompare(title(b), locale)
      const diff = new Date(a.issued_at).getTime() - new Date(b.issued_at).getTime()
      return sort === 'oldest' ? diff : -diff
    })
  const filtered = search !== ''

  function reset() {
    setSearch('')
  }

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchLabel={t('list.search')}
        searchPlaceholder={t('list.searchPlaceholder')}
        selects={[
          {
            id: 'sort',
            label: t('list.sort'),
            value: sort,
            options: sorts,
            onChange: (v) => {
              if (v === 'newest' || v === 'oldest' || v === 'title') setSort(v)
            },
          },
        ]}
        resultsText={t('list.results', { count: visible.length, total: certificates.length })}
        showReset={filtered}
        onReset={reset}
        resetLabel={t('list.reset')}
      />

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">{t('list.noMatches')}</p>
          <p className="text-sm text-muted-foreground">{t('list.noMatchesHint')}</p>
          <Button variant="outline" size="sm" onClick={reset}>
            {t('list.reset')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {visible.map((cert) => (
            <StudentCertificateCard key={cert.certificate_id} certificate={cert} />
          ))}
        </div>
      )}
    </div>
  )
}
