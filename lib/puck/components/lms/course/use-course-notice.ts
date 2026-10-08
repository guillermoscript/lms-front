import { useTranslations } from 'next-intl'
import type { CourseBinding, ProductBinding } from './binding'

/** The editor notice copy for a course binding that is not ready ('' when ready). */
export function useCourseNotice(binding: CourseBinding): string {
  const t = useTranslations('puck.courseBlocks.notice')
  switch (binding.state) {
    case 'unbound':
      return t('unboundCourse')
    case 'missing':
      return t('missingCourse')
    case 'draft':
      return t('draftCourse', { title: binding.course?.title ?? '' })
    default:
      return ''
  }
}

/** The editor notice copy for a product binding that is not ready ('' when ready). */
export function useProductNotice(binding: ProductBinding): string {
  const t = useTranslations('puck.courseBlocks.notice')
  switch (binding.state) {
    case 'unbound':
      return t('unboundProduct')
    case 'missing':
      return t('missingProduct')
    default:
      return ''
  }
}
