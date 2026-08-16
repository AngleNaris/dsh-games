/**
 * Games HTTP routes — the browser half talks to the host through plain JSON
 * endpoints under `/api/games/*`. The room family (`/api/games/rooms/*`) is
 * served with permissive CORS so other dsh instances (or plain web pages)
 * can join the same room across origins during the prototype phase.
 * @module @linxin666/dsh-games/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { GamesService } from './service.ts'
import type { MemberReport } from './rooms.ts'

/** Browser-facing base path of the games API. */
export const GAMES_API_PREFIX = '/api/games'

/** Browser-facing base path of the room API family. */
export const ROOM_API_PREFIX = '/api/games/rooms'

/** Write one JSON response. */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Require the method or answer 405. */
function requireMethod(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (req.method === method) return true
  json(res, 405, { ok: false, error: 'method-not-allowed' })
  return false
}

/** Read a JSON request body (bounded). */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('body-too-large'))
        queueMicrotask(() => req.destroy())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid-json'))
      }
    })
    req.on('error', reject)
  })
}

/** One GET JSON route. */
function getRoute(path: string, run: () => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req: IncomingMessage, res: ServerResponse): void => {
      if (!requireMethod(req, res, 'GET')) return
      run().then((value) => json(res, 200, value), (error) => {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    },
  }
}

/** One POST JSON route (body passed through). */
function postRoute(path: string, run: (body: Record<string, unknown>) => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (!requireMethod(req, res, 'POST')) return Promise.resolve()
      return readJsonBody(req).then((body) => {
        const record = (typeof body === 'object' && body !== null) ? body as Record<string, unknown> : {}
        return run(record).then(
          (value) => json(res, 200, value),
          (error) => {
            json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          },
        )
      }, (error) => {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    },
  }
}

/** CORS headers applied to every room-family response (prototype: open relay). */
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type',
} as const

/** Answer a room-family request with CORS + JSON. */
function roomJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
  })
  res.end(JSON.stringify(body))
}

/** Answer a room-family OPTIONS preflight. */
function roomOptions(res: ServerResponse): void {
  res.writeHead(204, CORS_HEADERS)
  res.end()
}

/** Room-family prefix handler: <code>/state, <code>/members, <code>/members/<id>. */
function roomPrefixHandler(service: GamesService): WebRoute {
  return {
    kind: 'prefix',
    path: ROOM_API_PREFIX,
    handler: (req: IncomingMessage, res: ServerResponse): void | Promise<void> => {
      if (req.method === 'OPTIONS') {
        roomOptions(res)
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const rest = url.pathname.slice(ROOM_API_PREFIX.length).replace(/^\/+/, '').split('/').filter(Boolean)
      const [code, action, memberId] = rest
      if (code === undefined || /^[A-Za-z0-9]{1,8}$/.test(code) === false) {
        roomJson(res, 404, { ok: false, error: 'room-not-found' })
        return
      }
      if (action === 'state' && req.method === 'GET') {
        const room = service.rooms().getRoom(code)
        if (room === undefined) {
          roomJson(res, 404, { ok: false, error: 'room-not-found' })
          return
        }
        roomJson(res, 200, { ok: true, room })
        return
      }
      if (action === 'members' && req.method === 'POST') {
        return readJsonBody(req).then((body) => {
          const record = (typeof body === 'object' && body !== null) ? body as Record<string, unknown> : {}
          const member = (typeof record.member === 'object' && record.member !== null)
            ? record.member as Record<string, unknown>
            : {}
          const report: MemberReport = {
            memberId: typeof member.memberId === 'string' ? member.memberId : '',
            nickname: typeof member.nickname === 'string' ? member.nickname : '',
            tokens: typeof member.tokens === 'number' ? member.tokens : 0,
            hats: typeof member.hats === 'number' ? member.hats : 0,
            phase: typeof member.phase === 'string' ? member.phase : 'idle',
          }
          if (report.memberId === '' || report.memberId.length > 64) {
            roomJson(res, 400, { ok: false, error: 'invalid-member' })
            return
          }
          const room = service.rooms().upsertMember(code, report)
          if (room === undefined) {
            roomJson(res, 404, { ok: false, error: 'room-not-found' })
            return
          }
          roomJson(res, 200, { ok: true, room })
        }, (error) => {
          roomJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
        })
      }
      if (action === 'members' && memberId !== undefined && req.method === 'DELETE') {
        if (memberId.length === 0 || memberId.length > 64) {
          roomJson(res, 400, { ok: false, error: 'invalid-member' })
          return
        }
        const removed = service.rooms().removeMember(code, memberId)
        roomJson(res, 200, { ok: true, removed })
        return
      }
      roomJson(res, 404, { ok: false, error: 'route-not-found' })
    },
  }
}

/** Build the full route family for one games service. */
export function makeGamesRoutes(service: GamesService): WebRoute[] {
  return [
    getRoute(`${GAMES_API_PREFIX}/state`, () => service.state()),
    postRoute(`${GAMES_API_PREFIX}/nickname`, (body) => {
      const name = body.name
      if (typeof name !== 'string') return Promise.reject(new Error('invalid-name'))
      return service.setNickname(name)
    }),
    postRoute(`${GAMES_API_PREFIX}/boost`, (body) => {
      const tokens = body.tokens
      if (typeof tokens !== 'number') return Promise.reject(new Error('invalid-boost'))
      return service.boost(tokens)
    }),
    postRoute(`${GAMES_API_PREFIX}/display`, (body) => service.setDisplay({
      ...(typeof body.visible === 'boolean' ? { visible: body.visible } : {}),
      ...(typeof body.size === 'number' ? { size: body.size } : {}),
      ...(typeof body.right === 'number' ? { right: body.right } : {}),
      ...(typeof body.bottom === 'number' ? { bottom: body.bottom } : {}),
    })),
    postRoute(`${GAMES_API_PREFIX}/config`, (body) => service.setConfig({
      ...(typeof body.nickname === 'string' ? { nickname: body.nickname } : {}),
      ...(typeof body.hatTokenStep === 'number' ? { hatTokenStep: body.hatTokenStep } : {}),
      ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
    })),
    postRoute(`${ROOM_API_PREFIX}`, () => Promise.resolve({
      ok: true,
      room: service.rooms().createRoom(),
    })),
    roomPrefixHandler(service),
  ]
}
