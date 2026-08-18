/**
 * Shared game-server HTTP surface — the multiplayer room protocol plus the
 * custom-pet store, as plain node:http handlers with permissive CORS. One
 * implementation serves two deployments:
 *
 *  - the DSH host mounts it in-process under `/api/games/rooms*` and
 *    `/api/games/pets*` (local prototype play, no extra server needed);
 *  - the standalone `dsh-games-server` entry serves exactly the same surface
 *    in Docker (the deployable game server the clients talk to).
 *
 * Security posture:
 *  - when the server config carries an `authToken`, EVERY request (rooms,
 *    pets, rules) must pass it as `Authorization: Bearer <authToken>` —
 *    CORS preflights and the public health endpoint excepted. Authenticated
 *    pet image GETs also accept the query token because native img elements
 *    cannot attach headers;
 *  - pet uploads are validated server-side (magic bytes + decoded pixel
 *    dimensions), capped by the configured byte/dimension limits, and the
 *    request body is rejected early via Content-Length when it is obviously
 *    over the cap.
 *
 * Everything is CORS-open (`*`) so any DSH instance's browser may talk to any
 * game server it holds the token for.
 * @module @anglenaris/dsh-games/gameserver
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  normalizeMemberId,
  normalizeNickname,
  type RoomStore,
  type MemberReport,
} from './rooms.ts'
import type { PetStore } from './pets.ts'
import type { GameRules } from './gameconfig.ts'

/** Browser-facing base paths of the shared game-server surface. */
export const ROOM_API_PREFIX = '/api/games/rooms'
export const PET_API_PREFIX = '/api/games/pets'
export const RULES_API_PATH = '/api/games/rules'
export const HEALTH_API_PATH = '/api/games/health'

/** CORS headers applied to every shared-surface response (open relay). */
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-dsh-member-token',
} as const

/** The stores and policy the shared surface needs. */
export interface GamesServerContext {
  rooms: RoomStore
  pets: PetStore
  /** Enforced rule set (served at /api/games/rules too). */
  rules: GameRules
  /** Shared secret; when set, every non-preflight request must carry it. */
  authToken?: string
}

/** Write one CORS + JSON response. */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
  })
  res.end(JSON.stringify(body))
}

/** Answer a shared-surface OPTIONS preflight (no auth needed). */
function preflight(res: ServerResponse): void {
  res.writeHead(204, CORS_HEADERS)
  res.end()
}

/** Constant-time token comparison (length leak is irrelevant here). */
function tokenMatches(expected: string, given: string): boolean {
  if (expected.length !== given.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  }
  return diff === 0
}

/** Read the opaque member-session bearer from its dedicated request header. */
function memberTokenOf(req: IncomingMessage): string {
  const value = req.headers['x-dsh-member-token']
  return typeof value === 'string' ? value : ''
}

/** Convert RoomStore result errors into stable HTTP status codes. */
function roomErrorStatus(error: string): number {
  switch (error) {
    case 'invalid':
      return 400
    case 'token-regression':
      return 409
    case 'crowns-mismatch':
    case 'token-jump':
      return 422
    case 'anti-cheat-locked':
    case 'cooldown':
      return 429
    case 'unauthorized':
      return 401
    case 'member-conflict':
    case 'room-full':
      return 409
    default:
      return 404
  }
}

/**
 * Enforce the auth token. Returns true when the request may proceed; false
 * when a 401 (or preflight pass) was already written.
 */
function requireAuth(req: IncomingMessage, res: ServerResponse, ctx: GamesServerContext): boolean {
  if (req.method === 'OPTIONS') {
    preflight(res)
    return false
  }
  if (ctx.authToken === undefined || ctx.authToken === '') return true
  const url = new URL(req.url ?? '/', 'http://localhost')
  const authorization = req.headers.authorization
  const bearer = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''
  const petImageToken = req.method === 'GET' && url.pathname.startsWith(`${PET_API_PREFIX}/`)
    ? url.searchParams.get('token') ?? ''
    : ''
  const given = bearer !== '' ? bearer : petImageToken
  if (tokenMatches(ctx.authToken, given)) return true
  json(res, 401, { ok: false, error: 'unauthorized' })
  return false
}

