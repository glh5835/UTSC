import { describe, expect, it } from 'vitest'
import {
  createPersonalSkillsController,
  type PersonalSkillsGateway,
  type PersonalSkillsSnapshot,
} from '../src/features/profile/personalSkills'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function snapshot(label: string): PersonalSkillsSnapshot {
  return {
    experiences: [
      { id: `exp-${label}`, text: `${label} private experience`, created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z' },
    ],
    skills: [
      { id: `skill-${label}`, skill_id: 'python', source: 'experience', source_id: `exp-${label}`, confirmed_at: '2026-10-28T00:00:00Z' },
    ],
  }
}

function fakeGateway() {
  const reads: Deferred<PersonalSkillsSnapshot>[] = []
  const operations: { kind: string; deferred: Deferred<void> }[] = []
  const gateway: PersonalSkillsGateway = {
    load: () => {
      const d = deferred<PersonalSkillsSnapshot>()
      reads.push(d)
      return d.promise
    },
    createExperience: () => {
      const d = deferred<void>()
      operations.push({ kind: 'create', deferred: d })
      return d.promise
    },
    updateExperience: () => {
      const d = deferred<void>()
      operations.push({ kind: 'update', deferred: d })
      return d.promise
    },
    deleteExperience: () => {
      const d = deferred<void>()
      operations.push({ kind: 'delete', deferred: d })
      return d.promise
    },
    confirmSkill: () => {
      const d = deferred<void>()
      operations.push({ kind: 'confirm', deferred: d })
      return d.promise
    },
    revokeSkill: () => {
      const d = deferred<void>()
      operations.push({ kind: 'revoke', deferred: d })
      return d.promise
    },
  }
  return { gateway, reads, operations }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('personal skills controller: account and late-response isolation', () => {
  it('discards A data when B replaces the identity before A loads', async () => {
    const fake = fakeGateway()
    const controller = createPersonalSkillsController(() => fake.gateway)
    controller.setIdentity('A')
    const aRead = fake.reads[0]
    controller.setIdentity('B')
    const bRead = fake.reads[1]
    expect(controller.getPhase()).toEqual({ kind: 'loading' })

    aRead.resolve(snapshot('A'))
    await tick()
    expect(controller.getPhase()).toEqual({ kind: 'loading' })

    bRead.resolve(snapshot('B'))
    await tick()
    const phase = controller.getPhase()
    expect(phase.kind).toBe('ready')
    if (phase.kind === 'ready') {
      expect(phase.data.experiences[0].text).toBe('B private experience')
    }
  })

  it('discards A success and failure results after B or sign-out', async () => {
    const fake = fakeGateway()
    const controller = createPersonalSkillsController(() => fake.gateway)
    controller.setIdentity('A')
    fake.reads[0].resolve(snapshot('A'))
    await tick()

    const success = controller.createExperience('A private draft')
    const successOp = fake.operations[0]
    controller.setIdentity('B')
    fake.reads[1].resolve(snapshot('B'))
    await tick()
    successOp.deferred.resolve()
    expect(await success).toEqual({ ok: true, staleOwner: true })
    await tick()
    let phase = controller.getPhase()
    expect(phase.kind).toBe('ready')
    if (phase.kind === 'ready') expect(phase.data.experiences[0].text).toBe('B private experience')

    const failure = controller.updateExperience('exp-B', 'changed')
    const failureOp = fake.operations[1]
    controller.setIdentity(null)
    failureOp.deferred.reject(new Error('A delayed failure'))
    expect(await failure).toEqual({ ok: false, message: 'A delayed failure', staleOwner: true })
    expect(controller.getPhase()).toEqual({ kind: 'idle' })
  })

  it('A to B to A reloads A and ignores the first A request', async () => {
    const fake = fakeGateway()
    const controller = createPersonalSkillsController(() => fake.gateway)
    controller.setIdentity('A')
    const firstA = fake.reads[0]

    controller.setIdentity('B')
    const bRead = fake.reads[1]
    controller.setIdentity('A')
    expect(fake.reads).toHaveLength(3)
    const secondA = fake.reads[2]

    firstA.resolve(snapshot('STALE-A'))
    bRead.resolve(snapshot('B'))
    await tick()
    expect(controller.getPhase()).toEqual({ kind: 'loading' })

    secondA.resolve(snapshot('FRESH-A'))
    await tick()
    const phase = controller.getPhase()
    expect(phase.kind).toBe('ready')
    if (phase.kind === 'ready') {
      expect(phase.data.experiences[0].text).toBe('FRESH-A private experience')
      expect(phase.data.skills[0].skill_id).toBe('python')
    }
  })

  it('reports an operation failure without replacing the current loaded data', async () => {
    const fake = fakeGateway()
    const controller = createPersonalSkillsController(() => fake.gateway)
    controller.setIdentity('A')
    fake.reads[0].resolve(snapshot('A'))
    await tick()
    const action = controller.confirmSkill({ skillId: 'python', source: 'experience', sourceId: 'exp-A' })
    fake.operations[0].deferred.reject(new Error('insert denied'))
    expect(await action).toEqual({ ok: false, message: 'insert denied' })
    const phase = controller.getPhase()
    expect(phase.kind).toBe('ready')
    if (phase.kind === 'ready') expect(phase.data.experiences[0].text).toBe('A private experience')
  })

  it('returns idle immediately when signing out', () => {
    const fake = fakeGateway()
    const controller = createPersonalSkillsController(() => fake.gateway)
    controller.setIdentity('A')
    expect(controller.getPhase()).toEqual({ kind: 'loading' })
    controller.setIdentity(null)
    expect(controller.getPhase()).toEqual({ kind: 'idle' })
  })
})
