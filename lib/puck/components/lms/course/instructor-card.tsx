import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import type { PuckMetadata } from '../../../types'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterProps,
  sectionInnerProps,
} from '../../../utils/section-spacing'
import { CoursePickerSingleField } from '../course-picker-single-field'
import { TeacherPickerSingleField } from '../product-picker-field'
import { resolveCourseBinding } from './binding'
import { AuthorAvatar, BindingNotice } from './course-ui'
import { useCourseNotice } from './use-course-notice'

export type InstructorCardProps = {
  source: 'course' | 'teacher'
  courseId: string
  teacherUserId: string
  title: string
} & SectionSpacingProps

/**
 * The real instructor: a course's author, or a chosen teacher of this school.
 * Name, photo and bio come from their profile — nothing is written here, so
 * nothing can be invented. No name on the profile → the section is hidden.
 */
export const InstructorCard: ComponentConfig<InstructorCardProps> = {
  label: 'Instructor Card',
  fields: {
    source: {
      type: 'radio',
      label: 'Source',
      options: [
        { label: 'Course author', value: 'course' },
        { label: 'Teacher', value: 'teacher' },
      ],
    },
    courseId: {
      type: 'custom',
      label: 'Course',
      render: ({ value, onChange }) => <CoursePickerSingleField value={value as string | undefined} onChange={onChange} />,
    },
    teacherUserId: {
      type: 'custom',
      label: 'Teacher',
      render: ({ value, onChange }) => <TeacherPickerSingleField value={value as string | undefined} onChange={onChange} />,
    },
    title: { type: 'text', label: 'Title' },
    ...sectionSpacingFields,
  },
  defaultProps: {
    source: 'course',
    courseId: '',
    teacherUserId: '',
    title: 'Your instructor',
    ...sectionSpacingDefaults,
    maxWidth: 'md',
  },
  render: function InstructorCardView(props) {
    const { source, courseId, teacherUserId, title, puck } = props
    const t = useTranslations('puck.courseBlocks')
    const binding = resolveCourseBinding(puck?.metadata, courseId)
    const courseNotice = useCourseNotice(binding)

    let person: { name: string; avatar: string | null; bio: string | null } | null = null
    let message = ''
    if (source === 'teacher') {
      const teacher = teacherUserId
        ? ((puck?.metadata as PuckMetadata | undefined)?.teachers ?? []).find((m) => m.id === teacherUserId)
        : undefined
      if (teacher?.name) person = { name: teacher.name, avatar: teacher.avatar, bio: teacher.bio?.trim() || null }
      else message = teacherUserId ? t('notice.missingTeacher') : t('notice.unboundTeacher')
    } else if (binding.state !== 'ready') {
      message = courseNotice
    } else if (!binding.details) {
      message = t('notice.loading')
    } else if (binding.details.author?.name) {
      const a = binding.details.author
      person = { name: a.name ?? '', avatar: a.avatar, bio: a.bio }
    } else {
      message = t('notice.noAuthor')
    }

    if (!person) {
      return puck?.isEditing ? <BindingNotice title={t('blocks.InstructorCard')} message={message} /> : <></>
    }

    return (
      <div {...sectionOuterProps(props)}>
        <div {...sectionInnerProps(props)}>
          {title && <h2 className="text-balance text-3xl font-semibold text-foreground">{title}</h2>}
          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start">
            <AuthorAvatar name={person.name} src={person.avatar} size="lg" />
            <div className="min-w-0">
              <p className="text-xl font-semibold text-foreground">{person.name}</p>
              {person.bio && (
                <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">{person.bio}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  },
}