/** Read a raw request body (bounded; rejects above `max` bytes). */
function readRawBody(req: IncomingMessage, max: number): Promise<Buffer> {
  // Early reject when the client already declared an oversized body: stop
  // before buffering a single byte of it.
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > max) {
    return Promise.reject(new Error('body-too-large'))
  }
  return new Promise((resolve, reject) => {
    let size = 0
    let overflowed = false
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      if (overflowed) return
      size += chunk.length
      if (size > max) {
        // Reject without destroying the socket: the caller writes its error
        // response (413) and the request keeps draining in the background.
        overflowed = true
        reject(new Error('body-too-large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (overflowed) return
      resolve(chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks))
    })
    req.on('error', (error) => {
      if (!overflowed) reject(error)
    })
  })
}

/** Read a JSON request body (bounded). */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return readRawBody(req, 64 * 1024).then((buffer) => {
    if (buffer.length === 0) return {}
    try {
      return JSON.parse(buffer.toString('utf8')) as unknown
    } catch {
      throw new Error('invalid-json')
    }
  })
}

/**
 * Route one request across the shared surface (rooms + pets + rules).
 * Returns a promise that settles when the response is written.
 */
export function handleGameServer(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: GamesServerContext,
): void | Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const pathname = url.pathname
  if (req.method === 'OPTIONS') {
    preflight(res)
    return
  }
  if (pathname === HEALTH_API_PATH && req.method === 'GET') {
    json(res, 200, { ok: true, protocolVersion: 3 })
    return
  }
  if (!requireAuth(req, res, ctx)) return

  if (pathname === RULES_API_PATH && req.method === 'GET') {
    json(res, 200, { ok: true, rules: ctx.rules })
    return
  }

  if (pathname.startsWith(`${ROOM_API_PREFIX}/`) || pathname === ROOM_API_PREFIX) {
    return routeRoom(req, res, ctx, pathname.slice(ROOM_API_PREFIX.length))
  }
  if (pathname.startsWith(`${PET_API_PREFIX}/`) || pathname === PET_API_PREFIX) {
    return routePet(req, res, ctx, pathname.slice(PET_API_PREFIX.length))
  }
  json(res, 404, { ok: false, error: 'route-not-found' })
  return
}

