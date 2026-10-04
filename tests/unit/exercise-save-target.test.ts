import { describe, it, expect, vi } from 'vitest'
import { createExerciseSaveTarget } from '@/components/teacher/exercise-builder/save-target'

const ok = (exerciseId: number) => ({ success: true as const, data: { exerciseId } })

describe('createExerciseSaveTarget (#796)', () => {
  it('creates once, then updates the created row', async () => {
    const target = createExerciseSaveTarget()
    const create = vi.fn(async () => ok(42))
    const update = vi.fn(async (id: number) => ok(id))

    await target.save(create, update)
    await target.save(create, update)
    await target.save(create, update)

    expect(create).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledWith(42)
    expect(target.id).toBe(42)
  })

  it('updates straight away when opened on an existing exercise', async () => {
    const target = createExerciseSaveTarget(7)
    const create = vi.fn(async () => ok(99))
    const update = vi.fn(async (id: number) => ok(id))

    await target.save(create, update)

    expect(create).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(7)
  })

  it('a failed create leaves the next save creating', async () => {
    const target = createExerciseSaveTarget()
    const create = vi
      .fn()
      .mockResolvedValueOnce({ success: false as const, error: 'plan_limit_exceeded:courses' })
      .mockResolvedValueOnce(ok(5))
    const update = vi.fn(async (id: number) => ok(id))

    const first = await target.save(create, update)
    expect(first).toEqual({ success: false, error: 'plan_limit_exceeded:courses' })
    expect(target.id).toBeNull()

    await target.save(create, update)
    expect(create).toHaveBeenCalledTimes(2)
    expect(target.id).toBe(5)
  })

  it('drops a save fired while another is in flight', async () => {
    const target = createExerciseSaveTarget()
    let resolve!: (v: ReturnType<typeof ok>) => void
    const create = vi.fn(() => new Promise<ReturnType<typeof ok>>((r) => { resolve = r }))
    const update = vi.fn(async (id: number) => ok(id))

    const first = target.save(create, update)
    const second = await target.save(create, update)
    expect(second).toBeNull()

    resolve(ok(11))
    await first
    expect(create).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()

    // Released once settled — even when the call throws.
    await expect(target.save(create, () => Promise.reject(new Error('net')))).rejects.toThrow('net')
    await target.save(create, update)
    expect(update).toHaveBeenCalledWith(11)
    expect(create).toHaveBeenCalledTimes(1)
  })
})
