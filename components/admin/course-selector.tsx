'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTranslations } from 'next-intl'
import { IconSearch } from '@tabler/icons-react'

interface Course {
  course_id: number
  title: string
  status: string
}

interface CourseSelectorProps {
  selectedCourses: number[]
  onChange: (courseIds: number[]) => void
}

export function CourseSelector({ selectedCourses, onChange }: CourseSelectorProps) {
  const t = useTranslations('common.courseSelector')
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function loadCourses() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('courses')
        .select('course_id, title, status')
        .eq('status', 'published')
        .order('title')

      if (!error && data) {
        setCourses(data)
      }
      setLoading(false)
    }
    loadCourses()
  }, [])

  const toggleCourse = (courseId: number) => {
    if (selectedCourses.includes(courseId)) {
      onChange(selectedCourses.filter(id => id !== courseId))
    } else {
      onChange([...selectedCourses, courseId])
    }
  }

  const filteredCourses = courses.filter(course =>
    course.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>{t('label')}</Label>
        <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
          {t('loading')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label>{t('label')}</Label>

      {/* Search */}
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Course List */}
      <ScrollArea className="h-64 rounded-lg border p-3">
        {filteredCourses.length > 0 ? (
          <div className="space-y-3">
            {filteredCourses.map(course => (
              <div key={course.course_id} className="flex items-start space-x-3">
                <Checkbox
                  id={`course-${course.course_id}`}
                  checked={selectedCourses.includes(course.course_id)}
                  onCheckedChange={() => toggleCourse(course.course_id)}
                />
                <Label
                  htmlFor={`course-${course.course_id}`}
                  className="text-sm font-normal leading-tight cursor-pointer flex-1"
                >
                  {course.title}
                </Label>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {searchQuery ? t('noResults') : t('noAvailable')}
          </div>
        )}
      </ScrollArea>

      <p className="text-sm text-muted-foreground">
        {t('selected', { count: selectedCourses.length })}
      </p>
    </div>
  )
}
