/** Demo recordings use the dev server on port 3000 (E2E tests use 3001) */
export const BASE = 'http://lvh.me:3000'
export const TENANT_BASE = 'http://code-academy.lvh.me:3000'
export const LOCALE = 'en'

export const ACCOUNTS = {
  student: { email: 'student@e2etest.com', password: 'password123' },
  teacher: { email: 'owner@e2etest.com', password: 'password123' },
  admin: { email: 'creator@codeacademy.com', password: 'password123' },
  tenantStudent: { email: 'alice@student.com', password: 'password123' },
}

/** Named pause durations for cinematic pacing */
export const PAUSE = {
  /** Quick glance — 800ms */
  GLANCE: 800,
  /** Read a heading or short text — 1500ms */
  READ: 1500,
  /** Absorb a section or dashboard — 2500ms */
  ABSORB: 2500,
  /** Linger on an important view — 4000ms */
  LINGER: 4000,
} as const
