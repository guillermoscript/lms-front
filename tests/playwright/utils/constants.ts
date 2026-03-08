export const BASE = process.env.E2E_BASE_URL || 'http://lvh.me:3000'
export const TENANT_BASE = process.env.E2E_TENANT_BASE_URL || 'http://code-academy.lvh.me:3000'
export const LOCALE = 'en'

export const ACCOUNTS = {
  student: { email: 'student@e2etest.com', password: 'password123' },
  teacher: { email: 'owner@e2etest.com', password: 'password123' },
  admin: { email: 'creator@codeacademy.com', password: 'password123' },
  tenantStudent: { email: 'alice@student.com', password: 'password123' },
  /** Super admin — has a row in `super_admins` table */
  superAdmin: { email: 'owner@e2etest.com', password: 'password123' },
}
