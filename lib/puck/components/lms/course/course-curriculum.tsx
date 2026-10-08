import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
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

export type CourseCurriculumProps = {
  courseId: string
  title: string
  subtitle: string
  maxLessons: number
  showPreviewBadges: boolean
} & SectionSpacingProps

/**
 * The ordered lesson titles of ONE real course (published lessons whose
 * schedule has passed — never lesson content). Free-preview lessons link to
 * the public preview route when the school allows previews.
 */
export const CourseCurriculum: ComponentConfig<CourseCurriculumProps> = {
  label: 'Course Curriculum',
  fields: {
    courseId: {
      type: 'custom',
      label: 'Course',
      render: ({ value, onChange }) => <CoursePickerSingleField value={value as string | undefined} onChange={onChange} />,
    },
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    maxLessons: { type: 'number', label: 'Max Lessons', min: 1, max: 100 },
    showPreviewBadges: {
      type: 'radio',
      label: 'Show Preview Badges',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    courseId: '',
    title: 'What’s inside',
    subtitle: '',
    maxLessons: 12,
    showPreviewBadges: true,
    ...sectionSpacingDefaults,
    maxWidth: 'md',
  },
  render: function CourseCurriculumView(props) {
    const { courseId, title, subtitle, maxLessons, showPreviewBadges, puck } = props
    const t = useTranslations('puck.courseBlocks')
    const binding = resolveCourseBinding(puck?.metadata, courseId)
    const notice = useCourseNotice(binding)
    const details = binding.details

    if (binding.state !== 'ready' || !details || details.lessons.length === 0) {
      if (!puck?.isEditing) return <></>
      const message = binding.state !== 'ready' ? notice : !details ? t('notice.loading') : t('notice.noLessons')
      return <BindingNotice title={t('blocks.CourseCurriculum')} message={message} />
    }

    const cap = Math.max(1, Math.floor(maxLessons || 12))
    const shown = details.lessons.slice(0, cap)
    const hidden = details.lessons.length - shown.length
    const canPreview = showPreviewBadges && details.previewEnabled

    return (
      <div {...sectionOuterProps(props)}>
        <div {...sectionInnerProps(props)}>
          {title && <h2 className="text-balance text-3xl font-semibold text-foreground">{title}</h2>}
          {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
          <p className="mt-2 text-sm text-muted-foreground">{t('lessons', { count: details.lessonCount })}</p>
          <ol className="mt-8 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {shown.map((lesson, i) => {
              const preview = canPreview && lesson.isPreview
              const href = `/courses/${encodeURIComponent(details.id)}/lessons/${encodeURIComponent(lesson.id)}`
              return (
                <li key={lesson.id} className="flex items-center gap-4 px-5 py-4">
                  <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                  {preview ? (
                    <a href={href} className="min-w-0 flex-1 truncate text-foreground underline-offset-4 hover:underline">
                      {lesson.title}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-foreground">{lesson.title}</span>
                  )}
                  {preview && (
                    <Badge variant="secondary" className="shrink-0">
                      {t('previewBadge')}
                    </Badge>
                  )}
                </li>
              )
            })}
          </ol>
          {hidden > 0 && (
            <p className="mt-4 text-sm">
              <a href={`/courses/${encodeURIComponent(details.id)}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                {t('moreLessons', { count: hidden })}
              </a>
            </p>
          )}
        </div>
      </div>
    )
  },
}
