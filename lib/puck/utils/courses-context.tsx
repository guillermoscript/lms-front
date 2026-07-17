'use client'

/**
 * Editor-only context that exposes the tenant's real published courses to Puck
 * *custom fields* (e.g. the CourseGrid course picker).
 *
 * Why a context and not Puck `metadata`? Component `render` receives `puck.metadata`,
 * but a field's custom `render` (the sidebar control) does not. The picker needs the
 * live course list to show titles/thumbnails instead of raw IDs, so the editor wraps
 * <Puck> in <LandingCoursesProvider value={courses}> and the field reads it here.
 *
 * The public <Render> path never mounts custom field controls, so it needs no provider;
 * the hook defaults to [] when used outside a provider.
 */
import { createContext, useContext } from 'react'
import type { LandingCourse } from '../types'

const LandingCoursesContext = createContext<LandingCourse[]>([])

export function LandingCoursesProvider({
  value,
  children,
}: {
  value: LandingCourse[]
  children: React.ReactNode
}) {
  return <LandingCoursesContext.Provider value={value}>{children}</LandingCoursesContext.Provider>
}

export function useLandingCourses(): LandingCourse[] {
  return useContext(LandingCoursesContext)
}
