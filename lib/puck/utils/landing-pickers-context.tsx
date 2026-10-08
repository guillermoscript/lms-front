'use client'

/**
 * Editor-only contexts that expose the tenant's real products, plans and
 * teachers to Puck *custom fields* (the product / plan / teacher pickers),
 * mirroring `courses-context.tsx` for courses.
 *
 * Why contexts and not Puck `metadata`? A component's `render` receives
 * `puck.metadata`, but a field's custom `render` (the sidebar control) does
 * not. The public <Render> path never mounts field controls, so it needs no
 * provider; every hook defaults to [] outside one.
 *
 * `LandingPickerProviders` wires all four lists (courses included) from one
 * `metadata` object — the editor wraps <Puck> in it once.
 */
import { createContext, useContext } from 'react'
import type { LandingPlan, LandingProduct, LandingTeacher, PuckMetadata } from '../types'
import { LandingCoursesProvider } from './courses-context'

const LandingProductsContext = createContext<LandingProduct[]>([])
const LandingPlansContext = createContext<LandingPlan[]>([])
const LandingTeachersContext = createContext<LandingTeacher[]>([])

export function LandingProductsProvider({ value, children }: { value: LandingProduct[]; children: React.ReactNode }) {
  return <LandingProductsContext.Provider value={value}>{children}</LandingProductsContext.Provider>
}

export function useLandingProducts(): LandingProduct[] {
  return useContext(LandingProductsContext)
}

export function LandingPlansProvider({ value, children }: { value: LandingPlan[]; children: React.ReactNode }) {
  return <LandingPlansContext.Provider value={value}>{children}</LandingPlansContext.Provider>
}

export function useLandingPlans(): LandingPlan[] {
  return useContext(LandingPlansContext)
}

export function LandingTeachersProvider({ value, children }: { value: LandingTeacher[]; children: React.ReactNode }) {
  return <LandingTeachersContext.Provider value={value}>{children}</LandingTeachersContext.Provider>
}

export function useLandingTeachers(): LandingTeacher[] {
  return useContext(LandingTeachersContext)
}

const EMPTY: never[] = []

/** One wrapper for every picker list, fed from the editor's `metadata`. */
export function LandingPickerProviders({ metadata, children }: { metadata: PuckMetadata; children: React.ReactNode }) {
  return (
    <LandingCoursesProvider value={metadata.courses ?? EMPTY}>
      <LandingProductsProvider value={metadata.products ?? EMPTY}>
        <LandingPlansProvider value={metadata.plans ?? EMPTY}>
          <LandingTeachersProvider value={metadata.teachers ?? EMPTY}>{children}</LandingTeachersProvider>
        </LandingPlansProvider>
      </LandingProductsProvider>
    </LandingCoursesProvider>
  )
}