/** Rooms subtree: list/create, <code>/join/state/members/messages. */
function routeRoom(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: GamesServerContext,
  rest: string,
): void | Promise<void> {
  const parts = rest.replace(/^\/+/, '').split('/').filter(Boolean)
  const [code, action, memberId] = parts

  if (code === undefined) {
    // Collection: GET list (public rooms) / POST create.
    if (req.method === 'GET') {
      json(res, 200, { ok: true, rooms: ctx.rooms.listPublicRooms() })
      return
    }
    if (req.method === 'POST') {
      return readJsonBody(req).then((body) => {
        const record = (typeof body === 'object' && body !== null) ? body as Record<string, unknown> : {}
        const room = ctx.rooms.createRoom({
          name: typeof record.name === 'string' ? record.name : undefined,
          public: record.public !== false,
        })
        json(res, 200, { ok: true, room })
      }, (error) => {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    }
    json(res, 405, { ok: false, error: 'method-not-allowed' })
    return
  }

  if (/^[A-Za-z0-9]{1,8}$/.test(code) === false) {
    json(res, 404, { ok: false, error: 'room-not-found' })
    return
  }

  if (action === 'state' && req.method === 'GET') {
    const room = ctx.rooms.getRoom(code)
    if (room === undefined) {
      json(res, 404, { ok: false, error: 'room-not-found' })
      return
    }
    json(res, 200, { ok: true, room })
    return
  }

  if (action === 'join' && req.method === 'POST') {
    return readJsonBody(req).then((body) => {
      const report = memberReportOf(body)
      const result = ctx.rooms.joinMember(code, report)
      if (!result.ok) {
        json(res, roomErrorStatus(result.error), { ok: false, error: result.error })
        return
      }
      json(res, 200, {
        ok: true,
        room: result.room,
        memberToken: result.memberToken,
      })
    }, (error) => {
      json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    })
  }

  if (action === 'members' && req.method === 'POST') {
    return readJsonBody(req).then((body) => {
      const result = ctx.rooms.heartbeatMember(code, memberReportOf(body), memberTokenOf(req))
      if (!result.ok) {
        json(res, roomErrorStatus(result.error), { ok: false, error: result.error })
        return
      }
      json(res, 200, { ok: true, room: result.room })
    }, (error) => {
      json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    })
  }

  if (action === 'messages' && req.method === 'POST') {
    return readJsonBody(req).then((body) => {
      const record = (typeof body === 'object' && body !== null) ? body as Record<string, unknown> : {}
      const message = (typeof record.message === 'object' && record.message !== null)
        ? record.message as Record<string, unknown>
        : {}
      const result = ctx.rooms.addMessage(code, {
        memberId: typeof message.memberId === 'string' ? message.memberId : '',
        text: typeof message.text === 'string' ? message.text : '',
      }, memberTokenOf(req))
      if (!result.ok) {
        json(res, roomErrorStatus(result.error), { ok: false, error: result.error })
        return
      }
      json(res, 200, { ok: true, room: result.room })
    }, (error) => {
      json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    })
  }

  if (action === 'members' && memberId !== undefined && req.method === 'DELETE') {
    if (normalizeMemberId(memberId) === undefined) {
      json(res, 400, { ok: false, error: 'invalid-member' })
      return
    }
    const result = ctx.rooms.removeMember(code, memberId, memberTokenOf(req))
    if (!result.ok) {
      json(res, roomErrorStatus(result.error), { ok: false, error: result.error })
      return
    }
    json(res, 200, { ok: true, removed: result.removed })
    return
  }

  json(res, 404, { ok: false, error: 'route-not-found' })
  return
}

/** Parse the shared member report envelope used by join and heartbeat. */
function memberReportOf(body: unknown): MemberReport {
  const record = (typeof body === 'object' && body !== null) ? body as Record<string, unknown> : {}
  const member = (typeof record.member === 'object' && record.member !== null)
    ? record.member as Record<string, unknown>
    : {}
  return {
    memberId: typeof member.memberId === 'string' ? member.memberId : '',
    nickname: typeof member.nickname === 'string' ? member.nickname : '',
    tokens: typeof member.tokens === 'number' ? member.tokens : 0,
    crowns: Array.isArray(member.crowns) ? member.crowns as number[] : undefined,
    hats: typeof member.hats === 'number' ? member.hats : undefined,
    phase: typeof member.phase === 'string' ? member.phase : 'idle',
    active: member.active === true,
    petUrl: typeof member.petUrl === 'string' ? member.petUrl : undefined,
    petVersion: typeof member.petVersion === 'number' ? member.petVersion : undefined,
    petVariant: typeof member.petVariant === 'string' ? member.petVariant : undefined,
    size: typeof member.size === 'number' ? member.size : undefined,
  }
}

/** Pets subtree: GET serve image, POST upload (raw bytes), DELETE remove. */
function routePet(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: GamesServerContext,
  rest: string,
): void | Promise<void> {
  const memberId = rest.replace(/^\/+/, '')
  if (memberId === '' || memberId.includes('/')) {
    json(res, 400, { ok: false, error: 'invalid-member' })
    return
  }

  if (req.method === 'GET') {
    const pet = ctx.pets.get(memberId)
    if (pet === undefined) {
      json(res, 404, { ok: false, error: 'pet-not-found' })
      return
    }
    const age = new URL(req.url ?? '/', 'http://localhost').searchParams.get('v')
    res.writeHead(200, {
      'content-type': pet.meta.ext === 'gif' ? 'image/gif' : 'image/png',
      'content-length': pet.buffer.length,
      'cache-control': `public, max-age=${age === null ? 60 : 86_400}`,
      ...CORS_HEADERS,
    })
    res.end(pet.buffer)
    return
  }

  if (req.method === 'POST') {
    const maxBytes = ctx.rules.pet.maxBytes
    return readRawBody(req, maxBytes).then((buffer) => {
      const result = ctx.pets.save(memberId, buffer, ctx.rules.pet)
      if (!result.ok) {
        const status = result.error === 'too-large' ? 413 : 400
        json(res, status, { ok: false, error: result.error })
        return
      }
      json(res, 200, { ok: true, pet: result.meta })
    }, (error) => {
      json(res, error instanceof Error && error.message === 'body-too-large'
        ? 413
        : 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    })
  }

  if (req.method === 'DELETE') {
    const removed = ctx.pets.remove(memberId)
    json(res, 200, { ok: true, removed })
    return
  }

  json(res, 405, { ok: false, error: 'method-not-allowed' })
  return
}
