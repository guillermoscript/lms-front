import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'
import { TENANT_BASE, LOCALE } from './utils/constants'
import { getServiceRoleClient, CODE_ACADEMY_TENANT } from './utils/seed-state'

// Throwaway content: no seeded lesson, exercise or exam is changed.
test('bulk content edits affect selected rows and preserve unchanged settings', async ({
  page
}) => {
  test.setTimeout(180_000)
  const admin = getServiceRoleClient()
  const { data: course, error: courseError } = await admin
    .from('courses')
    .select('author_id')
    .eq('course_id', 2001)
    .single()
  expect(courseError).toBeNull()
  const prefix = `Bulk QA ${Date.now()}`
  const created: { table: string; key: string; ids: number[] }[] = []
  try {
    for (const kind of ['lessons', 'exercises', 'exams'] as const) {
      const key = kind === 'exams' ? 'exam_id' : 'id'
      const rows = [1, 2].map((n) => ({
        title: `${prefix} ${kind} ${n}`,
        course_id: 2001,
        tenant_id: CODE_ACADEMY_TENANT,
        status: 'draft',
        ...(kind === 'lessons'
          ? { sequence: 900 + n, is_preview: false }
          : kind === 'exercises'
            ? {
                created_by: course!.author_id,
                instructions: 'QA',
                exercise_type: 'fill_in_the_blank',
                difficulty_level: 'easy',
                time_limit: 10
              }
            : {
                created_by: course!.author_id,
                duration: 10,
                sequence: 900 + n
              })
      }))
      const { data, error } = await admin.from(kind).insert(rows).select(key)
      expect(error).toBeNull()
      created.push({
        table: kind,
        key,
        ids: data!.map((row) => Number('id' in row ? row.id : row.exam_id))
      })
    }
    await loginAsAdmin(page)
    for (const { table, key, ids } of created) {
      await page.goto(
        `${TENANT_BASE}/${LOCALE}/dashboard/teacher/courses/2001?tab=${table}`
      )
      const tab = page.getByRole('tabpanel')
      await tab.getByLabel('Search', { exact: true }).fill(prefix)
      await tab
        .getByRole('checkbox', {
          name: `Select ${prefix} ${table} 1`,
          exact: true
        })
        .check()
      await expect(tab.getByRole('status')).toHaveText('1 selected')
      await tab.getByRole('button', { name: 'Publish', exact: true }).click()
      await expect
        .poll(async () => {
          const { data } = await admin
            .from(table)
            .select('status')
            .eq(key, ids[0])
            .single()
          return data?.status
        })
        .toBe('published')
      const untouched = await admin
        .from(table)
        .select('status')
        .eq(key, ids[1])
        .single()
      expect(untouched.data?.status).toBe('draft')
      await expect(tab.getByRole('status')).toHaveText('0 selected')
      for (let n = 1; n <= 2; n++)
        await tab
          .getByRole('checkbox', {
            name: `Select ${prefix} ${table} ${n}`,
            exact: true
          })
          .check()
      await tab.getByRole('button', { name: 'Bulk edit', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(
        dialog.getByRole('button', { name: 'Apply changes' })
      ).toBeDisabled()
      const field =
        table === 'lessons'
          ? 'Free preview'
          : table === 'exercises'
            ? 'Difficulty'
            : 'Duration (minutes)'
      if (table === 'exams') {
        await dialog.getByLabel(field, { exact: true }).fill('25')
      } else {
        await dialog.getByLabel(field, { exact: true }).click()
        await page
          .getByRole('option', {
            name: table === 'lessons' ? 'Enable free preview' : 'Hard',
            exact: true
          })
          .click()
      }
      await dialog.getByRole('button', { name: 'Apply changes' }).click()
      await expect(dialog).not.toBeVisible()
      const result = await admin.from(table).select('*').in(key, ids).order(key)
      expect(result.error).toBeNull()
      expect(result.data!.map((row) => row.status)).toEqual([
        'published',
        'draft'
      ])
      for (const row of result.data!) {
        if (table === 'lessons') expect(row.is_preview).toBe(true)
        else if (table === 'exercises') {
          expect(row.difficulty_level).toBe('hard')
          expect(row.time_limit).toBe(10)
        } else expect(row.duration).toBe(25)
      }
      // Changing filters clears active selection; Select all targets visible rows only.
      await tab
        .getByRole('checkbox', {
          name: `Select ${prefix} ${table} 1`,
          exact: true
        })
        .check()
      await tab
        .getByLabel('Search', { exact: true })
        .fill(`${prefix} ${table} 2`)
      await expect(tab.getByRole('status')).toHaveText('0 selected')
      await tab
        .getByRole('checkbox', { name: 'Select all', exact: true })
        .check()
      await tab.getByRole('button', { name: 'Archive', exact: true }).click()
      await expect
        .poll(async () => {
          const { data } = await admin
            .from(table)
            .select('status')
            .eq(key, ids[1])
            .single()
          return data?.status
        })
        .toBe('archived')
      const hidden = await admin
        .from(table)
        .select('status')
        .eq(key, ids[0])
        .single()
      expect(hidden.data?.status).toBe('published')
      await tab
        .getByRole('button', {
          name: `Actions for ${prefix} ${table} 2`,
          exact: true
        })
        .click()
      await page
        .getByRole('menuitem', { name: 'Restore to draft', exact: true })
        .click()
      await expect
        .poll(async () => {
          const { data } = await admin
            .from(table)
            .select('status')
            .eq(key, ids[1])
            .single()
          return data?.status
        })
        .toBe('draft')
    }
    await page.screenshot({
      path: 'test-results/teacher-bulk-after.png',
      fullPage: true
    })
  } finally {
    for (const { table, key, ids } of created.reverse()) {
      const { error } = await admin.from(table).delete().in(key, ids)
      expect(error).toBeNull()
    }
  }
})
