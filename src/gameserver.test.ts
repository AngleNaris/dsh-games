/**
 * HTTP-level tests for protocol v3 auth and report validation.
 * @module dsh-games/gameserver.test
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defaultGameRules } from './gameconfig.ts'
import { handleGameServer } from './gameserver.ts'
import { PetStore } from './pets.ts'
import { RoomStore } from './rooms.ts'
import { AntiCheatGuard } from './anticheat.ts'
import { crownCounts, crownUnits } from './crowns.ts'

const SERVER_TOKEN = 'server-secret'
const MEMBER_A = 'member-a1'
const MEMBER_B = 'member-b2'

let server: Server
let base = ''
let tempDir = ''

function member(memberId: string, nickname: string) {
  const tokens = 10
  return {
    memberId,
    nickname,
    tokens,
    crowns: crownCounts(crownUnits(tokens, 1_000_000), 3),
    phase: 'idle',
  }
}

function auth(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${SERVER_TOKEN}`)
  return { ...init, headers }
}

async function json(path: string, init?: RequestInit): Promise<{
  response: Response
  body: Record<string, unknown>
}> {
  const response = await fetch(`${base}${path}`, init)
  return {
    response,
    body: await response.json() as Record<string, unknown>,
  }
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'dsh-games-protocol-'))
  const rules = defaultGameRules()
  const rooms = new RoomStore({
    antiCheat: new AntiCheatGuard({
      rules: rules.crown,
      stateFile: join(tempDir, 'anticheat.json'),
    }),
  })
  const pets = new PetStore(join(tempDir, 'pets'))
  server = createServer((req, res) => {
    const result = handleGameServer(req, res, {
      rooms,
      pets,
      rules,
      authToken: SERVER_TOKEN,
    })
    if (result instanceof Promise) {
      void result.catch((error) => {
        if (res.writableEnded) return
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }))
      })
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  base = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error))
  })
  rmSync(tempDir, { recursive: true, force: true })
})

describe('game server protocol v3', () => {
  it('exposes public health and advertises both auth headers on preflight', async () => {
    const health = await json('/api/games/health')
    expect(health.response.status).toBe(200)
    expect(health.body).toEqual({ ok: true, protocolVersion: 3 })

    const response = await fetch(`${base}/api/games/rooms`, { method: 'OPTIONS' })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-headers'))
      .toContain('x-dsh-member-token')
    expect(response.headers.get('access-control-allow-headers'))
      .toContain('authorization')
  })

  it('requires Bearer auth and rejects query auth on JSON routes', async () => {
    const result = await json('/api/games/rooms')

    expect(result.response.status).toBe(401)
    expect(result.body).toEqual({ ok: false, error: 'unauthorized' })

    const query = await json(`/api/games/rooms?token=${SERVER_TOKEN}`)
    expect(query.response.status).toBe(401)

    const bearer = await json('/api/games/rules', auth())
    expect(bearer.response.status).toBe(200)
  })

  it('keeps query auth only for native pet image GET compatibility', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const upload = await fetch(`${base}/api/games/pets/member-img`, auth({
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: png,
    }))
    expect(upload.status).toBe(200)

    const anonymous = await fetch(`${base}/api/games/pets/member-img`)
    expect(anonymous.status).toBe(401)

    const compatible = await fetch(`${base}/api/games/pets/member-img?token=${SERVER_TOKEN}`)
    expect(compatible.status).toBe(200)
    expect(compatible.headers.get('content-type')).toBe('image/png')
  })

  it('issues a private member token and enforces it across all mutations', async () => {
    const created = await json('/api/games/rooms', auth({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Protocol room' }),
    }))
    const room = created.body.room as { code: string }

    const aliceJoin = await json(
      `/api/games/rooms/${room.code}/join`,
      auth({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ member: member(MEMBER_A, 'Alice') }),
      }),
    )
    const aliceToken = aliceJoin.body.memberToken as string
    expect(aliceJoin.response.status).toBe(200)
    expect(aliceToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(JSON.stringify(aliceJoin.body.room)).not.toContain(aliceToken)

    const conflict = await json(
      `/api/games/rooms/${room.code}/join`,
      auth({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ member: member(MEMBER_A, 'Impostor') }),
      }),
    )
    expect(conflict.response.status).toBe(409)
    expect(conflict.body.error).toBe('member-conflict')

    const bobJoin = await json(
      `/api/games/rooms/${room.code}/join`,
      auth({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ member: member(MEMBER_B, 'Bob') }),
      }),
    )
    const bobToken = bobJoin.body.memberToken as string

    const spoofHeartbeat = await json(
      `/api/games/rooms/${room.code}/members`,
      auth({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dsh-member-token': bobToken,
        },
        body: JSON.stringify({ member: member(MEMBER_A, 'Impostor') }),
      }),
    )
    expect(spoofHeartbeat.response.status).toBe(401)
    expect(spoofHeartbeat.body.error).toBe('unauthorized')

    const spoofChat = await json(
      `/api/games/rooms/${room.code}/messages`,
      auth({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dsh-member-token': bobToken,
        },
        body: JSON.stringify({ message: { memberId: MEMBER_A, text: 'spoof' } }),
      }),
    )
    expect(spoofChat.response.status).toBe(401)

    const spoofLeave = await json(
      `/api/games/rooms/${room.code}/members/${MEMBER_A}`,
      auth({
        method: 'DELETE',
        headers: { 'x-dsh-member-token': bobToken },
      }),
    )
    expect(spoofLeave.response.status).toBe(401)

    const heartbeat = await json(
      `/api/games/rooms/${room.code}/members`,
      auth({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dsh-member-token': aliceToken,
        },
        body: JSON.stringify({ member: member(MEMBER_A, 'Alice') }),
      }),
    )
    expect(heartbeat.response.status).toBe(200)

    const leave = await json(
      `/api/games/rooms/${room.code}/members/${MEMBER_A}`,
      auth({
        method: 'DELETE',
        headers: { 'x-dsh-member-token': aliceToken },
      }),
    )
    expect(leave.response.status).toBe(200)
    expect(leave.body).toEqual({ ok: true, removed: true })
  })

  it('accepts but does not echo the legacy member size field', async () => {
    const created = await json('/api/games/rooms', auth({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }))
    const room = created.body.room as { code: string }
    const legacy = { ...member('member-z9', 'Legacy'), size: 256 }
    const joined = await json(`/api/games/rooms/${room.code}/join`, auth({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member: legacy }),
    }))

    expect(joined.response.status).toBe(200)
    const snapshot = joined.body.room as { members: Array<Record<string, unknown>> }
    expect(snapshot.members[0]).not.toHaveProperty('size')
  })

  it('rejects crown forgery and abnormal token growth', async () => {
    const created = await json('/api/games/rooms', auth({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }))
    const room = created.body.room as { code: string }
    const joined = await json(`/api/games/rooms/${room.code}/join`, auth({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member: member('member-c3', 'Carol') }),
    }))
    const memberToken = joined.body.memberToken as string

    const forged = member('member-c3', 'Carol')
    forged.crowns[0] = 1
    const mismatch = await json(`/api/games/rooms/${room.code}/members`, auth({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dsh-member-token': memberToken,
      },
      body: JSON.stringify({ member: forged }),
    }))
    expect(mismatch.response.status).toBe(422)
    expect(mismatch.body.error).toBe('crowns-mismatch')

    const jumped = member('member-c3', 'Carol')
    jumped.tokens = 2_000_000
    jumped.crowns = crownCounts(crownUnits(jumped.tokens, 1_000_000), 3)
    const jump = await json(`/api/games/rooms/${room.code}/members`, auth({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dsh-member-token': memberToken,
      },
      body: JSON.stringify({ member: jumped }),
    }))
    expect(jump.response.status).toBe(422)
    expect(jump.body.error).toBe('token-jump')
  })
})
