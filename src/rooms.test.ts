/**
 * Unit tests for room membership authentication, chat, expiry, and codes.
 * @module dsh-games/rooms.test
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MEMBER_TTL_MS,
  MESSAGE_COOLDOWN_MS,
  MESSAGE_TTL_MS,
  RoomStore,
  normalizeCode,
} from './rooms.ts'

const MEMBER_A = 'member-a1'
const MEMBER_B = 'member-b2'

function report(memberId = MEMBER_A, nickname = 'Alice') {
  return {
    memberId,
    nickname,
    tokens: 10,
    phase: 'idle' as const,
  }
}

function join(
  store: RoomStore,
  code: string,
  memberId = MEMBER_A,
  nickname = 'Alice',
  now = 1_000,
) {
  const result = store.joinMember(code, report(memberId, nickname), now)
  if (!result.ok) throw new Error(`join failed: ${result.error}`)
  return result
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RoomStore member sessions', () => {
  it('normalizes identities and keeps the token out of room snapshots', () => {
    const store = new RoomStore()
    const room = store.createRoom({}, 100)
    const joined = join(store, room.code, `  ${MEMBER_A}  `, `  ${'A'.repeat(30)}  `)

    expect(joined.memberToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(joined.room.protocolVersion).toBe(3)
    expect(joined.room.members).toHaveLength(1)
    expect(joined.room.members[0].memberId).toBe(MEMBER_A)
    expect(joined.room.members[0].nickname).toBe('A'.repeat(24))
    expect(JSON.stringify(joined.room)).not.toContain(joined.memberToken)
    expect(JSON.stringify(store.getRoom(room.code))).not.toContain(joined.memberToken)

    expect(store.removeMember(room.code, ` ${MEMBER_A} `, joined.memberToken)).toEqual({
      ok: true,
      removed: true,
    })
  })

  it('rejects malformed members, conflicts, and members over capacity', () => {
    const store = new RoomStore({ maxMembers: 1 })
    const room = store.createRoom()

    expect(store.joinMember(room.code, report('short', 'Alice'))).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(store.joinMember(room.code, report(MEMBER_A, '   '))).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(store.joinMember(room.code, report(MEMBER_A, 'Alice')).ok).toBe(true)
    expect(store.joinMember(room.code, report(MEMBER_A, 'Alice'))).toEqual({
      ok: false,
      error: 'member-conflict',
    })
    expect(store.joinMember(room.code, report(MEMBER_B, 'Bob'))).toEqual({
      ok: false,
      error: 'room-full',
    })
  })

  it('requires the issued token for heartbeat and rejects another member token', () => {
    const store = new RoomStore()
    const room = store.createRoom({}, 1_000)
    const alice = join(store, room.code, MEMBER_A, 'Alice', 1_000)
    const bob = join(store, room.code, MEMBER_B, 'Bob', 1_000)

    expect(store.heartbeatMember(room.code, report(MEMBER_A, 'Alice'), 'x'.repeat(43), 1_100))
      .toEqual({ ok: false, error: 'unauthorized' })
    expect(store.heartbeatMember(room.code, report(MEMBER_A, 'Alice'), bob.memberToken, 1_100))
      .toEqual({ ok: false, error: 'unauthorized' })

    const heartbeat = store.heartbeatMember(
      room.code,
      { ...report(MEMBER_A, 'Alice 2'), tokens: 99 },
      alice.memberToken,
      1_100,
    )
    expect(heartbeat.ok).toBe(true)
    if (heartbeat.ok) {
      expect(heartbeat.room.members.find((member) => member.memberId === MEMBER_A)).toMatchObject({
        nickname: 'Alice 2',
        tokens: 99,
        lastSeen: 1_100,
      })
    }
  })

  it('round-trips phase and token-output activity through room snapshots', () => {
    const store = new RoomStore()
    const room = store.createRoom({}, 1_000)
    const alice = join(store, room.code, MEMBER_A, 'Alice', 1_000)

    const active = store.heartbeatMember(
      room.code,
      { ...report(), phase: 'thinking', active: true },
      alice.memberToken,
      1_100,
    )
    expect(active.ok && active.room.members[0]).toMatchObject({
      phase: 'thinking',
      active: true,
    })

    const sleeping = store.heartbeatMember(
      room.code,
      { ...report(), phase: 'done', active: false },
      alice.memberToken,
      1_200,
    )
    expect(sleeping.ok && sleeping.room.members[0]).toMatchObject({
      phase: 'done',
      active: false,
    })
  })

  it('ignores legacy member size so each observer controls all pet sizes locally', () => {
    const store = new RoomStore()
    const room = store.createRoom({}, 1_000)
    const joined = store.joinMember(room.code, {
      ...report(),
      size: 320,
    } as ReturnType<typeof report> & { size: number }, 1_000)

    expect(joined.ok).toBe(true)
    if (joined.ok) {
      expect(joined.room.members[0]).not.toHaveProperty('size')
    }
  })

  it('does not let member B remove member A', () => {
    const store = new RoomStore()
    const room = store.createRoom()
    const alice = join(store, room.code, MEMBER_A, 'Alice')
    const bob = join(store, room.code, MEMBER_B, 'Bob')

    expect(store.removeMember(room.code, MEMBER_A, bob.memberToken)).toEqual({
      ok: false,
      error: 'unauthorized',
    })
    expect(store.removeMember(room.code, MEMBER_A, alice.memberToken)).toEqual({
      ok: true,
      removed: true,
    })
  })

  it('sweeps stale members after their heartbeat TTL', () => {
    const store = new RoomStore({ memberTtlMs: 100, roomTtlMs: 1_000 })
    const room = store.createRoom({}, 1_000)
    join(store, room.code, MEMBER_A, 'Alice', 1_000)

    store.sweep(1_101)

    expect(store.getRoom(room.code)?.members).toHaveLength(0)
  })

  it('keeps background-throttled members for the two-minute browser lease', () => {
    expect(DEFAULT_MEMBER_TTL_MS).toBe(120_000)
    const store = new RoomStore({ roomTtlMs: 1_000 })
    const room = store.createRoom({}, 1_000)
    join(store, room.code, MEMBER_A, 'Alice', 1_000)

    store.sweep(121_000)
    expect(store.getRoom(room.code)?.members).toHaveLength(1)

    store.sweep(121_001)
    expect(store.getRoom(room.code)?.members).toHaveLength(0)
  })

  it('starts empty-room expiry when an old occupied room actually becomes empty', () => {
    const store = new RoomStore({ memberTtlMs: 100, roomTtlMs: 1_000 })
    const room = store.createRoom({}, 0)
    join(store, room.code, MEMBER_A, 'Alice', 0)

    store.sweep(10_000)
    expect(store.getRoom(room.code)?.members).toHaveLength(0)

    store.sweep(10_999)
    expect(store.getRoom(room.code)).toBeDefined()

    store.sweep(11_001)
    expect(store.getRoom(room.code)).toBeUndefined()
  })
})

describe('RoomStore authenticated chat', () => {
  it('requires membership and the matching token, using the stored nickname', () => {
    const store = new RoomStore()
    const room = store.createRoom({}, 1_000)

    expect(store.addMessage(room.code, {
      memberId: MEMBER_A,
      text: 'hello',
    }, 'x'.repeat(43), 1_100)).toEqual({ ok: false, error: 'member-not-found' })

    const alice = join(store, room.code, MEMBER_A, 'Alice', 1_000)
    const bob = join(store, room.code, MEMBER_B, 'Bob', 1_000)
    expect(store.addMessage(room.code, {
      memberId: MEMBER_A,
      text: 'hello',
    }, bob.memberToken, 1_100)).toEqual({ ok: false, error: 'unauthorized' })

    const result = store.addMessage(room.code, {
      memberId: ` ${MEMBER_A} `,
      text: ' hello ',
    }, alice.memberToken, 1_100)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.room.messages).toEqual([{
        memberId: MEMBER_A,
        nickname: 'Alice',
        text: 'hello',
        at: 1_100,
      }])
    }
  })

  it('enforces cooldown and removes expired messages', () => {
    const store = new RoomStore()
    const room = store.createRoom({}, 1_000)
    const alice = join(store, room.code, MEMBER_A, 'Alice', 1_000)

    expect(store.addMessage(room.code, {
      memberId: MEMBER_A,
      text: 'one',
    }, alice.memberToken, 2_000).ok).toBe(true)
    expect(store.addMessage(room.code, {
      memberId: MEMBER_A,
      text: 'two',
    }, alice.memberToken, 2_000 + MESSAGE_COOLDOWN_MS - 1))
      .toEqual({ ok: false, error: 'cooldown' })
    expect(store.addMessage(room.code, {
      memberId: MEMBER_A,
      text: 'two',
    }, alice.memberToken, 2_000 + MESSAGE_COOLDOWN_MS).ok).toBe(true)

    store.sweep(2_000 + MESSAGE_COOLDOWN_MS + MESSAGE_TTL_MS)
    expect(store.getRoom(room.code)?.messages).toHaveLength(0)
  })
})

describe('RoomStore room codes', () => {
  it('uses a valid collision-free fallback after repeated random collisions', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const store = new RoomStore()
    const first = store.createRoom({}, 0)
    const second = store.createRoom({}, 0)

    expect(first.code).toBe('AAAA')
    expect(second.code).not.toBe(first.code)
    expect(normalizeCode(second.code)).toBe(second.code)
    expect(store.getRoom(first.code)?.code).toBe(first.code)
    expect(store.getRoom(second.code)?.code).toBe(second.code)
  })
})
