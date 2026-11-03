import { expect, it, vi } from 'vitest'
import { createFavoritesController, type Favorite } from '../src/features/favorites/controller'

const tick = async () => { await Promise.resolve(); await Promise.resolve() }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
it('persists only explicit actions and refreshes the actual saved rows', async () => {
  let rows: Favorite[] = []
  const add = vi.fn(async () => { rows = [{ target_type: 'resource', target_id: 'sql', created_at: '2026-11-02' }] })
  const controller = createFavoritesController({ load: async () => rows, add, remove: async () => { rows = [] } })
  controller.setIdentity('A'); await tick(); expect(add).not.toHaveBeenCalled()
  expect(await controller.toggle('resource', 'sql', false)).toEqual({ ok: true })
  expect(controller.getPhase()).toEqual({ kind: 'ready', items: rows })
  expect(await controller.toggle('resource', 'sql', true)).toEqual({ ok: true })
  expect(controller.getPhase()).toEqual({ kind: 'ready', items: [] })
})
it('blocks same-tick duplicate saves', async () => {
  const write = deferred<void>(), add = vi.fn(() => write.promise)
  const controller = createFavoritesController({ load: async () => [], add, remove: async () => {} })
  controller.setIdentity('A'); await tick()
  const first = controller.toggle('resource', 'sql', false)
  expect(await controller.toggle('resource', 'sql', false)).toEqual({ ok: false, pending: true })
  expect(await controller.toggle('opportunity', 'another-target', false)).toEqual({ ok: false, pending: true })
  expect(add).toHaveBeenCalledTimes(1); write.resolve(); await first
})
it.each(['success', 'failure'])('discards a late %s after A→B→A', async outcome => {
  const write = deferred<void>(), load = vi.fn(async () => [])
  const controller = createFavoritesController({ load, add: () => write.promise, remove: async () => {} })
  controller.setIdentity('A'); await tick(); const first = controller.toggle('opportunity', 'event', false)
  controller.setIdentity('B'); await tick(); controller.setIdentity('A'); await tick()
  const calls = load.mock.calls.length
  if (outcome === 'success') write.resolve(); else write.reject(new Error('old account error'))
  expect(await first).toMatchObject({ staleOwner: true }); expect(load).toHaveBeenCalledTimes(calls)
  expect(controller.getPhase()).toEqual({ kind: 'ready', items: [] })
})
it('does not publish late initial rows after sign-out', async () => {
  const read = deferred<Favorite[]>()
  const controller = createFavoritesController({ load: () => read.promise, add: async () => {}, remove: async () => {} })
  controller.setIdentity('A'); controller.setIdentity(null)
  read.resolve([{ target_type: 'resource', target_id: 'private', created_at: '' }]); await tick()
  expect(controller.getPhase()).toEqual({ kind: 'idle' })
})
