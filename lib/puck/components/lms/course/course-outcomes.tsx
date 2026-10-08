import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { IconCheck } from '@tabler/icons-react'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterProps,
  sectionInnerProps,
} from '../../../utils/section-spacing'
import { CoursePickerSingleField } from '../course-picker-single-field'
import { resolveCourseBinding } from './binding'
import { BindingNotice } from './course-ui'
import { useCourseNotice } from './use-course-notice'

type OutcomeItem = { text: string }

export type CourseOutcomesProps = {
  courseId: string
  title: string
  subtitle: string
  items: OutcomeItem[]
} & SectionSpacingProps

/**
 * "What you'll learn". A bound course's own `learning_objectives` win; the
 * written `items` are the fallback when the course has none (or no course is
 * bound). A bound course that is missing or a draft hides the section.
 */
export const CourseOutcomes: ComponentConfig<CourseOutcomesProps> = {
  label: 'Course Outcomes',
  fields: {
    courseId: {
      type: 'custom',
      label: 'Course',
      render: ({ value, onChange }) => <CoursePickerSingleField value={value as string | undefined} onChange={onChange} />,
    },
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    items: {
      type: 'array',
      label: 'Outcomes',
      arrayFields: { text: { type: 'text', label: 'Outcome' } },
      defaultItemProps: { text: 'A skill the student will have by the end' },
      getItemSummary: (item: OutcomeItem) => item.text || 'Outcome',
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    courseId: '',
    title: 'What you’ll learn',
    subtitle: '',
    // Prompts for the editor, not claims: a bound course's objectives replace them.
    items: [
      { text: 'Replace with the first thing a student will be able to do' },
      { text: 'A second concrete skill, in plain words' },
      { text: 'A third outcome: the result, not the topic' },
    ],
    ...sectionSpacingDefaults,
  },
  render: function CourseOutcomesView(props) {
    const { courseId, title, subtitle, items, puck } = props
    const t = useTranslations('puck.courseBlocks')
    const binding = resolveCourseBinding(puck?.metadata, courseId)
    const notice = useCourseNotice(binding)

    if (binding.state === 'missing' || binding.state === 'draft') {
      return puck?.isEditing ? <BindingNotice title={t('blocks.CourseOutcomes')} message={notice} /> : <></>
    }

    const objectives = binding.details?.objectives ?? []
    const list = objectives.length > 0 ? objectives : (items ?? []).map((i) => i?.text?.trim()).filter((s): s is string => !!s)
    if (!list.length) {
      return puck?.isEditing ? <BindingNotice title={t('blocks.CourseOutcomes')} message={t('notice.noOutcomes')} /> : <></>
    }

    return (
      <div {...sectionOuterProps(props)}>
        <div {...sectionInnerProps(props)}>
          {title && <h2 className="text-balance text-3xl font-semibold text-foreground">{title}</h2>}
          {subtitle && <p className="mt-3 max-w-2xl text-muted-foreground">{subtitle}</p>}
          <ul className="mt-8 grid gap-x-10 gap-y-4 sm:grid-cols-2">
            {list.map((text, i) => (
              <li key={i} className="flex items-start gap-3">
                <IconCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--brand-text,var(--primary))]" />
                <span className="text-foreground leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  },
}
