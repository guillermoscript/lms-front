import type { DriveStep } from 'driver.js'

export function getTeacherDashboardTour(
  t: (key: string) => string
): DriveStep[] {
  return [
    {
      element: '[data-tour="teacher-welcome"]',
      popover: {
        title: t('tour.welcome.title'),
        description: t('tour.welcome.description'),
      },
    },
    {
      element: '[data-tour="teacher-stats"]',
      popover: {
        title: t('tour.stats.title'),
        description: t('tour.stats.description'),
      },
    },
    {
      element: '[data-tour="teacher-courses"]',
      popover: {
        title: t('tour.courses.title'),
        description: t('tour.courses.description'),
      },
    },
    {
      element: '[data-tour="sidebar-courses"]',
      popover: {
        title: t('tour.sidebarCourses.title'),
        description: t('tour.sidebarCourses.description'),
      },
    },
    {
      element: '[data-tour="sidebar-create-course"]',
      popover: {
        title: t('tour.sidebarCreate.title'),
        description: t('tour.sidebarCreate.description'),
      },
    },
  ]
}

export function getCourseEditorTour(
  t: (key: string) => string
): DriveStep[] {
  return [
    {
      element: '[data-tour="course-header"]',
      popover: {
        title: t('tour.header.title'),
        description: t('tour.header.description'),
      },
    },
    {
      element: '[data-tour="course-tabs"]',
      popover: {
        title: t('tour.tabs.title'),
        description: t('tour.tabs.description'),
      },
    },
    {
      element: '[data-tour="course-lessons"]',
      popover: {
        title: t('tour.lessons.title'),
        description: t('tour.lessons.description'),
      },
    },
    {
      element: '[data-tour="course-exercises"]',
      popover: {
        title: t('tour.exercises.title'),
        description: t('tour.exercises.description'),
      },
    },
    {
      element: '[data-tour="course-preview"]',
      popover: {
        title: t('tour.preview.title'),
        description: t('tour.preview.description'),
      },
    },
    {
      element: '[data-tour="course-settings"]',
      popover: {
        title: t('tour.settings.title'),
        description: t('tour.settings.description'),
      },
    },
  ]
}

export function getStudentDashboardTour(
  t: (key: string) => string
): DriveStep[] {
  return [
    {
      element: '[data-tour="student-welcome"]',
      popover: {
        title: t('tour.welcome.title'),
        description: t('tour.welcome.description'),
      },
    },
    {
      element: '[data-tour="student-stats"]',
      popover: {
        title: t('tour.stats.title'),
        description: t('tour.stats.description'),
      },
    },
    {
      element: '[data-tour="student-courses"]',
      popover: {
        title: t('tour.courses.title'),
        description: t('tour.courses.description'),
      },
    },
    {
      element: '[data-tour="student-sidebar"]',
      popover: {
        title: t('tour.sidebar.title'),
        description: t('tour.sidebar.description'),
      },
    },
    {
      element: '[data-tour="sidebar-browse"]',
      popover: {
        title: t('tour.sidebarBrowse.title'),
        description: t('tour.sidebarBrowse.description'),
      },
    },
    {
      element: '[data-tour="sidebar-progress"]',
      popover: {
        title: t('tour.sidebarProgress.title'),
        description: t('tour.sidebarProgress.description'),
      },
    },
  ]
}

export function getLessonEditorTour(
  t: (key: string) => string
): DriveStep[] {
  return [
    {
      element: '[data-tour="lesson-header"]',
      popover: {
        title: t('tour.header.title'),
        description: t('tour.header.description'),
      },
    },
    {
      element: '[data-tour="lesson-steps"]',
      popover: {
        title: t('tour.steps.title'),
        description: t('tour.steps.description'),
      },
    },
    {
      element: '[data-tour="lesson-editor-mode"]',
      popover: {
        title: t('tour.editorMode.title'),
        description: t('tour.editorMode.description'),
      },
    },
    {
      element: '[data-tour="lesson-preview"]',
      popover: {
        title: t('tour.preview.title'),
        description: t('tour.preview.description'),
      },
    },
    {
      element: '[data-tour="lesson-save"]',
      popover: {
        title: t('tour.save.title'),
        description: t('tour.save.description'),
      },
    },
  ]
}

export function getAdminDashboardTour(
  t: (key: string) => string
): DriveStep[] {
  return [
    {
      element: '[data-tour="admin-checklist"]',
      popover: {
        title: t('tour.checklist.title'),
        description: t('tour.checklist.description'),
      },
    },
    {
      element: '[data-tour="admin-plan"]',
      popover: {
        title: t('tour.plan.title'),
        description: t('tour.plan.description'),
      },
    },
    {
      element: '[data-tour="admin-stats"]',
      popover: {
        title: t('tour.stats.title'),
        description: t('tour.stats.description'),
      },
    },
    {
      element: '[data-tour="sidebar-settings"]',
      popover: {
        title: t('tour.sidebarSettings.title'),
        description: t('tour.sidebarSettings.description'),
      },
    },
    {
      element: '[data-tour="sidebar-courses"]',
      popover: {
        title: t('tour.sidebarCourses.title'),
        description: t('tour.sidebarCourses.description'),
      },
    },
  ]
}
